// render-md — approach #1: a deterministic, headless progress renderer.
//
//   bun run render-md.ts [projectDir] [--watch]
//
// Derives everything read-only from what the suite already writes
// (.sprint/ logs, review-round files, qa result files) and regenerates
// exactly one file: .sprint/progress-<feature>.md — a mermaid pipeline
// plus ticket table that VS Code's markdown preview live-refreshes.
// No network, no ports, no dependencies beyond bun + node stdlib.

import { existsSync, unlinkSync, watch } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  buildState,
  parseAutopilotLog,
  parseSprintLog,
  qaFilesByTicket,
  qaHint,
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
  lines.push(`Source: \`${state.autopilotLog ?? "?"}\` — derived read-only; do not edit by hand.`);
  lines.push("");

  // waiting on you
  if (complete) {
    lines.push(`## ✅ Run complete`);
  } else if (state.awaiting.length) {
    lines.push(`## ⏸ Waiting on you`);
    lines.push("");
    for (const a of state.awaiting) lines.push(`- ${mdCell(a)}`);
  } else {
    lines.push(`## ▶ Running`);
    lines.push("");
    lines.push(`Nothing waiting on you — autopilot is working.`);
  }
  lines.push("");

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

  // tickets
  lines.push("## Tickets");
  lines.push("");
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
    lines.push("_No tickets yet — architect hasn't filed any._");
  }
  lines.push("");

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

  // raw tail keeps parser drift honest
  lines.push("<details><summary>Raw log tail</summary>");
  lines.push("");
  lines.push("```");
  for (const l of state.rawTail) lines.push(l.replace(/```/g, "'''"));
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");
  return lines.join("\n");
}

// ---- state collection (same discovery rules as the suite) ------------------

export async function collectState(projectDir: string): Promise<{ state?: DashState; message?: string }> {
  const sprintDir = join(projectDir, ".sprint");
  let entries: string[];
  try {
    entries = await readdir(sprintDir);
  } catch {
    return { message: `No .sprint/ directory in ${projectDir} — has autopilot run here?` };
  }

  const candidates: { name: string; mtime: number; text: string }[] = [];
  for (const name of entries) {
    if (!/^autopilot-.*\.md$/.test(name)) continue;
    const path = join(sprintDir, name);
    const [s, text] = await Promise.all([stat(path), readFile(path, "utf8")]);
    candidates.push({ name, mtime: s.mtimeMs, text });
  }
  if (!candidates.length) return { message: `No autopilot log in ${sprintDir}.` };
  candidates.sort((a, b) => b.mtime - a.mtime);
  const active =
    candidates.find((c) => !c.text.trimEnd().endsWith("RUN COMPLETE")) ?? candidates[0];

  const autopilot = parseAutopilotLog(active.text);

  const sprints = [];
  for (const it of autopilot.iterations) {
    if (!it.sprintLog) continue;
    try {
      sprints.push(parseSprintLog(await readFile(join(projectDir, it.sprintLog), "utf8")));
    } catch {
      /* pointer to a missing file — tolerated */
    }
  }

  const roundFiles = entries.filter((n) => /^review-.+-r\d+\.md$/.test(n));
  const knownIds = new Set<string>(autopilot.featureTickets);
  for (const sp of sprints) for (const id of Object.keys(sp.tickets)) knownIds.add(id);
  const qaSignals: QaSignal[] = [];
  for (const [ticket, name] of Object.entries(qaFilesByTicket(entries, knownIds))) {
    let hint: QaSignal["hint"] = "ran";
    try {
      hint = qaHint(await readFile(join(sprintDir, name), "utf8"));
    } catch {
      /* unreadable — existence still counts */
    }
    qaSignals.push({ ticket, path: `.sprint/${name}`, hint });
  }

  return {
    state: buildState({
      autopilot,
      autopilotLogPath: `.sprint/${active.name}`,
      sprints,
      roundFiles,
      qaSignals,
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

    // self-guard: one watcher per project. Autopilot starts us blindly on
    // every run/resume; a live pidfile means this start is a no-op.
    const pidFile = join(sprintDir, ".progress-watch.pid");
    if (existsSync(pidFile)) {
      const pid = Number(await readFile(pidFile, "utf8").catch(() => "0"));
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = pid > 0;
      } catch {
        /* stale pidfile — take over */
      }
      if (alive) {
        console.log(`watcher already running for this project (pid ${pid}) — nothing to do`);
        process.exit(0);
      }
    }
    if (existsSync(sprintDir)) await writeFile(pidFile, String(process.pid));
    const dropPid = () => {
      try {
        if (existsSync(pidFile)) unlinkSync(pidFile);
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
          writeFile(pidFile, String(process.pid)).catch(() => {});
          schedule();
          attach();
        }
      }, 2000);
    }
  }
}
