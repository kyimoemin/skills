import { describe, expect, test } from "bun:test";
import { buildState, parseAutopilotLog, parseSprintLog } from "./parse";
import { mdCell, mermaidLabel, renderMarkdown, safeFeatureName } from "./render-md";

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
