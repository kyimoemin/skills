# Sprint: project runs

Read from `~/.claude/skills/sprint/SKILL.md` when a run starts from a project
folder. Everything in SKILL.md still applies, per repo, with these changes.

A project run is started from a folder that holds several repos. That
folder isn't itself a repo, and its `CLAUDE.md` maps ticket prefixes to
repos in a `## Repos` table. It lets one session plan across repos whose
tickets depend on each other. The rest of this file applies with these
changes:

- **Routing.** A ticket's prefix names its repo (`AD-11` → the `AD` row's
  path). Each repo keeps its own tracker; find it there as usual. `all`,
  `auto` and the no-argument listing read every mapped repo's tracker. A
  ticket whose prefix isn't in the table: stop and ask.
- **Logs stay per repo.** Each ticket's lines go in its own repo's
  `.sprint/` log, never the project folder's and never another repo's. That
  keeps `/watch`, `/qa`, `/standup` and the archive ref working inside each
  repo. Each repo in the run gets its own log, with its own heading and an
  `ORDER:` line holding only that repo's tickets. Put `PROJECT: <folder
  name>` on the line right after its first `ORDER:`. That line is how a
  resume finds the run's other logs and how a single-repo run knows to
  keep out. `WAVE:` lines go in each repo's log with that repo's share of
  the wave.
- **Keep out of a single-repo run.** A repo whose newest log doesn't end in
  `RUN COMPLETE` and has no `PROJECT:` line belongs to a run started inside
  that repo, which may be stopped and waiting on me rather than dead. Don't
  replay it or add to it, even if it shares tickets with this run. Leave
  that repo's tickets out, list them as skipped (`owned by
  <repo>/.sprint/<log>`), and tell me. It's my call whether to finish that
  run in its repo or tell you it's abandoned.
- **Dependencies across repos need `merged`, not `complete`.** A ticket
  that waits on another repo builds against that repo's base branch (its
  mock server, its API reference), so an open PR upstream doesn't help it.
  Before
  dispatching the dependent ticket, put the upstream repo's main checkout
  on the merged PR's base branch (`gh pr view <n> --json baseRefName`,
  never the repo default) and bring it up to date: `git -C <repo> checkout
  <base>`, then `git -C <repo> pull --ff-only`. Do this only if that
  checkout is clean; if it isn't, stop and tell me. Dependencies inside one
  repo are unchanged.
- **Manual mode keeps going after the merge word.** A ticket held on a
  dependency in another repo can't start until I say merge. My merge word
  covers the batch I named, so after the merge phase continue with the
  tickets it unblocked: new waves, then stop again before their merge as
  usual. `auto` handles this with its passes already.
- **Waves: one ticket per repo, no worktree isolation.** The project folder
  isn't a repo, so `isolation: "worktree"` has nothing to isolate from.
  Each implementer works in its repo's main checkout, so a wave takes at
  most one ticket per repo. Parallelism comes from different repos. To run
  several tickets of ONE repo in parallel, run `/sprint` inside that repo.
  A **hub** repo (`yes` in the table's Hub column) is one the others run
  against from its main checkout, such as a mock server. A hub ticket never
  shares a wave with a ticket from another repo, because that implementer
  would be testing against whatever branch the hub implementer has checked
  out. Hub tickets run in their own waves; the other repos' tickets run in
  parallel with each other. An implementer leaves its checkout on its
  ticket branch, so after every hub wave put the hub's main checkout back
  on the base its PRs target (`git -C <hub> checkout <base>`, from
  `baseRefName`), if the checkout is clean. If it isn't, stop and tell me.
  Otherwise the next wave tests against unmerged hub code.
- **Dispatch.** The repo path is the ticket's repo. Add `cwd: <repo path>`
  to the prompt, since the implementer starts in the project folder. Send
  the `DECISION:` lines from every log in this run, not just the ticket's
  repo, because a decision in one repo can change a ticket in another.
- **Close-tracking: one dispatch per repo** per merge phase. Each repo has
  its own tracker file.
- **One watcher, archive per repo.** Start the watcher once, on the
  project folder, when the first log exists: `bun run
  ~/.claude/skills/watch/scripts/render-md.ts <project folder> --watch`. It
  keeps every repo's own progress file up to date and writes the combined
  `<project folder>/sprint-progress.md`, and it picks up a repo whose
  `.sprint/` appears later. Run the archive sync with each repo as the
  working directory. The recipe's paths are relative to the repo root.
- **Ending.** When the run stops or finishes, give every repo log its own
  terminator (`RUN STOPPED awaiting: …` or `RUN COMPLETE`), judged on that
  log's tickets alone. The report covers every repo.
- **Resume.** Look at each mapped repo's newest log. Every one with a
  `PROJECT:` line and no `RUN COMPLETE` belongs to the run. Replay them
  together.
