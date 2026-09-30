import { describe, expect, test } from "bun:test";
import {
  buildSprintState,
  parseSprintLog,
  qaFilesByTicket,
  qaHint,
  roundsFromFiles,
} from "./parse";

// Fixture: the example lines from sprint/SKILL.md, verbatim, plus a
// leading return line in the same documented format.
const SPRINT_LOG = `ABC-12 dispatched
ABC-12 returned complete, PR #205, 2 review rounds, head 4f2a91c, ready-to-merge, tracker: Trello/Sprint Board
ABC-15 dispatched
ABC-15 returned blocked: acceptance criteria don't cover expired tokens
ABC-15 parked
ABC-9 dispatched
ABC-9 returned complete, PR #207, 1 review round, head 9c4d1e2, ready-to-merge, tracker: Trello/Sprint Board
RUN STOPPED awaiting: ABC-15
`;

describe("parseSprintLog", () => {
  test("documented line formats", () => {
    const p = parseSprintLog(SPRINT_LOG);
    expect(p.run).toBe("stopped");
    expect(p.stoppedOn).toBe("ABC-15");

    const t12 = p.tickets["ABC-12"];
    expect(t12.returned).toBe("complete");
    expect(t12.pr).toBe(205);
    expect(t12.reviewRounds).toBe(2);
    expect(t12.headSha).toBe("4f2a91c");
    expect(t12.readyToMerge).toBe(true);

    const t15 = p.tickets["ABC-15"];
    expect(t15.returned).toBe("blocked");
    expect(t15.parked).toBe(true);
    expect(t15.blockedReason).toBe(
      "acceptance criteria don't cover expired tokens",
    );

    expect(p.tickets["ABC-9"].pr).toBe(207);
    expect(p.tickets["ABC-9"].reviewRounds).toBe(1);
  });

  test("parked with dependency, answers, merged", () => {
    const p = parseSprintLog(
      "T-2 parked, depends on T-1\nANSWER: T-1 use jwt\nT-1 dispatched\nT-1 merged\n",
    );
    expect(p.tickets["T-2"].parked).toBe(true);
    expect(p.tickets["T-2"].dependsOn).toBe("T-1");
    expect(p.tickets["T-1"].answers).toEqual(["use jwt"]);
    expect(p.tickets["T-1"].mergedInLog).toBe(true);
  });

  test("timestamp prefixes tolerated", () => {
    const p = parseSprintLog(
      "[2026-08-13 12:46] T-5 dispatched\n[2026-08-13 12:59] RUN STOPPED awaiting: T-5\n",
    );
    expect(p.tickets["T-5"].dispatched).toBe(true);
    expect(p.run).toBe("stopped");
  });

  test("letter-suffixed split ticket ids", () => {
    const p = parseSprintLog(
      "ORDER: DI-32a, DI-3a (auto)\nWAVE: DI-32a\nDI-32a dispatched\nDI-32a returned complete, PR #221, 1 review round, head 7996c1c, ready-to-merge\n",
    );
    expect(p.order).toEqual(["DI-32a", "DI-3a"]);
    expect(p.waves).toEqual([["DI-32a"]]);
    expect(p.tickets["DI-32a"].pr).toBe(221);
    expect(p.tickets["DI-32a"].readyToMerge).toBe(true);
  });
});

describe("roundsFromFiles", () => {
  test("max round per ticket, non-round files ignored", () => {
    expect(
      roundsFromFiles([
        "review-T-14-r1.md",
        "review-T-14-r2.md",
        "review-ABC-9-r1.md",
        "qa-T-14.md",
        "sprint-3.md",
      ]),
    ).toEqual({ "T-14": 2, "ABC-9": 1 });
  });
});

describe("qaFilesByTicket", () => {
  test("plain files, rerun suffix wins, known ids disambiguate", () => {
    expect(
      qaFilesByTicket(
        ["qa-T-14.md", "qa-T-14-2.md", "qa-ABC-9.md", "review-T-14-r1.md"],
        ["T-14", "ABC-9"],
      ),
    ).toEqual({ "T-14": "qa-T-14-2.md", "ABC-9": "qa-ABC-9.md" });
  });

  test("unknown ticket falls back to whole basename", () => {
    expect(qaFilesByTicket(["qa-X-1.md"], [])).toEqual({ "X-1": "qa-X-1.md" });
  });
});

describe("qaHint", () => {
  test("caps FAIL is a fail; prose 'failures' is not", () => {
    expect(qaHint("criterion 1: FAIL — expected 200, observed 500")).toBe("fail");
    expect(qaHint("all criteria pass. no failures found.")).toBe("pass");
  });
  test("unverifiable never rounds up to pass", () => {
    expect(qaHint("criterion 1: pass\ncriterion 2: unverifiable: visual")).toBe("ran");
  });
  test("indeterminate content stays ran", () => {
    expect(qaHint("run interrupted")).toBe("ran");
  });
});

import { SPRINT_STANDALONE } from "./fixtures";

describe("parseSprintLog — run shape", () => {
  test("ORDER, serial flag, waves and raw tail", () => {
    const p = parseSprintLog(SPRINT_STANDALONE);
    expect(p.order).toEqual(["ABC-12", "ABC-15", "ABC-9"]);
    expect(p.serial).toBe(true);
    expect(p.waves).toEqual([["ABC-12", "ABC-15"], ["ABC-9"]]);
    expect(p.decisions).toHaveLength(1);
    expect(p.rawTail[0]).toBe("ORDER: ABC-12, ABC-15, ABC-9 (serial)");
    expect(p.run).toBe("running");
  });

  test("a log with no ORDER line still parses", () => {
    const p = parseSprintLog(SPRINT_LOG);
    expect(p.order).toEqual([]);
    expect(p.serial).toBe(false);
    expect(p.waves).toEqual([]);
  });
});

describe("buildSprintState", () => {
  const state = () =>
    buildSprintState({
      sprint: parseSprintLog(SPRINT_STANDALONE),
      sprintId: "sprint-3",
      sprintLogPath: ".sprint/sprint-3.md",
      sprintRun: 1,
      roundFiles: ["review-ABC-9-r1.md"],
      qaSignals: [],
      now: new Date("2026-08-10T12:00:00Z"),
    });

  test("ticket rows come from ORDER plus the log's own events", () => {
    const s = state();
    expect(s.feature).toBe("sprint-3");
    expect(s.mode).toBe("serial");
    expect(s.tickets.map((t) => `${t.id}:${t.state}`)).toEqual([
      "ABC-9:in-review (round 1)",
      "ABC-12:ready-to-merge",
      "ABC-15:parked",
    ]);
    expect(s.decisions).toHaveLength(1);
    expect(s.waves).toEqual([["ABC-12", "ABC-15"], ["ABC-9"]]);
  });

  test("finalized PRs and parked tickets are both waiting on me", () => {
    const s = state();
    expect(s.awaiting).toEqual([
      "ABC-15 parked: acceptance criteria don't cover expired tokens",
      "merge decision (ABC-12 #204)",
    ]);
  });

  test("a RUN STOPPED line's own text leads, and merged tickets stop waiting", () => {
    const s = buildSprintState({
      sprint: parseSprintLog(
        SPRINT_STANDALONE + "RUN STOPPED awaiting: ABC-15\nABC-12 merged\nRUN COMPLETE\n",
      ),
      sprintId: "sprint-3",
      roundFiles: [],
      qaSignals: [],
      now: new Date("2026-08-10T12:00:00Z"),
    });
    expect(s.run).toBe("complete");
    expect(s.tickets.find((t) => t.id === "ABC-12")?.state).toBe("merged");
    // complete run: no merge-decision line invented
    expect(s.awaiting.some((a) => a.startsWith("merge decision"))).toBe(false);
  });
});

describe("sprint view — review regressions", () => {
  const NOW = new Date("2026-08-10T12:00:00Z");
  const build = (log: string) =>
    buildSprintState({
      sprint: parseSprintLog(log),
      sprintId: "s",
      roundFiles: [],
      qaSignals: [],
      now: NOW,
    });

  test("a prefix-sharing ticket id cannot swallow another's awaiting line", () => {
    const s = build(
      "ORDER: ABC-1, ABC-12\nABC-1 dispatched\nABC-12 dispatched\n" +
        "ABC-1 returned complete, PR #10, 1 review round, head abc1234, ready-to-merge, tracker: board\n" +
        "ABC-12 returned blocked: needs schema decision\nABC-12 parked\n",
    );
    expect(s.awaiting).toEqual([
      "ABC-12 parked: needs schema decision",
      "merge decision (ABC-1 #10)",
    ]);
  });

  test("activity after RUN STOPPED clears the stop and its awaiting text", () => {
    const s = build(
      "ORDER: ABC-1\nABC-1 dispatched\n" +
        "ABC-1 returned complete, PR #10, 1 review round, head abc1234, ready-to-merge, tracker: board\n" +
        "RUN STOPPED awaiting: merge decision (ABC-1 #10)\nABC-1 merged\n",
    );
    expect(s.run).toBe("running");
    expect(s.awaiting).toEqual([]);
    expect(s.tickets[0].state).toBe("merged");
  });

  test("a re-dispatched ticket is in-progress, not blocked", () => {
    const s = build(
      "ORDER: ABC-1\nABC-1 dispatched\n" +
        "ABC-1 returned blocked: unclear criteria\nABC-1 parked\n" +
        "RUN STOPPED awaiting: ABC-1\nANSWER: ABC-1 cover expired tokens too\nABC-1 dispatched\n",
    );
    expect(s.run).toBe("running");
    expect(s.tickets[0].state).toBe("in-progress");
    expect(s.awaiting).toEqual([]);
  });

  test("paren-aware awaiting split", () => {
    const s = build(
      "ORDER: A-1\nRUN STOPPED awaiting: A-1 question (see log), merge decision (A-2 #3, A-3 #4)\n",
    );
    expect(s.awaiting).toEqual(["A-1 question (see log)", "merge decision (A-2 #3, A-3 #4)"]);
  });

  test("serial comes from the trailing marker, not ticket ids", () => {
    expect(parseSprintLog("ORDER: SERIAL-1, SERIAL-2\n").serial).toBe(false);
    expect(parseSprintLog("ORDER: SERIAL-1, SERIAL-2 (serial)\n").serial).toBe(true);
  });
});

// Forms real runs write that the documented example never showed. Lifted
// from .sprint/redesign-13.md, where every ticket read "in-review" hours
// after the run had merged all three and appended RUN COMPLETE.
describe("sprint view — merge-phase drift", () => {
  const build = (log: string) =>
    buildSprintState({
      sprint: parseSprintLog(log),
      sprintId: "redesign",
      roundFiles: ["review-DI-61-r1.md", "review-DI-61-r2.md"],
      qaSignals: [],
      now: new Date("2026-08-20T12:00:00Z"),
    });

  test("a complete return is ready-to-merge without the literal token", () => {
    const s = build(
      "ORDER: DI-59\nDI-59 dispatched\n" +
        "DI-59 returned complete, PR #90, 1 review round (r1 clean, 0 findings), " +
        "head 007a306, In Review, tracker: docs/sprints/TRACKER.md DI-59 row\n",
    );
    expect(s.tickets[0].state).toBe("ready-to-merge");
    expect(s.tickets[0].pr?.number).toBe(90);
  });

  test("MERGE: lines merge the tickets named before the word merged", () => {
    const p = parseSprintLog(
      "ORDER: DI-59, DI-63\nDI-59 dispatched\n" +
        "MERGE: DI-59 PR #90 merged into redesign at 42a72ae. Branch deleted, unblocks DI-63\n" +
        "MERGE: close-tracking PR #91 merged into redesign at b21f0a3, branch deleted\n",
    );
    expect(p.tickets["DI-59"].mergedInLog).toBe(true);
    expect(p.tickets["DI-63"]).toBeUndefined();
  });

  test("a qualifier before `returned` still registers the return", () => {
    const s = build(
      "ORDER: DI-61\nDI-61 dispatched\n" +
        "DI-61 rebase-dispatch returned complete, PR #88, r3 this dispatch, new head aa901cf, In Review\n" +
        "MERGE: DI-61 PR #88 merged into redesign at 3c6c09c\n",
    );
    expect(s.tickets[0].state).toBe("merged");
    expect(s.tickets[0].reviewRounds).toBe(2); // round files, no "N review rounds" in the line
  });

  test("`parked` mentioning an earlier return is not read as a return", () => {
    const p = parseSprintLog(
      "ORDER: DI-1\nDI-1 dispatched\nDI-1 parked, returned blocked earlier this run\n",
    );
    expect(p.tickets["DI-1"].parked).toBe(true);
    expect(p.tickets["DI-1"].returned).toBeUndefined();
  });

  test("the heading above ORDER: is the run's title, not an event", () => {
    const p = parseSprintLog(
      "# Redesign run 13 — §4 of the wave-3.5 plan\nORDER: DI-59, DI-60\nDI-59 dispatched\n",
    );
    expect(p.title).toBe("Redesign run 13 — §4 of the wave-3.5 plan");
    expect(p.order).toEqual(["DI-59", "DI-60"]);
  });

  test("a run title and a section heading join; headings below ORDER: don't", () => {
    const p = parseSprintLog(
      "# Redesign run 11\n\n## §2 — token completion\nORDER: DI-53\n" +
        "## not a title\nDI-53 dispatched\n",
    );
    expect(p.title).toBe("Redesign run 11 · §2 — token completion");
  });

  test("a finished run reads as merged end to end", () => {
    const s = build(
      "# §4 — wave-3.5 DI track\nORDER: DI-59, DI-60, DI-61\n" +
        "WAVE: DI-59 DI-60 DI-61\nDI-59 dispatched\nDI-60 dispatched\nDI-61 dispatched\n" +
        "DI-60 returned complete, PR #89, 1 review round, head fc8be3e, In Review\n" +
        "DI-59 returned complete, PR #90, 1 review round, head 007a306, In Review\n" +
        "DI-61 returned complete, PR #88, 2 review rounds, head a3655b1, In Review\n" +
        "MERGE: DI-59 PR #90 merged into redesign at 42a72ae\n" +
        "MERGE: DI-60 PR #89 merged into redesign at 5f0bd13\n" +
        "MERGE: DI-61 PR #88 merged into redesign at 3c6c09c\nRUN COMPLETE\n",
    );
    expect(s.title).toBe("§4 — wave-3.5 DI track");
    expect(s.run).toBe("complete");
    expect(s.tickets.map((t) => t.state)).toEqual(["merged", "merged", "merged"]);
    expect(s.awaiting).toEqual([]);
  });
});

describe("sprint view — re-dispatch forms and stop reasons", () => {
  const build = (log: string) =>
    buildSprintState({
      sprint: parseSprintLog(log),
      sprintId: "s",
      roundFiles: [],
      qaSignals: [],
      now: new Date("2026-09-25T12:00:00Z"),
    });
  const RETURNED = "ORDER: DI-1\nDI-1 dispatched\nDI-1 returned complete, PR #9, 2 review rounds\n";

  test.each([
    "DI-1 re-dispatched",
    "DI-1 amend re-dispatched (reordered, attempt 4)",
    "DI-1 resume-dispatch dispatched: continue on fix/x",
    "DI-1 re-dispatch (agent resume 2) dispatched",
    "DI-1 rebase re-dispatched after the auth-error death",
  ])("%s puts a finished ticket back to work", (line) => {
    expect(build(`${RETURNED}${line}\n`).tickets[0].state).toBe("in-progress");
  });

  test("a close-tracking dispatch is bookkeeping, not rework", () => {
    const s = build(`${RETURNED}DI-1 close-tracking dispatched\n`);
    expect(s.tickets[0].state).toBe("ready-to-merge");
  });

  test("a return's verdict word is case-insensitive", () => {
    const s = build("ORDER: DI-1\nDI-1 dispatched\nDI-1 returned FAILED on resume, PR #84\n");
    expect(s.tickets[0].state).toBe("failed");
  });

  test("the NOTE right before RUN STOPPED is why it stopped", () => {
    const s = build(`${RETURNED}NOTE: device verification keeps dying\nRUN STOPPED at DI-1\n`);
    expect(s.stopNote).toBe("device verification keeps dying");
  });

  test("a NOTE followed by other events is not the stop reason", () => {
    const s = build(`${RETURNED}NOTE: early context\nDI-1 re-dispatched\nRUN STOPPED at DI-1\n`);
    expect(s.stopNote).toBeUndefined();
  });

  test("resuming after the stop clears the reason", () => {
    const s = build(`${RETURNED}NOTE: why\nRUN STOPPED at DI-1\nDI-1 re-dispatched\n`);
    expect(s.run).toBe("running");
    expect(s.stopNote).toBeUndefined();
  });
});

test("a MERGE: line naming the ticket in parens merges it", () => {
  const s = parseSprintLog("ORDER: DI-66\nDI-66 dispatched\nMERGE: PR #106 (DI-66) merged into redesign at e67cf2c\n");
  expect(s.tickets["DI-66"].mergedInLog).toBe(true);
});

describe("parseSprintLog — auto loop", () => {
  // /sprint auto keeps one log for the whole loop: each pass appends its
  // own ORDER: line, and follow-up bookkeeping (FOLLOWUP:/FILED:) must not
  // create ticket rows for ids it merely mentions.
  const AUTO = `# sprint 17 — auto
ORDER: ABC-1, ABC-2 (auto) (serial)
WAVE: ABC-1
ABC-1 dispatched
ABC-1 returned complete, PR #10, 1 review round, head a1b2c3d, tracker: TRACKER.md
FOLLOWUP: ABC-1 bug: totals double-count refunds
WAVE: ABC-2
ABC-2 dispatched
ABC-2 returned blocked: which currency for legacy rows?
ABC-2 parked
ABC-1 merged, PR #10, merge commit e4f5a6b, branch deleted
ABC-1 close-tracking dispatched
FILED: ABC-3 ready bug from ABC-1
ABC-1 tracking closed, e7f8a9b
ORDER: ABC-3 (auto) (serial)
WAVE: ABC-3
ABC-3 dispatched
`;

  test("later passes replace the order; earlier tickets keep their rows", () => {
    const p = parseSprintLog(AUTO);
    expect(p.title).toBe("sprint 17 — auto");
    expect(p.order).toEqual(["ABC-3"]);
    expect(p.serial).toBe(true);
    expect(p.tickets["ABC-1"].mergedInLog).toBe(true);
    expect(p.tickets["ABC-2"].parked).toBe(true);
    expect(p.tickets["ABC-3"].dispatched).toBe(true);
    expect(Object.keys(p.tickets).sort()).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    expect(p.run).toBe("running");
  });
});

describe("buildSprintState — auto loop", () => {
  const LOG = `ORDER: ABC-1, ABC-2, ABC-3 (auto)
WAVE: ABC-1 ABC-2 ABC-3
ABC-1 dispatched
ABC-2 dispatched
ABC-3 dispatched
ABC-1 returned complete, PR #10, 1 review round, head a1b2c3d
ABC-2 returned complete, PR #11, 1 review round, head b2c3d4e
ABC-3 returned complete, PR #12, 1 review round, head c3d4e5f
FOLLOWUP: ABC-1 improvement: cache the price lookup
ABC-1 merged, PR #10, merge commit e4f5a6b, branch deleted
ABC-2 merge skipped: e2e check failing on main
FILED: ABC-4 proposed improvement from ABC-1
FILED: ABC-5 ready bug from ABC-1
FILED: skipped, duplicate of ABC-0: flaky clock
`;
  const state = (log = LOG) =>
    buildSprintState({
      sprint: parseSprintLog(log),
      sprintId: "sprint-17",
      roundFiles: [],
      qaSignals: [],
      now: new Date("2026-09-27T12:00:00Z"),
    });

  test("a merge skip waits on me; a finished PR mid-loop does not", () => {
    const s = state();
    expect(s.mode).toBe("auto");
    expect(s.tickets.map((t) => `${t.id}:${t.state}`)).toEqual([
      "ABC-1:merged",
      "ABC-2:merge-skipped",
      "ABC-3:ready-to-merge",
    ]);
    expect(s.awaiting).toEqual(["ABC-2 merge skipped: e2e check failing on main"]);
  });

  test("only proposed filings are listed for triage", () => {
    expect(state().proposed).toEqual(["ABC-4 improvement (from ABC-1)"]);
  });

  test("a re-dispatch clears the skip", () => {
    const s = state(LOG + "ABC-2 rebase-dispatch dispatched\n");
    expect(s.tickets.find((t) => t.id === "ABC-2")?.state).toBe("in-progress");
    expect(s.awaiting).toEqual([]);
  });

  test("auto and serial both show in the mode", () => {
    const s = state(LOG.replace("(auto)", "(auto) (serial)"));
    expect(s.mode).toBe("auto · serial");
  });
});
