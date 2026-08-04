---
description: Report where the project stands — reads whatever the project uses for tracking plus current git state, then summarizes current focus, work in progress, what shipped, and tags every remaining ticket by who can act (dispatchable via /sprint, needs input, needs you, blocked). Read-only.
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git branch:*), Bash(git diff:*), Bash(git show:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh issue list:*), Bash(gh issue view:*)
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
   PR's review state — approved-but-unmerged or changes-requested often _is_
   the immediate next action. If tracking files and git disagree, trust git
   for what's actually landed.
3. **Report** concisely, in this order — least actionable first, building
   to the call to action as the final lines of output. Render each of the
   five sections as a `##` heading, so they sit visually above the `###`
   groups inside "Next up". Every ticket line, in any section, uses one
   shape — `- **<id>** <title>` with the tracker's native id (`#42`,
   `T-42`, …) — plus the group's `— gap:` / `— action:` / blocked-on
   suffix where the group requires one.
   - **Focus:** active milestone/sprint/phase, if the project tracks one;
     include progress when countable, e.g. `Sprint 4 — 5/9 done`.
   - **Shipped recently:** latest done/changelog entries or closed
     issues — cap at 5, one line each.
   - **Blockers:** non-ticket blockers only — broken environment, CI down,
     waiting on an external party. Ticket-level blocks belong under
     `### Blocked` in "Next up" below; don't repeat them here. Omit the
     section if empty.
   - **In progress:** current branch → its ticket, uncommitted changes,
     open PR state.
   - **Next up:** ALL not-done tickets, grouped by who can act on them.
     Render each non-empty group as a `###` heading with a count —
     e.g. `### Dispatchable (3)` — and the group's tickets as a bullet
     list under it. No `---` separators between groups; the headings
     carry the structure. Never inline the category as a tag on the
     ticket line; the heading IS the category. Omit empty groups
     entirely.

     Scope: if the project tracks a current sprint/milestone, list every
     remaining ticket in it and nothing from the backlog; with no sprint,
     fall back to the top ~5 by the project's priority signal (labels,
     milestone, backlog order — in that preference). Don't repeat tickets
     already shown under "In progress". If the list is empty — every
     sprint ticket is done — say "all sprint tickets done" and suggest
     running /plan-sprint to plan the next sprint.

     Groups are judged from the ticket text alone — "looks dispatchable" is
     not a guarantee; an implementer can still hit hidden ambiguity and
     block mid-flight. Groups, in this order:
     - `### Dispatchable` — ready to hand to /sprint: unblocked, clear
       acceptance criteria, pure repo work a ticket-implementer can take
       end to end without a human.
     - `### Needs input` — could be dispatched once one specific
       gap is answered: ambiguous criteria, an undecided design/product
       choice, a missing value. Name the gap on the ticket's line
       (e.g. `— gap: which auth provider?`).
     - `### Needs you` — only the human can do it, /sprint
       never can: merging an approved PR, account/access/credential
       setup, decisions, anything outside the repo. Name the action on
       the ticket's line (e.g. `— action: merge PR #41`).
     - `### Blocked` — waiting on another not-done ticket; nobody can
       act yet. Name what it's blocked on.

     End the report with two lines:
     - `Ready to run:` followed by the `/sprint <dispatchable ids>`
       command in backticks so it's cleanly copyable (or "nothing
       dispatchable" and why).
     - `To unlock more:` the minimal set of human actions that converts
       Needs input/Blocked tickets into dispatchable ones (answer X,
       merge PR #N, …). Omit if there's nothing to unlock.
