// render-md — approach #1: a deterministic, headless progress renderer.
//
//   bun run render-md.ts [projectDir] [--watch]
//
// Derives everything read-only from what the suite already writes
// (.sprint/ logs, review-round files, qa result files) and regenerates
// .sprint/progress-<sprint-id>.md — a mermaid progress strip plus ticket
// table that VS Code's markdown preview live-refreshes — and a copy at the
// fixed path .sprint/progress-current.md, so one open preview always shows
// whichever run is current.
// No network, no ports, no dependencies beyond bun + node stdlib.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, watch } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  buildSprintState,
  parseSprintLog,
  qaFilesByTicket,
  qaHint,
  stripStamp,
  type DashState,
  type QaSignal,
} from "./parse";

// ---- sanitizers (log content is model-written text, not trusted markup) ----

/** Feature name → safe output basename fragment. Strips path separators and
 *  anything else that could steer the write path. */
export function safeFeatureName(feature: string | undefined): string {
  const cleaned = (feature ?? "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
  return cleaned || "run";
}

/** Text embedded in a mermaid node label. */
export function mermaidLabel(text: string): string {
  return text.replace(/["`;{}[\]<>\\]/g, "'").replace(/\s+/g, " ").trim();
}

/** Text embedded in a markdown table cell. */
export function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\s+/g, " ").trim();
}

/** `YYYY-MM-DD HH:MM` local — a bare time can't tell a file three days
 *  stale from one written a minute ago. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** origin remote → `https://github.com/owner/repo`, or undefined for
 *  anything that isn't GitHub (PR links would be guesses there). */
export function githubUrl(remote: string): string | undefined {
  const m = remote.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : undefined;
}

function repoUrlOf(projectDir: string): string | undefined {
  try {
    const remote = execFileSync("git", ["-C", projectDir, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return githubUrl(remote);
  } catch {
    return undefined;
  }
}

// ---- rendering -------------------------------------------------------------

const STATE_BADGE: Record<string, string> = {
  "qa-pass": "🟢 qa-pass",
  merged: "🟢 merged",
  "ready-to-merge": "🟡 ready-to-merge",
  parked: "🟡 parked",
  "merge-skipped": "🟠 merge-skipped",
  blocked: "🟠 blocked",
  failed: "🟠 failed",
  "qa-fail": "🔴 qa-fail",
  "in-progress": "🔵 in-progress",
  pending: "⚪ pending",
};
const badge = (state: string): string =>
  STATE_BADGE[state] ?? (state.startsWith("in-review") ? `🔵 ${state}` : `⚪ ${state}`);

/** Waiting/running/complete panel. */
function waitingSection(state: DashState, runningNote: string): string[] {
  const lines: string[] = [];
  if (state.run === "complete") {
    lines.push(`## ✅ Run complete`);
  } else if (state.awaiting.length) {
    lines.push(`## ⏸ Waiting on you`);
    lines.push("");
    for (const a of state.awaiting) lines.push(`- ${mdCell(a)}`);
    if (state.stopNote) {
      lines.push("");
      lines.push(`> **Why it stopped:** ${mdCell(state.stopNote)}`);
    }
  } else {
    lines.push(`## ▶ Running`);
    lines.push("");
    lines.push(runningNote);
  }
  lines.push("");
  return lines;
}

function ticketTable(state: DashState, emptyNote: string): string[] {
  const lines: string[] = ["## Tickets", ""];
  if (state.tickets.length) {
    lines.push("| Ticket | State | PR | Rounds | QA | Detail |");
    lines.push("|---|---|---|---|---|---|");
    // links are relative to the progress file, which sits in .sprint/
    // beside the round and qa files it points at
    const link = (text: string, href?: string) => (href ? `[${text}](${href})` : text);
    for (const t of state.tickets) {
      const pr = t.pr
        ? link(`#${t.pr.number}`, state.repoUrl && `${state.repoUrl}/pull/${t.pr.number}`)
        : "—";
      const rounds = t.reviewRounds ? link(String(t.reviewRounds), t.reviewFile) : "—";
      const qa = t.qa ? link(t.qa, t.qaFile && basename(t.qaFile)) : "—";
      lines.push(
        `| \`${mdCell(t.id)}\` | ${badge(t.state)} | ${pr} | ${rounds} | ${qa} | ${mdCell(t.detail ?? "")} |`,
      );
    }
  } else {
    lines.push(emptyNote);
  }
  lines.push("");
  return lines;
}

const RECENT_DECISIONS = 5;

/** Newest few in view, the rest folded — a long run's decisions otherwise
 *  bury the raw tail under a wall of text. Order stays chronological. */
function decisionsSection(state: DashState): string[] {
  if (!state.decisions.length) return [];
  const lines: string[] = ["## Decisions", ""];
  const older = state.decisions.slice(0, -RECENT_DECISIONS);
  const recent = state.decisions.slice(-RECENT_DECISIONS);
  if (older.length) {
    lines.push(`<details><summary>${older.length} earlier</summary>`, "");
    for (const d of older) lines.push(`- ${mdCell(d)}`);
    lines.push("", "</details>", "");
  }
  for (const d of recent) lines.push(`- ${mdCell(d)}`);
  lines.push("");
  return lines;
}

/** raw tail keeps parser drift honest */
function rawTailSection(state: DashState): string[] {
  const lines: string[] = ["<details><summary>Raw log tail</summary>", "", "```"];
  for (const l of state.rawTail) lines.push(l.replace(/```/g, "'''"));
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");
  return lines;
}

// ---- sprint view -----------------------------------------------------------

/** A standalone /sprint run has no feature pipeline to draw, so the strip
 *  is the run's own funnel: planned → working → ready → merged, with parked
 *  tickets hanging off it. Counts come from the ticket rows, so the strip
 *  can never disagree with the table below it. */
export function renderMarkdown(state: DashState): string {
  const lines: string[] = [];
  const inState = (...names: string[]) =>
    state.tickets.filter((t) => names.some((n) => t.state === n || t.state.startsWith(n)));
  const working = inState("in-progress", "in-review");
  const ready = inState("ready-to-merge");
  const merged = inState("merged", "qa-pass", "qa-fail");
  // merge-skipped too: otherwise it falls through to pending and reads
  // as "not dispatched yet"
  const stuck = inState("parked", "blocked", "failed", "merge-skipped");
  const pending = state.tickets.length - working.length - ready.length - merged.length - stuck.length;

  const runNo = state.sprintRun && state.sprintRun > 1 ? ` (run ${state.sprintRun})` : "";
  // a log that titled itself names the run better than its filename family
  // ever can — `<sprint-id>` is only ever the family, never the section run
  const heading = state.title ?? `${state.feature ?? "?"}${runNo}`;
  lines.push(`# Sprint progress — ${mdCell(heading)}`);
  lines.push("");
  lines.push(
    `**Run:** ${state.run}` +
      (state.mode ? ` · **Mode:** ${mdCell(state.mode)}` : "") +
      ` · **Tickets:** ${state.tickets.length}` +
      ` · _updated ${stamp(state.generatedAt)}_`,
  );
  lines.push("");
  lines.push(`Source: \`${state.sourceLog ?? "?"}\` — derived read-only; do not edit by hand.`);
  lines.push("");

  lines.push(...waitingSection(state, `Nothing waiting on you — implementers are working.`));
  if (state.proposed?.length) {
    // not a stop: the loop keeps running; these wait for my triage whenever
    lines.push(`## 📝 Proposed for your triage`, "");
    for (const p of state.proposed) lines.push(`- ${mdCell(p)}`);
    lines.push("");
  }

  const strip = [
    { id: "n0", label: `planned ${state.tickets.length}`, n: state.tickets.length, cls: "pending" },
    { id: "n1", label: `working ${working.length}`, n: working.length, cls: "active" },
    { id: "n2", label: `ready to merge ${ready.length}`, n: ready.length, cls: "waiting" },
    { id: "n3", label: `merged ${merged.length}`, n: merged.length, cls: "done" },
  ];
  lines.push("## Progress");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart LR");
  lines.push(`    ${strip.map((c) => `${c.id}["${mermaidLabel(c.label)}"]`).join(" --> ")}`);
  if (stuck.length) lines.push(`    n4["${mermaidLabel(`parked ${stuck.length}`)}"]`);
  for (const c of strip) lines.push(`    class ${c.id} ${c.n ? c.cls : "pending"}`);
  if (stuck.length) lines.push(`    class n4 waiting`);
  lines.push(`    classDef done fill:#0ca30c22,stroke:#0ca30c`);
  lines.push(`    classDef active fill:#4477cc22,stroke:#4477cc,stroke-width:2px`);
  lines.push(`    classDef waiting fill:#fab21922,stroke:#fab219,stroke-width:2px`);
  lines.push(`    classDef pending fill:transparent,stroke:#8a8a84`);
  lines.push("```");
  if (pending > 0) {
    lines.push("");
    lines.push(`_${pending} not dispatched yet._`);
  }
  lines.push("");

  lines.push(...ticketTable(state, "_No tickets yet — the run log has no ORDER: line._"));

  if (state.waves?.length) {
    lines.push("## Waves");
    lines.push("");
    state.waves.forEach((w, i) => {
      lines.push(`- **wave ${i + 1}** — ${w.map((t) => `\`${mdCell(t)}\``).join(" ")}`);
    });
    lines.push("");
  }

  lines.push(...decisionsSection(state));
  lines.push(...rawTailSection(state));
  return lines.join("\n");
}

// ---- state collection (same discovery rules as the suite) ------------------

/** A sprint run log has no name convention (`<sprint-id>.md` is whatever
 *  the sprint is called), so it is identified by content: /sprint writes
 *  `ORDER:` as the log's first entry, optionally under a `# ...` heading
 *  naming the run. Only names that are unambiguously something else are
 *  excluded up front — a sprint legitimately named `qa-hardening` must
 *  still be found, so qa-* files are ruled out by the content check, not
 *  by prefix. */
const NOT_A_SPRINT_LOG = /^(?:progress-|\.)/;
const ROUND_FILE = /^review-.+-r\d+\.md$/;

export function looksLikeSprintLog(text: string): boolean {
  for (const raw of text.split("\n")) {
    const line = stripStamp(raw.trim());
    if (!line) continue;
    // a heading may title the run above ORDER:; anything else may not
    if (/^#{1,6}\s/.test(line)) continue;
    return /^ORDER:/.test(line);
  }
  return false;
}

/** `<sprint-id>.md`, then `<sprint-id>-2.md`, `-3.md` for re-runs of the
 *  same sprint (sprint's own RUN COMPLETE rule). `sprint-3.md` is itself
 *  a `-N` name, so a suffix counts as a run number only when the log it
 *  would be a re-run of is actually present. Re-runs then share one
 *  progress file instead of spawning one per suffix. */
export function sprintIdAndRun(
  name: string,
  siblings: Iterable<string>,
): { id: string; run: number } {
  const sibs = siblings instanceof Set ? siblings : new Set(siblings);
  const base = name.replace(/\.md$/, "");
  const m = base.match(/^(.+)-(\d+)$/);
  if (m && sibs.has(`${m[1]}.md`)) {
    return { id: m[1], run: Number(m[2]) };
  }
  return { id: base, run: 1 };
}

const isActive = (text: string): boolean => !text.trimEnd().endsWith("RUN COMPLETE");

interface LogFile {
  name: string;
  mtime: number;
  text: string;
}

export async function collectState(projectDir: string): Promise<{ state?: DashState; message?: string }> {
  const sprintDir = join(projectDir, ".sprint");
  let entries: string[];
  try {
    entries = await readdir(sprintDir);
  } catch {
    return { message: `No .sprint/ directory in ${projectDir} — has a run started here?` };
  }

  const read = async (name: string): Promise<LogFile> => {
    const path = join(sprintDir, name);
    const [st, text] = await Promise.all([stat(path), readFile(path, "utf8")]);
    return { name, mtime: st.mtimeMs, text };
  };
  const newestFirst = (a: LogFile, b: LogFile) => b.mtime - a.mtime;

  const sprintLogs: LogFile[] = [];
  for (const name of entries) {
    try {
      if (!name.endsWith(".md") || NOT_A_SPRINT_LOG.test(name) || ROUND_FILE.test(name)) continue;
      const f = await read(name);
      if (looksLikeSprintLog(f.text)) sprintLogs.push(f);
    } catch {
      /* unreadable, or a directory named *.md — not a log, keep going */
    }
  }
  sprintLogs.sort(newestFirst);

  const roundFiles = entries.filter((n) => ROUND_FILE.test(n));
  // run logs out of the qa scan: a sprint log named qa-<something>.md must
  // not double as a QA result file for a bogus ticket
  const logNames = new Set(sprintLogs.map((f) => f.name));
  const qaEntries = entries.filter((n) => !logNames.has(n));
  const qaSignals = async (knownIds: Iterable<string>): Promise<QaSignal[]> => {
    const out: QaSignal[] = [];
    for (const [ticket, name] of Object.entries(qaFilesByTicket(qaEntries, knownIds))) {
      let hint: QaSignal["hint"] = "ran";
      try {
        hint = qaHint(await readFile(join(sprintDir, name), "utf8"));
      } catch {
        /* unreadable — existence still counts */
      }
      out.push({ ticket, path: `.sprint/${name}`, hint });
    }
    return out;
  };

  // A live run is one still being appended to, so it is necessarily the
  // NEWEST log here — only that one can be active. Searching all of them for
  // a missing terminator instead let an abandoned run (stopped on a gate, no
  // RUN COMPLETE ever appended) outrank every run that finished after it, for
  // good: one such log pinned a project's view to a three-week-old sprint.
  const chosenSprint = sprintLogs[0];
  if (!chosenSprint) {
    return { message: `No sprint run log in ${sprintDir}.` };
  }
  const activeSprint = isActive(chosenSprint.text) ? chosenSprint : undefined;
  // A re-run (`<id>-2.md`) supersedes its predecessor's view, so render the
  // highest run of the chosen log's family.
  const entrySet = new Set(entries);
  const runOf = new Map(sprintLogs.map((f) => [f.name, sprintIdAndRun(f.name, entrySet)]));
  const { id } = runOf.get(chosenSprint.name)!;
  const family = sprintLogs
    .filter((f) => runOf.get(f.name)!.id === id)
    .sort((a, b) => runOf.get(b.name)!.run - runOf.get(a.name)!.run);
  // A live run outranks a higher-numbered sibling: two sessions can run the
  // same sprint in parallel, and the one still appending is the one to show.
  const winner = activeSprint ?? family[0]; // chosenSprint is in its own family, so never empty
  const sprint = parseSprintLog(winner.text);

  return {
    state: buildSprintState({
      sprint,
      sprintId: id,
      sprintLogPath: `.sprint/${winner.name}`,
      sprintRun: runOf.get(winner.name)!.run,
      roundFiles,
      qaSignals: await qaSignals([...sprint.order, ...Object.keys(sprint.tickets)]),
      now: new Date(),
    }),
  };
}

// ---- CLI + watch -----------------------------------------------------------

const stripTimestamps = (md: string): string => md.replace(/_updated [^_]+_/g, "");

/** Fixed-name mirror of the chosen run's progress file. The `progress-`
 *  prefix keeps it out of log discovery and the watcher's retrigger check,
 *  and can't collide with a sprint log's name. */
export const CURRENT_NAME = "progress-current.md";

/** Write unless only the `_updated_` stamp would change — no churn. */
async function writeIfChanged(path: string, next: string): Promise<void> {
  try {
    const prev = await readFile(path, "utf8");
    if (stripTimestamps(prev) === stripTimestamps(next)) return;
  } catch {
    /* first write */
  }
  await writeFile(path, next);
}

export async function generate(
  projectDir: string,
  repoUrl: string | undefined,
): Promise<{ path: string; run: DashState["run"] } | undefined> {
  const { state, message } = await collectState(projectDir);
  if (!state) {
    console.error(message);
    return undefined;
  }
  state.repoUrl = repoUrl;
  const outName = `progress-${safeFeatureName(state.feature)}.md`;
  const outPath = join(projectDir, ".sprint", outName);
  const next = renderMarkdown(state);
  await writeIfChanged(outPath, next);
  if (outName !== CURRENT_NAME) await writeIfChanged(join(projectDir, ".sprint", CURRENT_NAME), next);
  return { path: outPath, run: state.run };
}

/** A stopped run can resume in the same session without restarting us,
 *  so only a long silence ends a watch
 *  that isn't complete. Every run start or resume starts a fresh watcher. */
const IDLE_EXIT_MS = 24 * 60 * 60 * 1000;

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const watchMode = argv.includes("--watch");
  const projectDir = resolve(argv.find((a) => !a.startsWith("--")) ?? ".");

  const repoUrl = repoUrlOf(projectDir);
  const out = await generate(projectDir, repoUrl);
  if (out) console.log(`wrote ${out.path}`);

  // nothing left to redraw: a completed run's log is never appended to
  // again, and the next run starts its own watcher
  if (watchMode && out?.run === "complete") {
    console.log("run complete — not watching");
  } else if (watchMode) {
    const sprintDir = join(projectDir, ".sprint");

    // self-guard: one watcher per project, newest wins. A run starts us
    // blindly on every start/resume, and an older watcher may be attached but
    // useless — running the code as it was at ITS start (bun loads once), or
    // deaf after sleep/fs churn — while a live pid alone can't tell healthy
    // from stale. So the fresh start takes over instead of deferring.
    const pidFile = join(sprintDir, ".progress-watch.pid");
    const claimPidfile = async () => {
      const prev = Number(await readFile(pidFile, "utf8").catch(() => "0"));
      if (prev > 0 && prev !== process.pid) {
        try {
          // SIGKILL: a predecessor's exit handler may unlink the pidfile
          // unconditionally, which would erase the claim we're about to write
          process.kill(prev, "SIGKILL");
          console.log(`took over from previous watcher (pid ${prev})`);
        } catch {
          /* already gone */
        }
      }
      await writeFile(pidFile, String(process.pid));
    };
    if (existsSync(sprintDir)) await claimPidfile();
    const dropPid = () => {
      try {
        // remove only our own claim — a successor may have taken over
        if (readFileSync(pidFile, "utf8") === String(process.pid)) unlinkSync(pidFile);
      } catch {
        /* best-effort */
      }
    };
    process.on("exit", dropPid);
    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));

    let idle: ReturnType<typeof setTimeout> | undefined;
    const armIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        console.log(`no .sprint/ activity for ${IDLE_EXIT_MS / 3600000}h — watcher exiting`);
        process.exit(0);
      }, IDLE_EXIT_MS);
    };
    armIdle();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      armIdle();
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const r = await generate(projectDir, repoUrl);
        if (!r) return;
        console.log(`${stamp(new Date().toISOString())} regenerated ${basename(r.path)}`);
        if (r.run === "complete") {
          console.log("run complete — watcher exiting");
          process.exit(0);
        }
      }, 300);
    };
    const attach = () => {
      watch(sprintDir, (_event, filename) => {
        // our own output and pidfile must not retrigger us
        if (filename && (filename.startsWith("progress-") || filename.startsWith(".progress-watch"))) return;
        schedule();
      });
      console.log(`watching ${sprintDir} — Ctrl-C to stop`);
    };
    if (existsSync(sprintDir)) {
      attach();
    } else {
      console.log(`waiting for ${sprintDir} to appear…`);
      const poll = setInterval(() => {
        if (existsSync(sprintDir)) {
          clearInterval(poll);
          claimPidfile().catch(() => {});
          schedule();
          attach();
        }
      }, 2000);
    }
  }
}
