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
   PR's review state — approved-but-unmerged or changes-requested often *is*
   the immediate next action. If tracking files and git disagree, trust git
   for what's actually landed.
3. **Report** concisely:
   - **Focus:** active milestone/sprint/phase, if the project tracks one.
   - **In progress:** current branch → its ticket, uncommitted changes,
     open PR state.
   - **Shipped recently:** latest done/changelog entries or closed issues.
   - **Next up:** ALL not-done tickets, each tagged by who can act on it,
     listed in this order:
       - `[dispatchable]` — ready to hand to /sprint: unblocked, clear
         acceptance criteria, pure repo work a ticket-implementer can take
         end to end without a human.
       - `[needs input: <what>]` — could be dispatched once one specific
         gap is answered: ambiguous criteria, an undecided design/product
         choice, a missing value. Name the gap in the tag.
       - `[needs you: <action>]` — only the human can do it, /sprint
         never can: merging an approved PR, account/access/credential
         setup, decisions, anything outside the repo. Name the action in
         the tag (e.g. `[needs you: merge PR #41]`).
       - `[blocked: <on what>]` — waiting on another not-done ticket;
         nobody can act yet.
     Scope: if the project tracks a current sprint/milestone, list every
     remaining ticket in it and nothing from the backlog; with no sprint,
     fall back to the top ~5 by the project's priority signal (labels,
     milestone, backlog order — in that preference). Don't repeat tickets
     already shown under "In progress". If the list is empty — every
     sprint ticket is done — say "all sprint tickets done" and suggest
     running /plan-sprint to plan the next sprint.
     End with two lines:
       - `Ready to run: /sprint <dispatchable ids>` (or "nothing
         dispatchable" and why).
       - `To unlock more:` the minimal set of human actions that converts
         [needs input]/[blocked] tickets into dispatchable ones (answer X,
         merge PR #N, …). Omit if there's nothing to unlock.
     Tags are judged from the ticket text alone — "looks dispatchable" is
     not a guarantee; an implementer can still hit hidden ambiguity and
     block mid-flight.
   - **Blockers:** non-ticket blockers only — broken environment, CI down,
     waiting on an external party. Ticket-level blocks already appear in
     "Next up" as tags; don't repeat them here. Omit the section if empty.
