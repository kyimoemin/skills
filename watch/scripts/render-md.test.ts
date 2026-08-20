import { describe, expect, test } from "bun:test";
import { buildSprintState, buildState, parseAutopilotLog, parseSprintLog } from "./parse";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectState,
  looksLikeSprintLog,
  mdCell,
  mermaidLabel,
  renderMarkdown,
  safeFeatureName,
  sprintIdAndRun,
} from "./render-md";

const NOW = new Date("2026-08-10T12:00:00Z");

const MID_RUN = `FEATURE: user-auth
MODE: merge=manual
STAGE: shape complete → docs/product/briefs/user-auth.md, ui: yes
STAGE: design-ui complete → docs/design/ui/user-auth.md
STAGE: architect complete → docs/design/user-auth.md, tickets T-14 T-15 T-16
STAGE: plan-sprint complete → sprint-3 open: T-14 T-15 T-16
STAGE: sprint started → .sprint/sprint-3.md
RUN STOPPED awaiting: merge decision (T-14 #21)
`;

function midRunState() {
  return buildState({
    autopilot: parseAutopilotLog(MID_RUN),
    autopilotLogPath: ".sprint/autopilot-user-auth.md",
    sprints: [
      parseSprintLog(
        "T-14 dispatched\nT-14 returned complete, PR #21, 2 review rounds, head 4f2a91c, ready-to-merge, tracker: board\nT-15 dispatched\n",
      ),
    ],
    roundFiles: ["review-T-15-r1.md"],
    qaSignals: [],
    now: NOW,
  });
}

describe("renderMarkdown", () => {
  test("mid-run: waiting panel, stopped stage, ticket rows", () => {
    const md = renderMarkdown(midRunState());
    expect(md).toContain("# Autopilot progress — user-auth");
    expect(md).toContain("## ⏸ Waiting on you");
    expect(md).toContain("- merge decision (T-14 #21)");
    expect(md).toContain("```mermaid");
    // current stage is sprint, run stopped → waiting class + ⏸ mark
    expect(md).toMatch(/s4\["sprint ⏸"\]/);
    expect(md).toMatch(/class s4 waiting/);
    // completed stages are done
    expect(md).toMatch(/class s0,s1,s2,s3 done/);
    expect(md).toContain("| `T-14` | 🟡 ready-to-merge | #21 | 2 |");
    expect(md).toContain("| `T-15` | 🔵 in-review (round 1) |");
    expect(md).toContain("| `T-16` | ⚪ pending |");
    expect(md).toContain("Raw log tail");
  });

  test("complete run: banner, no stage chip, done end node", () => {
    const full = MID_RUN.replace(
      "RUN STOPPED awaiting: merge decision (T-14 #21)\n",
      "STAGE: sprint complete → merged T-14 T-15 T-16\nSTAGE: qa complete → pass T-14 T-15 T-16\nSTAGE: retro complete\nRUN COMPLETE\n",
    );
    const md = renderMarkdown(
      buildState({
        autopilot: parseAutopilotLog(full),
        sprints: [],
        roundFiles: [],
        qaSignals: [],
        now: NOW,
      }),
    );
    expect(md).toContain("## ✅ Run complete");
    expect(md).toContain('s7{{"complete ✓"}}');
    expect(md).toContain("| `T-14` | 🟢 qa-pass |");
    expect(md).not.toContain("**Stage:**");
  });

  test("second iteration renders history section", () => {
    const two =
      MID_RUN +
      "ANSWER: merge T-14 T-15 T-16\nSTAGE: sprint complete → merged T-14 T-15 T-16\nSTAGE: qa complete → pass T-14 T-15\nSTAGE: retro complete\nSTAGE: plan-sprint complete → sprint-4 open: T-16\n";
    const md = renderMarkdown(
      buildState({
        autopilot: parseAutopilotLog(two),
        sprints: [],
        roundFiles: [],
        qaSignals: [],
        now: NOW,
      }),
    );
    expect(md).toContain("_Iteration 2 shown; earlier iterations below._");
    expect(md).toContain("## Iterations");
    expect(md).toContain("**sprint-3**");
    expect(md).toContain("**sprint-4**");
  });
});

describe("sanitizers", () => {
  test("feature name cannot steer the write path", () => {
    expect(safeFeatureName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFeatureName("user auth!")).toBe("user-auth-");
    expect(safeFeatureName(undefined)).toBe("run");
    expect(safeFeatureName("...")).toBe("run");
  });

  test("mermaid labels lose markup characters", () => {
    expect(mermaidLabel('x"] --> evil["y')).toBe("x'' --' evil''y");
    expect(mermaidLabel("a;b{c}d`e`")).toBe("a'b'c'd'e'");
  });

  test("table cells escape pipes and tags", () => {
    expect(mdCell("a|b <script>")).toBe("a\\|b &lt;script>");
  });
});

import { SPRINT_STANDALONE } from "./fixtures";

describe("renderMarkdown — sprint view", () => {
  const md = () =>
    renderMarkdown(
      buildSprintState({
        sprint: parseSprintLog(SPRINT_STANDALONE),
        sprintId: "sprint-3",
        sprintLogPath: ".sprint/sprint-3.md",
        sprintRun: 1,
        roundFiles: ["review-ABC-9-r1.md"],
        qaSignals: [],
        now: NOW,
      }),
    );

  test("sprint header, funnel, tickets, waves, decisions", () => {
    const out = md();
    expect(out).toContain("# Sprint progress — sprint-3");
    expect(out).not.toContain("(run ");
    expect(out).toContain("**Mode:** serial");
    expect(out).toContain("Source: `.sprint/sprint-3.md`");
    expect(out).toContain("## ⏸ Waiting on you");
    expect(out).toContain("- merge decision (ABC-12 #204)");
    expect(out).toContain('n1["working 1"]');
    expect(out).toContain('n2["ready to merge 1"]');
    expect(out).toContain('n4["parked 1"]');
    expect(out).toContain("class n3 pending"); // nothing merged yet
    expect(out).toContain("| `ABC-12` | 🟡 ready-to-merge | #204 | 2 |");
    expect(out).toContain("- **wave 1** — `ABC-12` `ABC-15`");
    expect(out).toContain("## Decisions");
    expect(out).toContain("Raw log tail");
    // the feature pipeline belongs to autopilot only
    expect(out).not.toContain("plan-sprint");
  });

  test("re-runs are labelled by run number", () => {
    const out = renderMarkdown(
      buildSprintState({
        sprint: parseSprintLog(SPRINT_STANDALONE),
        sprintId: "sprint-3",
        sprintRun: 2,
        roundFiles: [],
        qaSignals: [],
        now: NOW,
      }),
    );
    expect(out).toContain("# Sprint progress — sprint-3 (run 2)");
  });

  test("a log that titles itself is headed by its own name, not the family id", () => {
    const out = renderMarkdown(
      buildSprintState({
        sprint: parseSprintLog("# §4 — wave-3.5 DI track\n" + SPRINT_STANDALONE),
        sprintId: "redesign",
        sprintRun: 13,
        roundFiles: [],
        qaSignals: [],
        now: NOW,
      }),
    );
    expect(out).toContain("# Sprint progress — §4 — wave-3.5 DI track");
    expect(out).not.toContain("redesign (run 13)");
  });
});

describe("sprint log discovery", () => {
  test("ORDER: as the first entry is the signal, stamps allowed", () => {
    expect(looksLikeSprintLog("ORDER: ABC-1\nABC-1 dispatched\n")).toBe(true);
    expect(looksLikeSprintLog("\n[2026-08-10 09:12] ORDER: ABC-1\n")).toBe(true);
    // a run may title itself above ORDER: — redesign-10/-11 in the wild did,
    // and were invisible to the renderer while a heading disqualified a log
    expect(looksLikeSprintLog("# Redesign run 10 — DI track\n\nORDER: DI-1\n")).toBe(true);
    // prose before ORDER: still isn't a run log
    expect(looksLikeSprintLog("some notes\nORDER: ABC-1\n")).toBe(false);
    expect(looksLikeSprintLog("")).toBe(false);
  });

  test("a -N suffix is a run number only when the base log exists", () => {
    const dir = ["sprint-3.md", "sprint-3-2.md"];
    expect(sprintIdAndRun("sprint-3.md", dir)).toEqual({ id: "sprint-3", run: 1 });
    expect(sprintIdAndRun("sprint-3-2.md", dir)).toEqual({ id: "sprint-3", run: 2 });
    // no "sprint.md" in the directory → "sprint-3" is the id, not run 3
    expect(sprintIdAndRun("sprint-3.md", ["sprint-3.md"])).toEqual({ id: "sprint-3", run: 1 });
    // date fallback ids survive the same way
    expect(sprintIdAndRun("2026-08-19.md", ["2026-08-19.md"])).toEqual({
      id: "2026-08-19",
      run: 1,
    });
  });
});

// A run that stopped on a gate and never got its RUN COMPLETE (redesign-8.md
// in the wild) used to read as the one "active" log forever, pinning the view
// to its family and outranking every run that came after it.
describe("collectState — run selection", () => {
  const project = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), "watch-test-"));
    mkdirSync(join(dir, ".sprint"));
    // mtime decides which log is newest, so stagger it explicitly rather
    // than relying on write order landing on distinct filesystem timestamps
    Object.entries(files).forEach(([name, text], i) => {
      const path = join(dir, ".sprint", name);
      writeFileSync(path, text);
      const t = new Date(2026, 0, 1 + i);
      utimesSync(path, t, t);
    });
    return dir;
  };

  test("an abandoned older log doesn't claim the view, same family", async () => {
    const dir = project({
      "s.md": "ORDER: A-1\nA-1 dispatched\nA-1 merged\nRUN COMPLETE\n",
      "s-2.md": "ORDER: A-2\nA-2 dispatched\nNOTE: stopped on a gate, never terminated\n",
      "s-3.md": "# §4 — the run I just did\nORDER: A-3\nA-3 dispatched\nA-3 merged\nRUN COMPLETE\n",
    });
    const { state } = await collectState(dir);
    expect(state?.sourceLog).toBe(".sprint/s-3.md");
    expect(state?.title).toBe("§4 — the run I just did");
    expect(state?.run).toBe("complete");
  });

  test("an unterminated newest run still owns the view", async () => {
    const dir = project({
      "s.md": "ORDER: A-1\nA-1 dispatched\nA-1 merged\nRUN COMPLETE\n",
      "s-2.md": "ORDER: A-2\nA-2 dispatched\n",
    });
    const { state } = await collectState(dir);
    expect(state?.sourceLog).toBe(".sprint/s-2.md");
    expect(state?.run).toBe("running");
  });

  test("an abandoned older log doesn't claim the view, different family", async () => {
    const dir = project({
      "sprint-06.md": "ORDER: A-1\nA-1 dispatched\nDECISION: filed a follow-up, never terminated\n",
      "sprint-09.md": "ORDER: A-9\nA-9 dispatched\nA-9 merged\nRUN COMPLETE\n",
    });
    const { state } = await collectState(dir);
    expect(state?.sourceLog).toBe(".sprint/sprint-09.md");
  });
});
