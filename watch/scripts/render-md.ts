// render-md — approach #1: a deterministic, headless progress renderer.
//
//   bun run render-md.ts [projectDir] [--watch]
//
// Derives everything read-only from what the suite already writes
// (.sprint/ logs, review-round files, qa result files) and regenerates
// exactly one file: .sprint/progress-<feature>.md — a mermaid pipeline
// plus ticket table that VS Code's markdown preview live-refreshes.
// No network, no ports, no dependencies beyond bun + node stdlib.

import { existsSync, readFileSync, unlinkSync, watch } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  buildSprintState,
  buildState,
  parseAutopilotLog,
  parseSprintLog,
  qaFilesByTicket,
  qaHint,
  stripStamp,
  type DashState,
  type QaSignal,
  type StageStatus,
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

// ---- rendering -------------------------------------------------------------

const LOOP = ["shape", "design-ui", "architect", "plan-sprint", "sprint", "qa", "retro"];

const STATE_BADGE: Record<string, string> = {
  "qa-pass": "🟢 qa-pass",
  merged: "🟢 merged",
  "ready-to-merge": "🟡 ready-to-merge",
  parked: "🟡 parked",
  blocked: "🟠 blocked",
  failed: "🟠 failed",
  "qa-fail": "🔴 qa-fail",
  "in-progress": "🔵 in-progress",
  pending: "⚪ pending",
  deferred: "⚪ deferred",
};
const badge = (state: string): string =>
  STATE_BADGE[state] ?? (state.startsWith("in-review") ? `🔵 ${state}` : `⚪ ${state}`);

export function renderMarkdown(state: DashState): string {
  return state.kind === "sprint" ? renderSprint(state) : renderAutopilot(state);
}

/** Waiting/running/complete panel — the same three states in both views. */
function waitingSection(state: DashState, runningNote: string): string[] {
  const lines: string[] = [];
  if (state.run === "complete") {
    lines.push(`## ✅ Run complete`);
  } else if (state.awaiting.length) {
    lines.push(`## ⏸ Waiting on you`);
    lines.push("");
    for (const a of state.awaiting) lines.push(`- ${mdCell(a)}`);
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
    for (const t of state.tickets) {
      const pr = t.pr ? `#${t.pr.number}` : "—";
      lines.push(
        `| \`${mdCell(t.id)}\` | ${badge(t.state)} | ${pr} | ${t.reviewRounds ?? "—"} | ${t.qa ?? "—"} | ${mdCell(t.detail ?? "")} |`,
      );
    }
  } else {
    lines.push(emptyNote);
  }
  lines.push("");
  return lines;
}

function decisionsSection(state: DashState): string[] {
  if (!state.decisions.length) return [];
  const lines: string[] = ["## Decisions", ""];
  for (const d of state.decisions) lines.push(`- ${mdCell(d)}`);
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

function renderAutopilot(state: DashState): string {
  const lines: string[] = [];
  const stopped = state.run === "stopped";
  const complete = state.run === "complete";

  lines.push(`# Autopilot progress — ${mdCell(state.feature ?? "?")}`);
  lines.push("");
  const stage = state.currentStage
    ? `${state.currentStage.name}${state.currentStage.inferred ? " *(inferred)*" : ""}`
    : "?";
  lines.push(
    `**Run:** ${state.run} · **Mode:** ${mdCell(state.mode ?? "?")}` +
      (complete ? "" : ` · **Stage:** ${stage}`) +
      ` · _updated ${new Date(state.generatedAt).toLocaleTimeString()}_`,
  );
  lines.push("");
  lines.push(`Source: \`${state.sourceLog ?? "?"}\` — derived read-only; do not edit by hand.`);
  lines.push("");

  lines.push(...waitingSection(state, `Nothing waiting on you — autopilot is working.`));

  // pipeline diagram: groundwork + the CURRENT iteration's stages
  const lastIter = state.iterations[state.iterations.length - 1];
  const stageStatus = new Map<string, StageStatus>();
  for (const g of state.groundwork) stageStatus.set(g.stage, g.status);
  if (lastIter) for (const [s, st] of Object.entries(lastIter.stages)) stageStatus.set(s, st);

  const nodes: string[] = [];
  const classes: Record<string, string[]> = { done: [], skipped: [], active: [], waiting: [], pending: [] };
  LOOP.forEach((name, i) => {
    const id = `s${i}`;
    const st = stageStatus.get(name);
    const isCurrent = !complete && state.currentStage?.name === name;
    let cls: string;
    let mark = "";
    if (isCurrent && stopped) {
      cls = "waiting";
      mark = " ⏸";
    } else if (isCurrent || st === "started") {
      cls = "active";
      mark = " ●";
    } else if (st === "complete") {
      cls = "done";
      mark = " ✓";
    } else if (st === "skipped") {
      cls = "skipped";
      mark = " (skipped)";
    } else {
      cls = "pending";
    }
    let label = name + mark;
    if (name === "plan-sprint" && lastIter?.sprint) label = `${name} ${mark.trim()} ${lastIter.sprint}`.trim();
    nodes.push(`${id}["${mermaidLabel(label)}"]`);
    classes[cls].push(id);
  });
  const endCls = complete ? "done" : "pending";
  nodes.push(`s7{{"${complete ? "complete ✓" : "done?"}"}}`);
  classes[endCls].push("s7");

  lines.push("## Pipeline");
  if (state.iterations.length > 1) {
    lines.push("");
    lines.push(`_Iteration ${state.iterations.length} shown; earlier iterations below._`);
  }
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart LR");
  lines.push(`    ${nodes.join(" --> ")}`);
  for (const [cls, ids] of Object.entries(classes)) {
    if (ids.length) lines.push(`    class ${ids.join(",")} ${cls}`);
  }
  lines.push(`    classDef done fill:#0ca30c22,stroke:#0ca30c`);
  lines.push(`    classDef active fill:#4477cc22,stroke:#4477cc,stroke-width:2px`);
  lines.push(`    classDef waiting fill:#fab21922,stroke:#fab219,stroke-width:2px`);
  lines.push(`    classDef skipped fill:transparent,stroke:#8a8a84,stroke-dasharray:4`);
  lines.push(`    classDef pending fill:transparent,stroke:#8a8a84`);
  lines.push("```");
  lines.push("");

  lines.push(...ticketTable(state, "_No tickets yet — architect hasn't filed any._"));

  // iteration history
  if (state.iterations.length > 1) {
    lines.push("## Iterations");
    lines.push("");
    state.iterations.forEach((it, i) => {
      const stages = Object.entries(it.stages)
        .map(([s, st]) => `${s} ${st === "complete" ? "✓" : st === "skipped" ? "(skipped)" : "●"}`)
        .join(" · ");
      lines.push(
        `- **${mdCell(it.sprint ?? `iteration ${i + 1}`)}** — ${stages}${it.tickets.length ? ` — ${it.tickets.map((t) => `\`${mdCell(t)}\``).join(" ")}` : ""}`,
      );
    });
    lines.push("");
  }

  lines.push(...decisionsSection(state));
  lines.push(...rawTailSection(state));
  return lines.join("\n");
}

// ---- sprint view -----------------------------------------------------------

/** A standalone /sprint run has no feature pipeline to draw, so the strip
 *  is the run's own funnel: planned → working → ready → merged, with parked
 *  tickets hanging off it. Counts come from the ticket rows, so the strip
 *  can never disagree with the table below it. */
function renderSprint(state: DashState): string {
  const lines: string[] = [];
  const inState = (...names: string[]) =>
    state.tickets.filter((t) => names.some((n) => t.state === n || t.state.startsWith(n)));
  const working = inState("in-progress", "in-review");
  const ready = inState("ready-to-merge");
  const merged = inState("merged", "qa-pass", "qa-fail");
  const stuck = inState("parked", "blocked", "failed");
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
      ` · _updated ${new Date(state.generatedAt).toLocaleTimeString()}_`,
  );
  lines.push("");
  lines.push(`Source: \`${state.sourceLog ?? "?"}\` — derived read-only; do not edit by hand.`);
  lines.push("");

  lines.push(...waitingSection(state, `Nothing waiting on you — implementers are working.`));

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
const NOT_A_SPRINT_LOG = /^(?:autopilot-|progress-|\.)/;
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

/** Sprint logs an autopilot log points at (`STAGE: sprint started → path`)
 *  are that feature run's, not standalone runs — they must not outrank a
 *  finished autopilot log's own view. */
function referencedSprintLogs(autopilotTexts: string[]): Set<string> {
  const refs = new Set<string>();
  for (const text of autopilotTexts) {
    for (const raw of text.split("\n")) {
      const line = stripStamp(raw.trim());
      const m = line.match(/^STAGE:\s+sprint\s+\S+\s*(?:→|->)\s*(\S+)/);
      if (m) refs.add(basename(m[1]));
    }
  }
  return refs;
}

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

  const autopilotLogs: LogFile[] = [];
  const sprintLogs: LogFile[] = [];
  for (const name of entries) {
    try {
      if (/^autopilot-.*\.md$/.test(name)) {
        autopilotLogs.push(await read(name));
        continue;
      }
      if (!name.endsWith(".md") || NOT_A_SPRINT_LOG.test(name) || ROUND_FILE.test(name)) continue;
      const f = await read(name);
      if (looksLikeSprintLog(f.text)) sprintLogs.push(f);
    } catch {
      /* unreadable, or a directory named *.md — not a log, keep going */
    }
  }
  autopilotLogs.sort(newestFirst);
  sprintLogs.sort(newestFirst);

  const roundFiles = entries.filter((n) => ROUND_FILE.test(n));
  // run logs out of the qa scan: a sprint log named qa-<something>.md must
  // not double as a QA result file for a bogus ticket
  const logNames = new Set([...autopilotLogs, ...sprintLogs].map((f) => f.name));
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

  // Precedence: a live autopilot run owns the view; otherwise a live
  // standalone sprint run does — a finished autopilot log must not keep
  // rendering itself over a sprint running after it. Finished runs are
  // only the fallback, autopilot first.
  const referenced = referencedSprintLogs(autopilotLogs.map((f) => f.text));
  const standalone = sprintLogs.filter((f) => !referenced.has(f.name));
  const activeAutopilot = autopilotLogs.find((f) => isActive(f.text));
  // A live run is one still being appended to, so it is necessarily the
  // NEWEST log here — only that one can be active. Searching all of them for
  // a missing terminator instead let an abandoned run (stopped on a gate, no
  // RUN COMPLETE ever appended) outrank every run that finished after it, for
  // good: one such log pinned a project's view to a three-week-old sprint.
  const newestSprint = standalone[0];
  const activeSprint = newestSprint && isActive(newestSprint.text) ? newestSprint : undefined;

  const chosenAutopilot = activeAutopilot ?? (activeSprint ? undefined : autopilotLogs[0]);
  if (chosenAutopilot) {
    const autopilot = parseAutopilotLog(chosenAutopilot.text);
    // A parse gap must not collapse every run onto one "progress-run.md":
    // the log's own basename carries the feature name autopilot named it by.
    if (!autopilot.feature) {
      const m = chosenAutopilot.name.match(/^autopilot-(.+)\.md$/);
      if (m) autopilot.feature = m[1];
    }

    const sprints = [];
    for (const it of autopilot.iterations) {
      if (!it.sprintLog) continue;
      try {
        sprints.push(parseSprintLog(await readFile(join(projectDir, it.sprintLog), "utf8")));
      } catch {
        /* pointer to a missing file — tolerated */
      }
    }

    const knownIds = new Set<string>(autopilot.featureTickets);
    for (const sp of sprints) for (const id of Object.keys(sp.tickets)) knownIds.add(id);

    return {
      state: buildState({
        autopilot,
        autopilotLogPath: `.sprint/${chosenAutopilot.name}`,
        sprints,
        roundFiles,
        qaSignals: await qaSignals(knownIds),
        now: new Date(),
      }),
    };
  }

  // no active autopilot log here means there are no autopilot logs at all
  // (a finished one would have been chosen above), so standalone === sprintLogs
  const chosenSprint = activeSprint ?? standalone[0];
  if (!chosenSprint) {
    return { message: `No autopilot or sprint run log in ${sprintDir}.` };
  }
  // A re-run (`<id>-2.md`) supersedes its predecessor's view, so render the
  // highest run of the chosen log's family.
  const entrySet = new Set(entries);
  const runOf = new Map(sprintLogs.map((f) => [f.name, sprintIdAndRun(f.name, entrySet)]));
  const { id } = runOf.get(chosenSprint.name)!;
  const family = sprintLogs
    .filter((f) => runOf.get(f.name)!.id === id)
    .sort((a, b) => runOf.get(b.name)!.run - runOf.get(a.name)!.run);
  const winner = family[0]; // chosenSprint is in its own family, so never empty
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

async function generate(projectDir: string): Promise<string | undefined> {
  const { state, message } = await collectState(projectDir);
  if (!state) {
    console.error(message);
    return undefined;
  }
  const outName = `progress-${safeFeatureName(state.feature)}.md`;
  const outPath = join(projectDir, ".sprint", outName);
  const next = renderMarkdown(state);
  try {
    const prev = await readFile(outPath, "utf8");
    if (stripTimestamps(prev) === stripTimestamps(next)) return outPath; // no churn
  } catch {
    /* first write */
  }
  await writeFile(outPath, next);
  return outPath;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const watchMode = argv.includes("--watch");
  const projectDir = resolve(argv.find((a) => !a.startsWith("--")) ?? ".");

  const out = await generate(projectDir);
  if (out) console.log(`wrote ${out}`);

  if (watchMode) {
    const sprintDir = join(projectDir, ".sprint");

    // self-guard: one watcher per project, newest wins. Autopilot starts us
    // blindly on every run/resume, and an older watcher may be attached but
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

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const p = await generate(projectDir);
        if (p) console.log(`${new Date().toLocaleTimeString()} regenerated ${basename(p)}`);
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
