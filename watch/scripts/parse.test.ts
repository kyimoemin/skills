import { describe, expect, test } from "bun:test";
import {
  buildState,
  parseAutopilotLog,
  parseSprintLog,
  qaFilesByTicket,
  qaHint,
  roundsFromFiles,
} from "./parse";

// Fixture: the example log from autopilot/SKILL.md, verbatim.
const AUTOPILOT_FULL = `FEATURE: user-auth
MODE: merge=manual
STAGE: shape complete → docs/product/briefs/user-auth.md, ui: yes
STAGE: design-ui complete → docs/design/ui/user-auth.md
STAGE: architect complete → docs/design/user-auth.md, tickets T-14 T-15 T-16
STAGE: plan-sprint complete → sprint-3 open: T-14 T-15 T-16
STAGE: sprint started → .sprint/sprint-3.md
RUN STOPPED awaiting: T-16 question (see sprint log), merge decision (T-14 #21, T-15 #22)
ANSWER: merge T-14 T-15
RUN STOPPED awaiting: merge decision (T-16 #23)
ANSWER: merge T-16
STAGE: sprint complete → merged T-14 T-15 T-16
STAGE: qa complete → pass T-14 T-15 T-16
STAGE: retro complete
ANSWER: next feature
RUN COMPLETE
`;

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

describe("parseAutopilotLog", () => {
  test("full completed run", () => {
    const p = parseAutopilotLog(AUTOPILOT_FULL);
    expect(p.feature).toBe("user-auth");
    expect(p.mode).toBe("merge=manual");
    expect(p.run).toBe("complete");
    expect(p.awaiting).toEqual([]);
    expect(p.currentStage).toEqual({ name: "complete", inferred: false });

    expect(p.groundwork.map((g) => g.stage)).toEqual([
      "shape",
      "design-ui",
      "architect",
    ]);
    expect(p.groundwork[0].ui).toBe(true);
    expect(p.groundwork[0].artifact).toBe("docs/product/briefs/user-auth.md");
    expect(p.groundwork[2].tickets).toEqual(["T-14", "T-15", "T-16"]);
    expect(p.groundwork[2].artifact).toBe("docs/design/user-auth.md");
    expect(p.featureTickets).toEqual(["T-14", "T-15", "T-16"]);

    expect(p.iterations).toHaveLength(1);
    const it = p.iterations[0];
    expect(it.sprint).toBe("sprint-3");
    expect(it.sprintLog).toBe(".sprint/sprint-3.md");
    expect(it.tickets).toEqual(["T-14", "T-15", "T-16"]);
    expect(it.stages).toEqual({
      "plan-sprint": "complete",
      sprint: "complete",
      qa: "complete",
      retro: "complete",
    });
    expect(it.mergedTickets).toEqual(["T-14", "T-15", "T-16"]);
    expect(p.qaPassed).toEqual(["T-14", "T-15", "T-16"]);
  });

  test("stopped mid-sprint: awaiting is the latest stop only", () => {
    const cut = AUTOPILOT_FULL.split("ANSWER: merge T-16")[0];
    const p = parseAutopilotLog(cut);
    expect(p.run).toBe("stopped");
    expect(p.awaiting).toEqual(["merge decision (T-16 #23)"]);
    // sprint started is a fact, not an inference
    expect(p.currentStage).toEqual({ name: "sprint", inferred: false });
  });

  test("paren-aware awaiting split", () => {
    const p = parseAutopilotLog(
      "RUN STOPPED awaiting: T-16 question (see sprint log), merge decision (T-14 #21, T-15 #22)",
    );
    expect(p.awaiting).toEqual([
      "T-16 question (see sprint log)",
      "merge decision (T-14 #21, T-15 #22)",
    ]);
  });

  test("current stage inferred after a completion line", () => {
    const p = parseAutopilotLog(
      "FEATURE: x\nSTAGE: architect complete → docs/design/x.md, tickets T-1\n",
    );
    expect(p.currentStage).toEqual({ name: "plan-sprint", inferred: true });
  });

  test("headless brief skips design-ui in inference", () => {
    const p = parseAutopilotLog(
      "FEATURE: x\nSTAGE: shape complete → docs/briefs/x.md, ui: no\n",
    );
    expect(p.currentStage).toEqual({ name: "architect", inferred: true });
  });

  test("second iteration accumulates instead of overwriting", () => {
    const log =
      AUTOPILOT_FULL.replace("ANSWER: next feature\nRUN COMPLETE\n", "") +
      "STAGE: plan-sprint complete → sprint-4 open: T-17\nSTAGE: sprint started → .sprint/sprint-4.md\n";
    const p = parseAutopilotLog(log);
    expect(p.iterations).toHaveLength(2);
    expect(p.iterations[1].sprint).toBe("sprint-4");
    expect(p.iterations[1].tickets).toEqual(["T-17"]);
    expect(p.run).toBe("running");
  });

  test("ANSWER: defer records a deferral", () => {
    const p = parseAutopilotLog("ANSWER: defer T-16 pushed to next cycle\n");
    expect(p.deferred).toEqual([
      { tickets: ["T-16"], reason: "pushed to next cycle" },
    ]);
  });

  test("ascii arrow tolerated", () => {
    const p = parseAutopilotLog("STAGE: design-ui complete -> docs/design/ui/x.md\n");
    expect(p.groundwork[0].artifact).toBe("docs/design/ui/x.md");
  });

  test("[YYYY-MM-DD HH:MM] prefixes parse the same as bare lines", () => {
    // real run: todo project, completion-loop feature stamped every line
    const stamped = AUTOPILOT_FULL.split("\n")
      .map((l) => (l ? `[2026-08-13 11:14] ${l}` : l))
      .join("\n");
    const p = parseAutopilotLog(stamped);
    expect(p.feature).toBe("user-auth");
    expect(p.mode).toBe("merge=manual");
    expect(p.run).toBe("complete");
    expect(p.featureTickets).toEqual(["T-14", "T-15", "T-16"]);
    // rawTail stays verbatim, stamps included
    expect(p.rawTail[p.rawTail.length - 1]).toBe("[2026-08-13 11:14] RUN COMPLETE");
  });
});

// Fixture: a REAL autopilot log (todo project, edit-a-task-title feature),
// verbatim — the drift it carries vs the documented format is the point.
const AUTOPILOT_REAL = `# Autopilot run — edit-a-task-title

FEATURE: edit-a-task-title
MODE: merge=auto
STAGE: shape skipped → docs/product/briefs/edit-a-task-title.md, ui: yes (brief has no Surface line; answered by human)
STAGE: design-ui skipped → docs/design/ui/edit-a-task-title.md
STAGE: architect skipped → docs/design/edit-a-task-title.md, tickets T-7 T-8
ANSWER: sprint-02 scope approved as proposed (T-5 T-6 T-7 T-8)
STAGE: plan-sprint complete → sprint-02 open: T-5 T-6 T-7 T-8 (board/sprint-02.md, commit 4f9ed31); nothing carried forward
STAGE: sprint started → .sprint/sprint-02.md (ORDER: T-5 T-6 T-7 T-8; T-5 dispatched, interrupted)
RUN STOPPED awaiting: T-5 resume decision — branch t-5-focus-return-on-dialog-close exists (2 commits, no PR, card "in progress"): continue on it or start fresh?
ANSWER: T-5 continue on the existing branch (recorded in .sprint/sprint-02.md as the ticket-level ANSWER line)
STAGE: sprint in progress → T-5 #5, T-6 #6, T-7 #7 all complete and ready-to-merge; T-8 not yet dispatched (blocked on T-6 and T-7 merging)
RUN STOPPED awaiting: merge permission — \`gh pr merge\` is blocked by the permission classifier
ANSWER: merge (human, "yes merge") — merge permission granted, merge=auto proceeds
STAGE: sprint complete → merged T-5 #5 (e7b3f02), T-6 #6 (44d54b6), T-7 #7 (d5069ee), T-8 #8 (8f39ba7); all cards done; .sprint/sprint-02.md RUN COMPLETE
STAGE: qa complete → pass T-5 T-6 T-7 T-8 (.sprint/qa-T-5.md, qa-T-6.md, qa-T-7.md, qa-T-8.md); no failures, no unverifiable criteria, no bugs filed
STAGE: retro complete → sprint-02 analysed (4/4 shipped, 7 review rounds, 1 real bug caught at review, 0 QA escapes); capture offer pending
ANSWER: capture retro → append to board/sprint-02.md only (no backlog ticket filed); done as commit 85af8ed
ANSWER: next feature
RUN COMPLETE
`;

describe("parseAutopilotLog — real-world log", () => {
  test("parses the real edit-a-task-title run", () => {
    const p = parseAutopilotLog(AUTOPILOT_REAL);
    expect(p.feature).toBe("edit-a-task-title");
    expect(p.mode).toBe("merge=auto");
    expect(p.run).toBe("complete");
    expect(p.awaiting).toEqual([]);

    const shape = p.groundwork.find((g) => g.stage === "shape")!;
    expect(shape.status).toBe("skipped");
    expect(shape.ui).toBe(true);
    expect(shape.artifact).toBe("docs/product/briefs/edit-a-task-title.md");
    expect(p.featureTickets).toEqual(["T-7", "T-8"]);

    expect(p.iterations).toHaveLength(1);
    const it = p.iterations[0];
    expect(it.sprint).toBe("sprint-02");
    expect(it.tickets).toEqual(["T-5", "T-6", "T-7", "T-8"]);
    // trailing "(ORDER: …)" must not corrupt the path; the later
    // "in progress" note must not overwrite it
    expect(it.sprintLog).toBe(".sprint/sprint-02.md");
    expect(it.stages.sprint).toBe("complete");
    expect(it.mergedTickets).toEqual(["T-5", "T-6", "T-7", "T-8"]);
    expect(p.qaPassed).toEqual(["T-5", "T-6", "T-7", "T-8"]);
  });

  test("feature line with trailing prose keeps only the name", () => {
    const p = parseAutopilotLog(
      "FEATURE: due-dates (build-order step 3; confirmed by human)\n",
    );
    expect(p.feature).toBe("due-dates");
  });

  test("'in progress' note counts as the stage running", () => {
    const cut = AUTOPILOT_REAL.split("RUN STOPPED awaiting: merge permission")[0];
    const p = parseAutopilotLog(cut);
    expect(p.run).toBe("running");
    expect(p.currentStage).toEqual({ name: "sprint", inferred: false });
  });
});

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
});

describe("roundsFromFiles", () => {
  test("max round per ticket, non-round files ignored", () => {
    expect(
      roundsFromFiles([
        "review-T-14-r1.md",
        "review-T-14-r2.md",
        "review-ABC-9-r1.md",
        "qa-T-14.md",
        "autopilot-user-auth.md",
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

describe("buildState", () => {
  const NOW = new Date("2026-08-10T12:00:00Z");

  test("mid-run: live review round beats silent dispatch", () => {
    const ap = parseAutopilotLog(
      `FEATURE: user-auth
MODE: merge=manual
STAGE: architect complete → docs/design/user-auth.md, tickets T-14 T-15 T-16
STAGE: plan-sprint complete → sprint-3 open: T-14 T-15 T-16
STAGE: sprint started → .sprint/sprint-3.md
`,
    );
    const sp = parseSprintLog(
      `T-14 dispatched
T-14 returned complete, PR #21, 2 review rounds, head 4f2a91c, ready-to-merge, tracker: board
T-15 dispatched
`,
    );
    const state = buildState({
      autopilot: ap,
      sprints: [sp],
      roundFiles: ["review-T-14-r1.md", "review-T-14-r2.md", "review-T-15-r1.md"],
      qaSignals: [],
      prs: { 21: { number: 21, state: "OPEN", ci: "green", url: "u" } },
      now: NOW,
    });

    const by = Object.fromEntries(state.tickets.map((t) => [t.id, t]));
    expect(by["T-14"].state).toBe("ready-to-merge");
    expect(by["T-14"].pr?.ci).toBe("green");
    expect(by["T-15"].state).toBe("in-review (round 1)");
    expect(by["T-16"].state).toBe("pending"); // on feature list, not dispatched
    expect(state.currentStage).toEqual({ name: "sprint", inferred: false });
  });

  test("gh MERGED state promotes ticket even without a log merge line", () => {
    const ap = parseAutopilotLog(
      "STAGE: architect complete → d.md, tickets T-1\nSTAGE: plan-sprint complete → sprint-1 open: T-1\nSTAGE: sprint started → .sprint/sprint-1.md\n",
    );
    const sp = parseSprintLog(
      "T-1 dispatched\nT-1 returned complete, PR #5, 1 review round, head abcdef1, ready-to-merge, tracker: board\n",
    );
    const state = buildState({
      autopilot: ap,
      sprints: [sp],
      roundFiles: [],
      qaSignals: [],
      prs: { 5: { number: 5, state: "MERGED" } },
      now: NOW,
    });
    expect(state.tickets[0].state).toBe("merged");
  });

  test("qa pass/fail and deferral terminal states", () => {
    const ap = parseAutopilotLog(
      `STAGE: architect complete → d.md, tickets T-1 T-2 T-3
STAGE: plan-sprint complete → sprint-1 open: T-1 T-2 T-3
STAGE: sprint started → .sprint/sprint-1.md
STAGE: sprint complete → merged T-1 T-2
STAGE: qa complete → pass T-1
ANSWER: defer T-3 not this cycle
`,
    );
    const state = buildState({
      autopilot: ap,
      sprints: [],
      roundFiles: [],
      qaSignals: [
        { ticket: "T-1", path: ".sprint/qa-T-1.md", hint: "pass" },
        { ticket: "T-2", path: ".sprint/qa-T-2.md", hint: "fail" },
      ],
      now: NOW,
    });
    const by = Object.fromEntries(state.tickets.map((t) => [t.id, t]));
    expect(by["T-1"].state).toBe("qa-pass");
    expect(by["T-2"].state).toBe("qa-fail");
    expect(by["T-3"].state).toBe("deferred");
  });

  test("stale round files from an earlier feature create no rows", () => {
    const ap = parseAutopilotLog(
      "FEATURE: completion-loop\nSTAGE: architect complete → d.md, tickets T-5 T-6\n",
    );
    const state = buildState({
      autopilot: ap,
      sprints: [],
      // T-1…T-4 are the previous feature's leftovers in .sprint/
      roundFiles: ["review-T-1-r1.md", "review-T-4-r2.md", "review-T-5-r1.md"],
      qaSignals: [],
      now: NOW,
    });
    expect(state.tickets.map((t) => t.id)).toEqual(["T-5", "T-6"]);
    const by = Object.fromEntries(state.tickets.map((t) => [t.id, t]));
    expect(by["T-5"].reviewRounds).toBe(1); // still decorates known rows
  });

  test("parked tickets surface in awaiting", () => {
    const ap = parseAutopilotLog(
      "STAGE: architect complete → d.md, tickets T-1\nSTAGE: plan-sprint complete → sprint-1 open: T-1\nSTAGE: sprint started → .sprint/sprint-1.md\n",
    );
    const sp = parseSprintLog(
      "T-1 dispatched\nT-1 returned blocked: which auth provider?\nT-1 parked\n",
    );
    const state = buildState({
      autopilot: ap,
      sprints: [sp],
      roundFiles: [],
      qaSignals: [],
      now: NOW,
    });
    expect(state.tickets[0].state).toBe("parked");
    expect(state.awaiting).toEqual(["T-1 parked: which auth provider?"]);
  });
});
