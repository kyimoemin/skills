// Pure parsers for the dev-workflow suite's log conventions.
// No fs, no network — server.ts injects file contents and signals.
//
// The logs are model-written prose conventions, not machine output:
// every parser matches by prefix/regex and ignores lines it doesn't
// recognize. Drift shows up in the dashboard's raw-tail panel instead
// of crashing the parse.

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
  mergeSkipped?: string; // /sprint auto: the merge phase skipped it, with why
  qaRunning?: boolean; // `<ticket> qa dispatched` with no qa result line after it yet
  qaSoloWait?: string; // `<ticket> qa solo-wait: <reason>` with no rerun dispatched yet
  qaResult?: "pass" | "fail" | "blocked" | "skipped"; // the newest `<ticket> qa <verdict>` line
  answers: string[];
}

export interface SprintParse {
  tickets: Record<string, TicketEvents>;
  title?: string; // a leading "# ..." heading: the run's own name for itself
  decisions: string[];
  run: "running" | "stopped" | "complete";
  stoppedOn?: string; // text after "RUN STOPPED at/awaiting:"
  stopNote?: string; // the NOTE: written right before RUN STOPPED — the why
  order: string[]; // the ORDER: line — the run's planned ticket list
  serial: boolean; // ORDER: line ends "(serial)"
  auto: boolean; // an ORDER: line carries "(auto)" — /sprint auto merges itself
  proposed: string[]; // FILED: … proposed — follow-ups awaiting my triage
  waves: string[][]; // WAVE: lines, in dispatch order
  regressionRunning: boolean; // `QA: regression dispatched` with no result line after it yet
  regressionResult?: "pass" | "fail" | "blocked"; // the newest `QA: regression <verdict>` line
  qaPhase: boolean; // the log has any QA line (ticket or regression): the run has a QA phase
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
  hint: "pass" | "fail" | "blocked" | "skipped" | "ran";
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
  feature?: string; // sprint id
  title?: string; // the log's own heading, when it has one
  mode?: string;
  run: "running" | "stopped" | "complete";
  awaiting: string[];
  stopNote?: string; // why the run stopped, when it said
  featureTickets: string[];
  tickets: TicketState[];
  decisions: string[];
  rawTail: string[];
  sourceLog?: string; // the log this view was derived from
  waves?: string[][];
  sprintRun?: number; // the -N suffix, 1 when unsuffixed
  proposed?: string[]; // follow-ups filed for my triage
  qaRunning?: string[]; // ticket ids (and "regression") whose QA check is running now
  qaPhase?: boolean; // the log has QA lines, so the funnel draws its QA stages
  regression?: "running" | "pass" | "fail" | "blocked"; // the suite run's state, when logged
  repoUrl?: string; // https base of the GitHub origin, for PR links
  generatedAt: string;
}

// a split ticket keeps its parent's number plus a letter: DI-32a, WB-44a
const TICKET_RE = /^[A-Za-z][\w.]*-\d+[a-z]?$/;

/** Real logs may prefix every line with a `[YYYY-MM-DD HH:MM]` stamp
 *  (the suite's log convention allows it). Parsing always works on the
 *  unstamped line; rawTail keeps lines verbatim. */
const STAMP_RE = /^\[[^\]\n]{0,40}\]\s+/;
export const stripStamp = (line: string): string => line.replace(STAMP_RE, "");

function ticketIds(text: string): string[] {
  // parens too: merge lines are written `MERGE: PR #106 (DI-66) merged …`
  return text.split(/[\s,()]+/).filter((t) => TICKET_RE.test(t));
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

export function parseSprintLog(text: string): SprintParse {
  const lines = text.split("\n").map((l) => l.trim());
  const out: SprintParse = {
    tickets: {},
    decisions: [],
    run: "running",
    order: [],
    serial: false,
    auto: false,
    proposed: [],
    waves: [],
    regressionRunning: false,
    qaPhase: false,
    rawTail: lines.filter(Boolean).slice(-15),
  };
  // A stop line only names what it waits on; the reason is the NOTE: the
  // run wrote just before it. Any event line in between makes it stale.
  let lastNote: string | undefined;
  // a line appended after RUN STOPPED means the run picked back up —
  // without this, answered questions and subset merges stay in the
  // Waiting-on-you panel forever
  const resume = () => {
    lastNote = undefined;
    if (out.run === "stopped") {
      out.run = "running";
      out.stoppedOn = undefined;
      out.stopNote = undefined;
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

    if ((m = line.match(/^#{1,6}\s+(.+?)\s*$/))) {
      // A run may name itself with a heading above ORDER: ("# Redesign run
      // 10 — wave-3.5 DI track"). That name says what was actually run —
      // a plan section, a track — which the `<sprint-id>-<N>.md` filename
      // cannot. Real logs write a run title AND a section heading, so the
      // preamble's headings join; anything below ORDER: is prose.
      if (!out.order.length) {
        out.title = out.title ? `${out.title} · ${m[1].trim()}` : m[1].trim();
      }
      continue;
    }
    if ((m = line.match(/^ORDER:\s*(.*)$/))) {
      resume();
      out.order = ticketIds(m[1]);
      // the flag is recorded by appending " (serial)" to the ORDER: line —
      // a bare word match would trip on ticket ids like SERIAL-1
      if (/\(\s*serial\s*\)\s*$/i.test(m[1])) out.serial = true;
      // /sprint auto writes "(auto)" before any "(serial)"
      if (/\(\s*auto\s*\)/i.test(m[1])) out.auto = true;
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
      out.stopNote = lastNote;
      continue;
    }
    if ((m = line.match(/^NOTE:\s*(.+)$/))) {
      lastNote = m[1].trim();
      continue;
    }
    if ((m = line.match(/^MERGED?:\s*(.+)$/i))) {
      // The merge phase's own line. The documented form is `<ticket>
      // merged, ...` (handled below), but runs also write `MERGE: <ticket>
      // PR #N merged into <base> at <sha>` — the same event. Unparsed, a
      // merged ticket never reads as merged for the life of the file.
      // Ids are read from the text BEFORE the word "merged", so a trailing
      // "unblocks ABC-9" can't mark an unmerged ticket merged.
      resume();
      const head = m[1].split(/\bmerged\b/i)[0];
      for (const id of ticketIds(head.trim() ? head : m[1])) get(id).mergedInLog = true;
      continue;
    }
    if ((m = line.match(/^FILED:\s*(\S+)\s+proposed\s+(\S+)(?:\s+from\s+(\S+))?/i))) {
      // /sprint auto files improvements (and bugs found in its own filed
      // tickets) as proposed: they wait on my triage, never on the loop.
      // Ready filings and skipped duplicates need nothing from me.
      const from = m[3] ? ` (from ${m[3]})` : "";
      out.proposed.push(`${m[1]} ${m[2]}${from}`);
      continue;
    }
    if ((m = line.match(/^QA:\s*regression\s+(dispatched|pass|fail|blocked)\b/i))) {
      // the QA phase's suite run: dispatched before the verifier starts,
      // a result line when it returns
      resume();
      out.qaPhase = true;
      const verdict = m[1].toLowerCase();
      out.regressionRunning = verdict === "dispatched";
      out.regressionResult =
        verdict === "dispatched" ? undefined : (verdict as SprintParse["regressionResult"]);
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

    // QA phase: `<ticket> qa dispatched` before its verifier runs, then
    // `<ticket> qa pass|fail|blocked|skipped, …` when it returns. Checked
    // before the dispatch rule below, which would read "qa" as a qualifier
    // and put a merged ticket back to work.
    // `<ticket> qa solo-wait: <reason>`: a lane verifier returned before
    // running anything because the check must run alone. Not a result —
    // the ticket waits for its alone rerun, which logs its own dispatch.
    if ((m = rest.match(/^qa\s+solo-wait\b:?\s*(.*)$/i))) {
      out.qaPhase = true;
      t.qaRunning = false;
      t.qaSoloWait = m[1].trim() || "must run alone";
      continue;
    }
    if ((m = rest.match(/^qa\s+(dispatched|pass|fail|blocked|skipped)\b/i))) {
      out.qaPhase = true;
      const verdict = m[1].toLowerCase();
      t.qaRunning = verdict === "dispatched";
      t.qaSoloWait = undefined;
      // a rerun clears the old verdict; its own result line sets the new one
      t.qaResult = verdict === "dispatched" ? undefined : (verdict as TicketEvents["qaResult"]);
      continue;
    }

    // Re-dispatches are written many ways ("re-dispatched", "amend
    // re-dispatched", "resume-dispatch dispatched", "re-dispatch (agent
    // resume) dispatched"); all of them put the ticket back to work. A
    // close-tracking dispatch after merge is bookkeeping, not rework.
    if (
      /^(?:[A-Za-z][\w-]*\s+)?(?:\([^)]*\)\s+)?(?:[A-Za-z]+-)?dispatched\b/.test(rest) &&
      !/^\S*tracking\b/i.test(rest)
    ) {
      t.dispatched = true;
      t.parked = false;
      // finding: a re-dispatch (resume after an answer, conflict fix)
      // starts the ticket over — a stale blocked/failed return must not
      // outrank the new attempt in the state machine
      t.returned = undefined;
      t.blockedReason = undefined;
      t.readyToMerge = false;
      t.mergeSkipped = undefined;
      continue;
    }
    // one optional qualifier word ("DI-60 rebase-dispatch returned complete")
    // — bounded to \w and - so it cannot swallow "parked," and misread a
    // parked line that merely mentions an earlier return
    if ((m = rest.match(/^(?:[A-Za-z][\w-]*\s+)?returned\s+(complete|blocked|failed)\b:?\s*(.*)$/i))) {
      t.returned = m[1].toLowerCase() as TicketEvents["returned"];
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
    // /sprint auto's merge phase: a failing check it can't rebase away.
    // Unparsed, the ticket reads ready-to-merge while it waits on me.
    if ((m = rest.match(/^merge\s+skipped\b:?\s*(.*)$/i))) {
      t.mergeSkipped = m[1].trim();
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

/** Verdict hint from a qa results file. A ticket the QA phase skipped or
 *  couldn't check gets a one-line `skipped: <reason>` / `blocked: <reason>`
 *  entry, checked first: a reason like "covered by the regression pass"
 *  must not read as a pass. The qa-verifier spec writes per-criterion
 *  verdicts as `pass` / `FAIL` / `unverifiable` — FAIL in caps — so the
 *  case-sensitive match avoids tripping on prose like "no failures found".
 *  Anything indeterminate stays "ran". */
export function qaHint(text: string): QaSignal["hint"] {
  if (/^\s*skipped:/i.test(text)) return "skipped";
  if (/^\s*blocked:/i.test(text)) return "blocked";
  if (/\bFAIL(?:ED)?\b/.test(text)) return "fail";
  if (/\bunverifiable\b/i.test(text)) return "ran";
  if (/\bpass(?:ed)?\b/i.test(text)) return "pass";
  return "ran";
}

/** Ticket rows: the per-ticket state machine over one run log's events,
 *  decorated by QA files and PR lookups. Review rounds live on the PR as
 *  comments, so the only count this sees is the return line's. */
interface DeriveInputs {
  events: Map<string, TicketEvents>;
  ids: Set<string>;
  qaByTicket: Map<string, QaSignal>;
  prs?: Record<number, PrInfo>;
  /** RUN COMPLETE: no check can still be running, whatever the log's qa lines say */
  runComplete?: boolean;
}

function deriveTickets(inp: DeriveInputs): TicketState[] {
  const { events, ids, qaByTicket } = inp;
  const tickets: TicketState[] = [];
  for (const id of ids) {
    const ev = events.get(id);
    const qa = qaByTicket.get(id);
    const t: TicketState = { id, state: "pending" };

    if (ev?.pr) t.pr = inp.prs?.[ev.pr] ?? { number: ev.pr };
    t.reviewRounds = ev?.reviewRounds || undefined;
    if (qa) {
      t.qaFile = qa.path;
      t.qa = qa.hint;
    }

    const merged = ev?.mergedInLog || t.pr?.state === "MERGED";
    // A dispatched check whose result line is missing or misworded can't
    // still be running once the run is complete; fall back to its results file.
    const qaRunning = ev?.qaRunning && !inp.runComplete;
    // The log's result line is the dispatcher's record of the newest check,
    // so it outranks a results file's hint; the file fills in for logs that
    // never wrote one.
    const verdict = qaRunning ? undefined : (ev?.qaResult ?? t.qa);
    if (verdict && verdict !== t.qa) t.qa = verdict;

    if (merged && qaRunning) {
      // a rerun outranks an older results file still on disk
      t.state = "qa-running";
      t.detail = "QA check running";
    } else if (merged && ev?.qaSoloWait !== undefined && !inp.runComplete) {
      t.state = "qa-waiting";
      t.detail = `QA waiting to run alone: ${ev.qaSoloWait}`;
    } else if (merged && verdict === "fail") {
      t.state = "qa-fail";
      t.detail = "merged, QA failed — bugs filed per fold/backlog choice";
    } else if (merged && verdict === "blocked") {
      // a blocked check stops nothing (the ticket is merged either way);
      // it waits for a human in the run's final report, not here
      t.state = "qa-blocked";
    } else if (merged && verdict === "skipped") {
      t.state = "qa-skipped";
    } else if (merged && verdict === "pass") {
      t.state = "qa-pass";
    } else if (merged) {
      t.state = "merged";
    } else if (ev?.parked) {
      t.state = "parked";
      t.detail = ev.blockedReason ?? (ev.dependsOn ? `depends on ${ev.dependsOn}` : undefined);
    } else if (ev?.mergeSkipped !== undefined) {
      t.state = "merge-skipped";
      t.detail = ev.mergeSkipped || undefined;
    } else if (ev?.returned === "complete") {
      // `complete` already means implemented, reviewed clean and finalized,
      // and /sprint stops before merge — so the ticket is waiting on a merge
      // decision whether or not the return line spelled "ready-to-merge".
      // Gating on the token left most finished tickets reading as unfinished.
      t.state = "ready-to-merge";
    } else if (ev?.returned === "blocked" || ev?.returned === "failed") {
      t.state = ev.returned;
      t.detail = ev.blockedReason;
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

/** Parked and merge-skipped tickets are a stop even when the log's last
 *  line doesn't say so. */
function appendParked(awaiting: string[], tickets: TicketState[]): void {
  for (const t of tickets) {
    const what =
      t.state === "parked" ? "parked" : t.state === "merge-skipped" ? "merge skipped" : undefined;
    if (what && !awaiting.some((a) => mentionsTicket(a, t.id))) {
      awaiting.push(`${t.id} ${what}${t.detail ? `: ${t.detail}` : ""}`);
    }
  }
}

export interface SprintBuildInputs {
  sprint: SprintParse;
  sprintId: string; // log basename without the -N run suffix
  sprintLogPath?: string;
  sprintRun?: number;
  qaSignals: QaSignal[];
  prs?: Record<number, PrInfo>;
  now: Date;
}

/** What the QA phase is checking right now; undefined when nothing is. */
function qaRunningNow(sp: SprintParse, tickets: TicketState[]): string[] | undefined {
  if (sp.run === "complete") return undefined;
  const running = tickets.filter((t) => t.state === "qa-running").map((t) => t.id);
  if (sp.regressionRunning) running.push("regression");
  return running.length ? running : undefined;
}

/** A standalone /sprint run: one log, no feature pipeline around it. */
export function buildSprintState(inp: SprintBuildInputs): DashState {
  const sp = inp.sprint;
  const events = new Map<string, TicketEvents>(Object.entries(sp.tickets));
  const tickets = deriveTickets({
    events,
    ids: new Set<string>([...sp.order, ...events.keys()]),
    qaByTicket: new Map(inp.qaSignals.map((q) => [q.ticket, q])),
    prs: inp.prs,
    runComplete: sp.run === "complete",
  });

  const awaiting: string[] = [];
  if (sp.run === "stopped" && sp.stoppedOn) awaiting.push(...splitAwaiting(sp.stoppedOn));
  appendParked(awaiting, tickets);
  // /sprint stops before merge by design: a finalized PR is waiting on me
  // even while the log still reads "running". Not under auto — the loop
  // merges it itself, so a finished PR there is just between phases.
  if (sp.run !== "complete" && !sp.auto) {
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
    feature: inp.sprintId,
    title: sp.title,
    mode: [sp.auto && "auto", sp.serial && "serial"].filter(Boolean).join(" · ") || undefined,
    run: sp.run,
    awaiting,
    stopNote: sp.run === "stopped" ? sp.stopNote : undefined,
    featureTickets: [...new Set(sp.order)],
    tickets,
    decisions: sp.decisions,
    rawTail: sp.rawTail,
    sourceLog: inp.sprintLogPath,
    waves: sp.waves,
    sprintRun: inp.sprintRun,
    proposed: sp.proposed.length ? sp.proposed : undefined,
    qaRunning: qaRunningNow(sp, tickets),
    qaPhase: sp.qaPhase || undefined,
    // like qaRunning: an interrupted suite run doesn't read as running once the run is complete
    regression: sp.regressionRunning ? (sp.run === "complete" ? undefined : "running") : sp.regressionResult,
    generatedAt: inp.now.toISOString(),
  };
}
