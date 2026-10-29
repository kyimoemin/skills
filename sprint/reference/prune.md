# Sprint: doc prune proposal and apply

Read from `~/.claude/skills/sprint/SKILL.md` when the prune check says a
pass is due, when `.sprint/prune-approved` exists at a close-tracking
dispatch, or when I approve or ask for prune cuts.

**The dispatch** is one fresh `general-purpose` subagent with the repo path,
the doc list, the output path, and this brief: read each doc end to end;
for every section, ask whether it still changes what an agent or I would
do. Propose cuts, merges of sections that say the same thing, and notes
that are outdated or contradicted by the code or a later decision — each
with the lines affected and a one-line reason. Keep rules that record a
past failure even when they look redundant, and say so rather than cut
them; the story behind a rule isn't in the doc. Write the proposal to the
output path in the main checkout (`.sprint/prune-<run log name>.md`, e.g.
`prune-sprint-16-3.md`). Edit no tracked file. Return one line: cuts
proposed and lines saved.

You don't read the proposal — I do. Applying it is outside this run: it
rides along with the NEXT run's close-tracking, so doc edits never get a
PR (and a version bump) of their own, and closing tickets never waits on
my doc review.

- **When I approve** some or all of it (any time, in or after the run),
  write `.sprint/prune-approved`: the proposal path on the first line, then
  the approved item numbers (or `all`) and any changes I asked for, one per
  line. It's a state file, not a log, so the Write tool is fine. Then sync
  the archive — the next run may be on another machine.
- **At the next close-tracking dispatch** (merge phase step 3), read
  `prune-approved` from the archive first, falling back to the local file,
  as for `prune-last`. If it exists, add to the prompt
  `prune: apply <items> from <proposal path>` plus my changes. On a card
  tracker, where a close makes no commit, there is nothing to ride on:
  dispatch the cuts as a standalone PR instead (below).
- **When that close lands** (direct commit, or tracking PR merged), delete
  `.sprint/prune-approved`, append `PRUNE: applied <items> from <proposal>,
  <sha | tracking PR #n>`, and sync.

If I want the cuts in now rather than at the next close, dispatch a
`general-purpose` subagent to make them as an ordinary PR under the repo's
workflow (branch, version bump and changelog if the repo requires them),
and merge only on my word, like any PR.
