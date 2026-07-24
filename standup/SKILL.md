---
description: Report where the project stands — reads whatever the project uses for tracking plus current git state, then summarizes current focus, work in progress, what shipped, and recommends what to pick up next. Read-only.
---

# Standup — where are we?

Read-only. Make no edits, commits, or pushes. Gather, then report.

1. **Project tracking.** Find how this project tracks work and read it — don't
   assume a fixed layout. Look for, in rough order of preference:
   - An issue tracker (`gh issue list`, or a Jira/Linear board if configured) —
     open items, recently closed.
   - Repo status files — a sprint/backlog/board dir, `TODO`, `CHANGELOG`, or
     `ROADMAP` markdown. Treat the backlog/open list as the source of truth and
     the done/changelog as recently shipped.
   - While reading, note dependency/blocked signals: `blocked` labels,
     "depends on #N" in issue bodies, checklist items pointing at other
     tickets — step 3 needs these to judge what's ready to start.
   - If you find no tracking, say so and rely on git state alone.
2. **Git state.** Current branch, `git status`, last few commits on it, and
   `gh pr list` for open PRs (skip PRs if there's no GitHub remote). Note each
   PR's review state — approved-but-unmerged or changes-requested often *is*
   the immediate next action. If tracking files and git disagree, trust git
   for what's actually landed.
3. **Report** concisely:
   - **Focus:** active milestone/sprint/phase, if the project tracks one.
   - **In progress:** current branch → its ticket, uncommitted changes,
     open PR state.
   - **Shipped recently:** latest done/changelog entries or closed issues.
   - **Next up:** 2–3 candidate items that are actually ready to start —
     unblocked, dependencies done, not overlapping with in-progress work.
     Order by the project's priority signal (labels, milestone, backlog
     order — in that preference). End with one recommended pick and a
     one-line why.
   - **Blockers:** anything flagged blocked or waiting on go-ahead.
