import { describe, expect, test } from "bun:test";
import { buildSprintState, parseSprintLog } from "./parse";
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  collectState,
  CURRENT_NAME,
  generate,
  generateProject,
  githubUrl,
  looksLikeSprintLog,
  mdCell,
  mermaidLabel,
  parseRepoMap,
  PROJECT_NAME,
  projectRepos,
  renderMarkdown,
  renderProjectMarkdown,
  safeFeatureName,
  sprintIdAndRun,
  stamp,
} from "./render-md";

const NOW = new Date("2026-08-10T12:00:00Z");

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

  test("a live run outranks a finished higher-numbered sibling", async () => {
    // two sessions on one sprint: -3 finished first, -2 is still appending
    const dir = project({
      "s.md": "ORDER: A-1\nA-1 dispatched\nA-1 merged\nRUN COMPLETE\n",
      "s-3.md": "ORDER: A-3\nA-3 dispatched\nA-3 merged\nRUN COMPLETE\n",
      "s-2.md": "ORDER: A-2\nA-2 dispatched\n",
    });
    const { state } = await collectState(dir);
    expect(state?.sourceLog).toBe(".sprint/s-2.md");
    expect(state?.run).toBe("running");
  });
});

// One preview left open on progress-current.md follows the runs, so nobody
// has to find which progress-<id>.md is live.
describe("generate — fixed current file", () => {
  const sprintDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "watch-test-"));
    mkdirSync(join(dir, ".sprint"));
    return dir;
  };
  const read = (dir: string, name: string): string =>
    readFileSync(join(dir, ".sprint", name), "utf8");

  test("mirrors the chosen run and follows it to the next sprint", async () => {
    const dir = sprintDir();
    writeFileSync(join(dir, ".sprint", "sprint-06.md"), "ORDER: A-1\nA-1 dispatched\n");
    await generate(dir, undefined);
    expect(read(dir, CURRENT_NAME)).toBe(read(dir, "progress-sprint-06.md"));

    const later = join(dir, ".sprint", "sprint-07.md");
    writeFileSync(later, "ORDER: A-9\nA-9 dispatched\n");
    const t = new Date(Date.now() + 60_000);
    utimesSync(later, t, t);
    await generate(dir, undefined);
    expect(read(dir, CURRENT_NAME)).toBe(read(dir, "progress-sprint-07.md"));
    expect(read(dir, CURRENT_NAME)).toContain("A-9");
  });

  test("a sprint named `current` gets one file, not a clash", async () => {
    const dir = sprintDir();
    writeFileSync(join(dir, ".sprint", "current.md"), "ORDER: A-1\nA-1 dispatched\n");
    const out = await generate(dir, undefined);
    expect(out?.path).toBe(join(dir, ".sprint", CURRENT_NAME));
    expect(readdirSync(join(dir, ".sprint")).sort()).toEqual(["current.md", CURRENT_NAME]);
  });
});

describe("readability", () => {
  const sprintState = (log: string, roundFiles: string[] = []) =>
    buildSprintState({
      sprint: parseSprintLog(log),
      sprintId: "s",
      roundFiles,
      qaSignals: [{ ticket: "A-1", path: ".sprint/qa-A-1.md", hint: "pass" }],
      now: NOW,
    });

  test("the updated stamp carries the date", () => {
    expect(stamp("2026-08-10T12:00:00Z")).toMatch(/^2026-08-1[01] \d\d:\d\d$/);
    expect(renderMarkdown(sprintState("ORDER: A-1\n"))).toMatch(/_updated 2026-08-1[01] \d\d:\d\d_/);
  });

  test("GitHub origins become PR bases; other hosts don't", () => {
    expect(githubUrl("git@github.com:kyimoemin/Muse.git\n")).toBe("https://github.com/kyimoemin/Muse");
    expect(githubUrl("https://github.com/on-ramp/swap-iframe")).toBe("https://github.com/on-ramp/swap-iframe");
    expect(githubUrl("git@gitlab.com:a/b.git")).toBeUndefined();
  });

  test("PR, newest review round and QA file are links", () => {
    const state = sprintState("ORDER: A-1\nA-1 dispatched\nA-1 returned complete, PR #7\nA-1 merged\n", [
      "review-A-1-r1.md",
      "review-A-1-r2.md",
    ]);
    state.repoUrl = "https://github.com/o/r";
    expect(renderMarkdown(state)).toContain(
      "| `A-1` | 🟢 qa-pass | [#7](https://github.com/o/r/pull/7) | [2](review-A-1-r2.md) | [pass](qa-A-1.md) |",
    );
  });

  test("without a GitHub origin the PR stays plain text", () => {
    const md = renderMarkdown(sprintState("ORDER: A-1\nA-1 dispatched\nA-1 returned complete, PR #7\n"));
    expect(md).toContain("| #7 |");
  });

  test("a stopped run shows why it stopped under the waiting list", () => {
    const md = renderMarkdown(sprintState("ORDER: A-1\nA-1 dispatched\nNOTE: host keeps sleeping\nRUN STOPPED at A-1\n"));
    expect(md).toMatch(/- A-1\n\n> \*\*Why it stopped:\*\* host keeps sleeping/);
  });

  test("only the newest five decisions stay in view", () => {
    const log = "ORDER: A-1\n" + Array.from({ length: 7 }, (_, i) => `DECISION: d${i + 1}\n`).join("");
    const md = renderMarkdown(sprintState(log));
    const [folded, visible] = md.split("</details>");
    expect(folded).toContain("<summary>2 earlier</summary>");
    expect(folded).toContain("- d1");
    expect(visible).toMatch(/- d3[\s\S]*- d7/);
    expect(visible).not.toContain("- d2");
  });
});

// A project folder holds several repos; one page shows all their runs.
const REPOS_MD = `# P

## Repos

| Prefix | Path | Hub | What it is |
|---|---|---|---|
| DI | Muse | yes | app |
| AD | \`admin\` | | panel |
| — | legal | | no tickets |

## Other

| Prefix | Path |
|---|---|
| XX | nope |
`;

describe("project folder", () => {
  const projectDir = (repos: Record<string, Record<string, string>>): string => {
    const dir = mkdtempSync(join(tmpdir(), "watch-project-"));
    writeFileSync(join(dir, "CLAUDE.md"), REPOS_MD);
    for (const [repo, files] of Object.entries(repos)) {
      mkdirSync(join(dir, repo, ".sprint"), { recursive: true });
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, repo, ".sprint", name), text);
    }
    return dir;
  };

  test("the Repos table maps prefixed rows only, and ends at the next heading", () => {
    expect(parseRepoMap(REPOS_MD)).toEqual([
      { prefix: "DI", path: "Muse" },
      { prefix: "AD", path: "admin" },
    ]);
    expect(parseRepoMap("## Repos\n\n| Prefix | Path |\n|---|---|\n| `DI` | a |\n| **AD** | b |\n")).toEqual([
      { prefix: "DI", path: "a" },
      { prefix: "AD", path: "b" },
    ]);
    expect(parseRepoMap("# P\n\n## Related repos\n\n| Prefix | Path |\n|---|---|\n| DI | x |\n")).toEqual([]);
  });

  test("a repo is never a project folder, even with a Repos table", () => {
    const dir = projectDir({});
    expect(projectRepos(dir)?.map((r) => r.prefix)).toEqual(["DI", "AD"]);
    execFileSync("git", ["init", "-q", dir]);
    expect(projectRepos(dir)).toBeUndefined();
  });

  const state = (log: string) => buildSprintState({ sprint: parseSprintLog(log), sprintId: "s", roundFiles: [], qaSignals: [], now: NOW });

  test("what waits on me comes first, named by repo; finished runs are one row", () => {
    const md = renderProjectMarkdown(
      "muse",
      [
        { name: "Muse", dir: "Muse", state: state("# DI track\nORDER: DI-1\nDI-1 dispatched\nDI-1 returned complete, PR #3\nDI-1 merged\nRUN COMPLETE\n") },
        { name: "admin", dir: "admin", state: state("ORDER: AD-1\nAD-1 dispatched\nNOTE: mock down\nRUN STOPPED at AD-1\n") },
        { name: "web", dir: "web" },
      ],
      NOW.toISOString(),
    );
    expect(md).toContain("- **admin** · AD-1\n  > **Why admin stopped:** mock down");
    expect(md).toContain(`| [Muse](Muse/.sprint/${CURRENT_NAME}) | DI track | ✅ complete | 1 | 0 | 0 | 1 | 0 |`);
    expect(md).toContain("| web | — | no runs yet |");
    expect(md).toContain("## admin — s");
    expect(md).not.toContain("## Muse —");
  });

  test("ticket links point into the repo's .sprint/", () => {
    const s = buildSprintState({
      sprint: parseSprintLog("ORDER: AD-1\nAD-1 dispatched\nAD-1 returned complete, PR #7\n"),
      sprintId: "s",
      roundFiles: ["review-AD-1-r1.md"],
      qaSignals: [],
      now: NOW,
    });
    const md = renderProjectMarkdown("p", [{ name: "admin", dir: "admin", state: s }], NOW.toISOString());
    expect(md).toContain("[1](admin/.sprint/review-AD-1-r1.md)");
  });

  test("writes the combined page and every repo's own files", async () => {
    const dir = projectDir({
      Muse: { "a.md": "ORDER: DI-1\nDI-1 dispatched\n" },
      admin: { "b.md": "ORDER: AD-1\nAD-1 merged\nRUN COMPLETE\n" },
    });
    const out = await generateProject(dir, projectRepos(dir)!, () => undefined);
    expect(out).toEqual({ path: join(dir, PROJECT_NAME), complete: false });
    expect(readFileSync(out.path, "utf8")).toContain("## ▶ Running");
    expect(readFileSync(join(dir, "Muse", ".sprint", CURRENT_NAME), "utf8")).toContain("DI-1");
    expect(readFileSync(join(dir, "admin", ".sprint", CURRENT_NAME), "utf8")).toContain("AD-1");
  });

  test("complete only when every repo with a run has finished it", async () => {
    const dir = projectDir({ Muse: { "a.md": "ORDER: DI-1\nDI-1 merged\nRUN COMPLETE\n" } });
    expect((await generateProject(dir, projectRepos(dir)!, () => undefined)).complete).toBe(true);
    const empty = projectDir({});
    expect((await generateProject(empty, projectRepos(empty)!, () => undefined)).complete).toBe(false);
  });
});
