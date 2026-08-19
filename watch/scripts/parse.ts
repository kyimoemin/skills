// Pure parsers for the dev-workflow suite's log conventions.
// No fs, no network — server.ts injects file contents and signals.
//
// The logs are model-written prose conventions, not machine output:
// every parser matches by prefix/regex and ignores lines it doesn't
// recognize. Drift shows up in the dashboard's raw-tail panel instead
// of crashing the parse.

export type StageStatus = "complete" | "skipped" | "started";

export interface StageEntry {
  stage: string;
  status: StageStatus;
  artifact?: string;
  ui?: boolean; // shape only: the brief's Surface line
  tickets?: string[]; // architect only: the feature's authoritative list
}

export interface Iteration {
  sprint?: string; // e.g. "sprint-3"
  sprintLog?: string; // e.g. ".sprint/sprint-3.md"
  tickets: string[];
  stages: Record<string, StageStatus>;
  qaRaw?: string; // qa STAGE line payload, verbatim
  mergedTickets?: string[];
}

export interface Deferral {
  tickets: string[];
  reason?: string;
}

export interface AutopilotParse {
  feature?: string;
  mode?: string;
  run: "running" | "stopped" | "complete";
  groundwork: StageEntry[];
  iterations: Iteration[];
  featureTickets: string[];
  qaPassed: string[];
  deferred: Deferral[];
  awaiting: string[]; // current only — cleared by any later line
  answers: string[];
  currentStage: { name: string; inferred: boolean } | null;
  rawTail: string[];
}

export interface TicketEvents {
  id: string;
  dispatched: boolean;
  returned?: "complete" | "blocked" | "failed";
  blockedReason?: string;
  parked: boolean;
  dependsOn?: string;
  mergedInLog: boolean;
  pr?: number;
  reviewRounds?: number;
  headSha?: string;
  readyToMerge: boolean;
  answers: string[];
}

export interface SprintParse {
  tickets: Record<string, TicketEvents>;
  decisions: string[];
  run: "running" | "stopped" | "complete";
  stoppedOn?: string; // text after "RUN STOPPED at/awaiting:"
  order: string[]; // the ORDER: line — the run's planned ticket list
  serial: boolean; // ORDER: line ends "(serial)"
  waves: string[][]; // WAVE: lines, in dispatch order
  rawTail: string[];
}

export interface PrInfo {
  number: number;
  url?: string;
  state?: string; // OPEN | MERGED | CLOSED
  mergeable?: string;
  ci?: string; // green | red | pending | unknown
  error?: string;
}

export interface QaSignal {
  ticket: string;
  path: string;
  hint: "pass" | "fail" | "ran";
}

export interface TicketState {
  id: string;
  state: string;
  detail?: string;
  pr?: PrInfo;
  reviewRounds?: number;
  qa?: string;
  qaFile?: string;
}

export interface DashState {
  kind: "autopilot" | "sprint";
  feature?: string; // autopilot: feature name; sprint: sprint id
  mode?: string;
  run: "running" | "stopped" | "complete";
  awaiting: string[];
  groundwork: StageEntry[];
  iterations: Iteration[];
  featureTickets: string[];
  tickets: TicketState[];
  currentStage: { name: string; inferred: boolean } | null;
  decisions: string[];
  rawTail: string[];
  sourceLog?: string; // the log this view was derived from
  waves?: string[][]; // sprint kind only
  sprintRun?: number; // sprint kind only: the -N suffix, 1 when unsuffixed
  generatedAt: string;
}

const TICKET_RE = /^[A-Za-z][\w.]*-\d+$/;

/** Real logs may prefix every line with a `[YYYY-MM-DD HH:MM]` stamp
 *  (the autopilot SKILL.md allows it). Parsing always works on the
 *  unstamped line; rawTail keeps lines verbatim. */
const STAMP_RE = /^\[[^\]\n]{0,40}\]\s+/;
export const stripStamp = (line: string): string => line.replace(STAMP_RE, "");
const GROUNDWORK = new Set(["shape", "design-ui", "architect"]);
const LOOP_ORDER = [
  "shape",
  "design-ui",
  "architect",
  "plan-sprint",
  "sprint",
  "qa",
  "retro",
];

function ticketIds(text: string): string[] {
  return text.split(/[\s,]+/).filter((t) => TICKET_RE.test(t));
}

/** Split on top-level commas, respecting parentheses:
 *  "T-16 question (see log), merge decision (T-14 #21, T-15 #22)" → 2 items */
function splitAwaiting(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) items.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

// real logs also write "in progress" as a mid-stage status note
const STAGE_RE = /^STAGE:\s+(\S+)\s+(complete|skipped|started|in progress)\s*(?:(?:→|->)\s*(.*))?$/;

export function parseAutopilotLog(text: string): AutopilotParse {
  const lines = text.split("\n").map((l) => l.trim());
  const out: AutopilotParse = {
    run: "running",
    groundwork: [],
    iterations: [],
    featureTickets: [],
    qaPassed: [],
    deferred: [],
    awaiting: [],
    answers: [],
    currentStage: null,
    rawTail: lines.filter(Boolean).slice(-15),
  };

  let currentIteration: Iteration | null = null;
  const newIteration = (): Iteration => {
    const it: Iteration = { tickets: [], stages: {} };
    out.iterations.push(it);
    return it;
  };

  for (const rawLine of lines) {
    const line = stripStamp(rawLine);
    if (!line) continue;

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^FEATURE:\s*(.+)$/))) {
      // feature names are brief basenames (kebab, no spaces); real logs
      // append prose after it — keep only the name
      out.feature = m[1].trim().split(/\s+/)[0];
      continue;
    }
    if ((m = line.match(/^MODE:\s*(.+)$/))) {
      out.mode = m[1].trim();
      out.awaiting = [];
      continue;
    }
    if (line === "RUN COMPLETE") {
      out.run = "complete";
      out.awaiting = [];
      continue;
    }
    if ((m = line.match(/^RUN STOPPED\s+(?:awaiting:|at)\s*(.*)$/))) {
      out.run = "stopped";
      out.awaiting = splitAwaiting(m[1]);
      continue;
    }
    if ((m = line.match(/^ANSWER:\s*(.+)$/))) {
      const answer = m[1].trim();
      out.answers.push(answer);
      out.run = "running";
      out.awaiting = []; // autopilot restates leftovers as a fresh RUN STOPPED
      const defer = answer.match(/^defer\s+(.*)$/i);
      if (defer) {
        const ids = ticketIds(defer[1]);
        const reason = defer[1]
          .split(/[\s,]+/)
          .filter((t) => !TICKET_RE.test(t))
          .join(" ")
          .trim();
        if (ids.length) out.deferred.push({ tickets: ids, reason: reason || undefined });
      }
      continue;
    }
    if ((m = line.match(STAGE_RE))) {
      const stage = m[1];
      const status = (m[2] === "in progress" ? "started" : m[2]) as StageStatus;
      const rest = (m[3] ?? "").trim();
      const isProgressNote = m[2] === "in progress";
      out.run = "running";
      out.awaiting = [];

      if (GROUNDWORK.has(stage)) {
        const entry: StageEntry = { stage, status: status as StageStatus };
        if (stage === "shape") {
          const ui = rest.match(/\bui:\s*(yes|no)\b/i);
          if (ui) entry.ui = ui[1].toLowerCase() === "yes";
          entry.artifact = rest.replace(/,?\s*ui:\s*(yes|no)\b.*$/i, "").trim() || undefined;
        } else if (stage === "architect") {
          const t = rest.match(/\btickets?\s+(.*)$/i);
          if (t) {
            entry.tickets = ticketIds(t[1]);
            out.featureTickets.push(...entry.tickets);
          }
          entry.artifact = rest.replace(/,?\s*tickets?\s+.*$/i, "").trim() || undefined;
        } else {
          entry.artifact = rest || undefined;
        }
        // re-runs of a groundwork stage replace the earlier entry
        out.groundwork = out.groundwork.filter((g) => g.stage !== stage);
        out.groundwork.push(entry);
        continue;
      }

      // iteration stages
      if (stage === "plan-sprint") {
        currentIteration = newIteration();
        currentIteration.stages["plan-sprint"] = status as StageStatus;
        // "sprint-3 open: T-14 T-15 T-16"
        const sp = rest.match(/^(\S+)\s+open:?\s*(.*)$/);
        if (sp) {
          currentIteration.sprint = sp[1];
          currentIteration.tickets = ticketIds(sp[2]);
        } else {
          currentIteration.tickets = ticketIds(rest);
        }
        continue;
      }
      if (!currentIteration) currentIteration = newIteration();
      currentIteration.stages[stage] = status as StageStatus;
      if (stage === "sprint") {
        // "started → .sprint/sprint-02.md (ORDER: …)" — the path is the
        // first token; a later "in progress" note must not overwrite it
        if (status === "started" && rest && !isProgressNote && !currentIteration.sprintLog) {
          currentIteration.sprintLog = rest.split(/\s+/)[0];
        }
        if (status === "complete") {
          const merged = rest.match(/\bmerged\s+(.*)$/i);
          if (merged) currentIteration.mergedTickets = ticketIds(merged[1]);
        }
      }
      if (stage === "qa" && status === "complete") {
        currentIteration.qaRaw = rest || undefined;
        const pass = rest.match(/\bpass(?:ed)?\s+(.*)$/i);
        if (pass) out.qaPassed.push(...ticketIds(pass[1]));
      }
      continue;
    }
    // unknown line: ignored (visible in rawTail)
  }

  out.currentStage = inferCurrentStage(out);
  return out;
}

function inferCurrentStage(p: AutopilotParse): { name: string; inferred: boolean } | null {
  if (p.run === "complete") return { name: "complete", inferred: false };

  const lastIter = p.iterations[p.iterations.length - 1];
  const allStages: { stage: string; status: StageStatus }[] = [
    ...p.groundwork.map((g) => ({ stage: g.stage, status: g.status })),
  ];
  if (lastIter) {
    for (const [stage, status] of Object.entries(lastIter.stages)) {
      allStages.push({ stage, status });
    }
  }
  const last = allStages[allStages.length - 1];
  if (!last) return { name: "shape", inferred: true };
  if (last.status === "started") return { name: last.stage, inferred: false };

  const idx = LOOP_ORDER.indexOf(last.stage);
  if (last.stage === "retro") return { name: "completion check", inferred: true };
  if (last.stage === "shape") {
    const shape = p.groundwork.find((g) => g.stage === "shape");
    if (shape?.ui === false) return { name: "architect", inferred: true };
  }
  const next = idx >= 0 ? LOOP_ORDER[idx + 1] : undefined;
  return next ? { name: next, inferred: true } : null;
}

export function parseSprintLog(text: string): SprintParse {
  const lines = text.split("\n").map((l) => l.trim());
  const out: SprintParse = {
    tickets: {},
    decisions: [],
    run: "running",
    order: [],
    serial: false,
    waves: [],
    rawTail: lines.filter(Boolean).slice(-15),
  };
  // a line appended after RUN STOPPED means the run picked back up —
  // without this, answered questions and subset merges stay in the
  // Waiting-on-you panel forever
  const resume = () => {
    if (out.run === "stopped") {
      out.run = "running";
      out.stoppedOn = undefined;
    }
  };
  const get = (id: string): TicketEvents => {
    if (!out.tickets[id]) {
      out.tickets[id] = {
        id,
        dispatched: false,
        parked: false,
        mergedInLog: false,
        readyToMerge: false,
        answers: [],
      };
    }
    return out.tickets[id];
  };

  for (const raw of lines) {
    const line = stripStamp(raw);
    if (!line) continue;
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^ORDER:\s*(.*)$/))) {
      resume();
      out.order = ticketIds(m[1]);
      // the flag is recorded by appending " (serial)" to the ORDER: line —
      // a bare word match would trip on ticket ids like SERIAL-1
      if (/\(\s*serial\s*\)\s*$/i.test(m[1])) out.serial = true;
      continue;
    }
    if ((m = line.match(/^WAVE:\s*(.*)$/))) {
      resume();
      const ids = ticketIds(m[1]);
      if (ids.length) out.waves.push(ids);
      continue;
    }
    if (line === "RUN COMPLETE") {
      out.run = "complete";
      continue;
    }
    if ((m = line.match(/^RUN STOPPED\s+(?:at|awaiting:)\s*(.*)$/))) {
      out.run = "stopped";
      out.stoppedOn = m[1].trim() || undefined;
      continue;
    }
    if ((m = line.match(/^DECISION:\s*(.+)$/))) {
      out.decisions.push(m[1].trim());
      continue;
    }
    if ((m = line.match(/^ANSWER:\s+(\S+)\s+(.*)$/))) {
      resume();
      if (TICKET_RE.test(m[1])) {
        get(m[1]).answers.push(m[2].trim());
        const t = get(m[1]);
        if (t.parked) t.parked = false; // answered → will re-dispatch
      }
      continue;
    }

    const idMatch = line.match(/^(\S+)\s+(.*)$/);
    if (!idMatch || !TICKET_RE.test(idMatch[1])) continue;
    const [, id, rest] = idMatch;
    const t = get(id);
    resume();

    if (/^dispatched\b/.test(rest)) {
      t.dispatched = true;
      t.parked = false;
      // finding: a re-dispatch (resume after an answer, conflict fix)
      // starts the ticket over — a stale blocked/failed return must not
      // outrank the new attempt in the state machine
      t.returned = undefined;
      t.blockedReason = undefined;
      t.readyToMerge = false;
      continue;
    }
    if ((m = rest.match(/^returned\s+(complete|blocked|failed)\b:?\s*(.*)$/))) {
      t.returned = m[1] as TicketEvents["returned"];
      const tail = m[2];
      if (t.returned !== "complete") t.blockedReason = tail.trim() || undefined;
      const pr = tail.match(/\bPR\s*#(\d+)/i);
      if (pr) t.pr = Number(pr[1]);
      const rounds = tail.match(/\b(\d+)\s+review\s+rounds?\b/i);
      if (rounds) t.reviewRounds = Number(rounds[1]);
      const head = tail.match(/\bhead\s+([0-9a-f]{6,40})\b/i);
      if (head) t.headSha = head[1];
      if (/\bready-to-merge\b/i.test(tail)) t.readyToMerge = true;
      continue;
    }
    if ((m = rest.match(/^parked\b(?:,?\s*depends\s+on\s+(\S+))?/))) {
      t.parked = true;
      if (m[1]) t.dependsOn = m[1].replace(/[.,]$/, "");
      continue;
    }
    if (/^merged\b/.test(rest)) {
      t.mergedInLog = true;
      continue;
    }
    // unknown ticket line: ignored
  }
  return out;
}

/** Round files on disk are the live mid-ticket signal: they appear as
 *  each reviewer round finishes, before the implementer returns. */
export function roundsFromFiles(basenames: string[]): Record<string, number> {
  const rounds: Record<string, number> = {};
  for (const name of basenames) {
    const m = name.match(/^review-(.+)-r(\d+)\.md$/);
    if (!m) continue;
    const [, ticket, n] = m;
    rounds[ticket] = Math.max(rounds[ticket] ?? 0, Number(n));
  }
  return rounds;
}

/** QA result files are `qa-<ticket>.md` or numeric-suffix reruns
 *  `qa-<ticket>-<N>.md`; the highest-suffix file is the ticket's outcome
 *  (the qa skill's own rule). "qa-T-14-2.md" is ambiguous in isolation
 *  (ticket T-14 rerun 2, or a ticket named T-14-2), so known ticket ids
 *  disambiguate first. Returns ticket → basename of the winning run. */
export function qaFilesByTicket(
  basenames: string[],
  knownIds: Iterable<string>,
): Record<string, string> {
  const known = new Set(knownIds);
  const best: Record<string, { run: number; name: string }> = {};
  for (const name of basenames) {
    const m = name.match(/^qa-(.+)\.md$/);
    if (!m) continue;
    const rest = m[1];
    let ticket = rest;
    let run = 1;
    const suffixed = rest.match(/^(.+)-(\d+)$/);
    if (!known.has(rest) && suffixed && known.has(suffixed[1])) {
      ticket = suffixed[1];
      run = Number(suffixed[2]);
    } else if (!known.has(rest) && !TICKET_RE.test(rest) && suffixed && TICKET_RE.test(suffixed[1])) {
      ticket = suffixed[1];
      run = Number(suffixed[2]);
    }
    const prev = best[ticket];
    if (!prev || run > prev.run) best[ticket] = { run, name };
  }
  return Object.fromEntries(
    Object.entries(best).map(([t, b]) => [t, b.name]),
  );
}

/** Verdict hint from a qa results file. The qa-verifier spec writes
 *  per-criterion verdicts as `pass` / `FAIL` / `unverifiable` — FAIL in
 *  caps — so the case-sensitive match avoids tripping on prose like
 *  "no failures found". Anything indeterminate stays "ran". */
export function qaHint(text: string): QaSignal["hint"] {
  if (/\bFAIL(?:ED)?\b/.test(text)) return "fail";
  if (/\bunverifiable\b/i.test(text)) return "ran";
  if (/\bpass(?:ed)?\b/i.test(text)) return "pass";
  return "ran";
}

export interface BuildInputs {
  autopilot: AutopilotParse;
  autopilotLogPath?: string;
  sprints: SprintParse[];
  roundFiles: string[]; // basenames in .sprint/
  qaSignals: QaSignal[];
  prs?: Record<number, PrInfo>;
  now: Date;
}

/** Ticket rows, shared by both views: an autopilot run merges several
 *  sprint logs and layers deferrals/QA lines on top; a standalone sprint
 *  run has exactly one log and none of that context. The per-ticket
 *  state machine is identical, so it lives here once. */
interface DeriveInputs {
  events: Map<string, TicketEvents>;
  ids: Set<string>;
  rounds: Record<string, number>;
  qaByTicket: Map<string, QaSignal>;
  deferred: Deferral[];
  qaPassIds: Set<string>;
  mergedExternally: Set<string>;
  prs?: Record<number, PrInfo>;
}

function deriveTickets(inp: DeriveInputs): TicketState[] {
  const { events, ids, rounds, qaByTicket, qaPassIds, mergedExternally } = inp;
  const deferredIds = new Set(inp.deferred.flatMap((d) => d.tickets));
  const tickets: TicketState[] = [];
  for (const id of ids) {
    const ev = events.get(id);
    const qa = qaByTicket.get(id);
    const round = rounds[id];
    const t: TicketState = { id, state: "pending" };

    if (ev?.pr) t.pr = inp.prs?.[ev.pr] ?? { number: ev.pr };
    t.reviewRounds = Math.max(ev?.reviewRounds ?? 0, round ?? 0) || undefined;
    if (qa) {
      t.qaFile = qa.path;
      t.qa = qa.hint;
    }
    if (qaPassIds.has(id)) t.qa = "pass";

    const merged =
      ev?.mergedInLog ||
      mergedExternally.has(id) ||
      t.pr?.state === "MERGED";

    if (deferredIds.has(id)) {
      t.state = "deferred";
      t.detail = inp.deferred.find((d) => d.tickets.includes(id))?.reason;
    } else if (merged && t.qa === "fail") {
      t.state = "qa-fail";
      t.detail = "merged, QA failed — bugs filed per fold/backlog choice";
    } else if (merged && t.qa === "pass") {
      t.state = "qa-pass";
    } else if (merged) {
      t.state = "merged";
    } else if (ev?.parked) {
      t.state = "parked";
      t.detail = ev.blockedReason ?? (ev.dependsOn ? `depends on ${ev.dependsOn}` : undefined);
    } else if (ev?.returned === "complete" && ev.readyToMerge) {
      t.state = "ready-to-merge";
    } else if (ev?.returned === "blocked" || ev?.returned === "failed") {
      t.state = ev.returned;
      t.detail = ev.blockedReason;
    } else if (ev?.dispatched && round) {
      t.state = `in-review (round ${round})`;
    } else if (ev?.dispatched) {
      t.state = "in-progress";
    }
    tickets.push(t);
  }
  tickets.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  return tickets;
}

/** Whether an awaiting line already names this ticket id as a whole
 *  token — a substring check would let "ABC-12 parked" swallow "ABC-1". */
function mentionsTicket(text: string, id: string): boolean {
  return text
    .split(/[^\w.-]+/)
    .some((tok) => tok.replace(/[.,;:]+$/, "") === id);
}

/** Parked tickets are a stop even when the log's last line doesn't say so. */
function appendParked(awaiting: string[], tickets: TicketState[]): void {
  for (const t of tickets) {
    if (t.state === "parked" && !awaiting.some((a) => mentionsTicket(a, t.id))) {
      awaiting.push(`${t.id} parked${t.detail ? `: ${t.detail}` : ""}`);
    }
  }
}

export function buildState(inp: BuildInputs): DashState {
  const ap = inp.autopilot;

  // merge sprint-log views: later logs win per ticket
  const events = new Map<string, TicketEvents>();
  for (const sp of inp.sprints) {
    for (const [id, ev] of Object.entries(sp.tickets)) events.set(id, ev);
  }

  // Rows come from this run's own logs; round files only decorate them.
  // `.sprint/` accumulates review-*-r*.md across features, so a stale
  // file must never conjure a ticket row for a run it doesn't belong to.
  const tickets = deriveTickets({
    events,
    ids: new Set<string>([...ap.featureTickets, ...events.keys()]),
    rounds: roundsFromFiles(inp.roundFiles),
    qaByTicket: new Map(inp.qaSignals.map((q) => [q.ticket, q])),
    deferred: ap.deferred,
    qaPassIds: new Set(ap.qaPassed),
    mergedExternally: new Set(ap.iterations.flatMap((it) => it.mergedTickets ?? [])),
    prs: inp.prs,
  });

  // awaiting: autopilot's current stop, plus parked tickets not already named
  const awaiting = [...ap.awaiting];
  appendParked(awaiting, tickets);

  return {
    kind: "autopilot",
    feature: ap.feature,
    mode: ap.mode,
    run: ap.run,
    awaiting,
    groundwork: ap.groundwork,
    iterations: ap.iterations,
    featureTickets: [...new Set(ap.featureTickets)],
    tickets,
    currentStage: ap.currentStage,
    decisions: inp.sprints.flatMap((s) => s.decisions),
    rawTail: ap.rawTail,
    sourceLog: inp.autopilotLogPath,
    generatedAt: inp.now.toISOString(),
  };
}

export interface SprintBuildInputs {
  sprint: SprintParse;
  sprintId: string; // log basename without the -N run suffix
  sprintLogPath?: string;
  sprintRun?: number;
  roundFiles: string[];
  qaSignals: QaSignal[];
  prs?: Record<number, PrInfo>;
  now: Date;
}

/** A standalone /sprint run: one log, no feature pipeline around it.
 *  Everything the autopilot view gets from stage lines — deferrals, the
 *  QA verdict line, merges recorded outside the sprint log — has no
 *  source here, so those inputs are empty rather than guessed. */
export function buildSprintState(inp: SprintBuildInputs): DashState {
  const sp = inp.sprint;
  const events = new Map<string, TicketEvents>(Object.entries(sp.tickets));
  const tickets = deriveTickets({
    events,
    ids: new Set<string>([...sp.order, ...events.keys()]),
    rounds: roundsFromFiles(inp.roundFiles),
    qaByTicket: new Map(inp.qaSignals.map((q) => [q.ticket, q])),
    deferred: [],
    qaPassIds: new Set(),
    mergedExternally: new Set(),
    prs: inp.prs,
  });

  const awaiting: string[] = [];
  if (sp.run === "stopped" && sp.stoppedOn) awaiting.push(...splitAwaiting(sp.stoppedOn));
  appendParked(awaiting, tickets);
  // /sprint stops before merge by design: a finalized PR is waiting on me
  // even while the log still reads "running".
  if (sp.run !== "complete") {
    const ready = tickets.filter(
      (t) => t.state === "ready-to-merge" && !awaiting.some((a) => mentionsTicket(a, t.id)),
    );
    if (ready.length) {
      awaiting.push(
        `merge decision (${ready.map((t) => `${t.id}${t.pr ? ` #${t.pr.number}` : ""}`).join(", ")})`,
      );
    }
  }

  return {
    kind: "sprint",
    feature: inp.sprintId,
    mode: sp.serial ? "serial" : undefined,
    run: sp.run,
    awaiting,
    groundwork: [],
    iterations: [],
    featureTickets: [...new Set(sp.order)],
    tickets,
    currentStage: null,
    decisions: sp.decisions,
    rawTail: sp.rawTail,
    sourceLog: inp.sprintLogPath,
    waves: sp.waves,
    sprintRun: inp.sprintRun,
    generatedAt: inp.now.toISOString(),
  };
}
