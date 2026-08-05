---
description: Report where the project stands — reads whatever the project uses for tracking plus current git state, then reports focus, recent ships, blockers, work in progress, and every remaining ticket grouped by who can act (dispatchable via /sprint, needs input, needs you, blocked), ending with a ready-to-run /sprint command. Read-only.
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git branch:*), Bash(git diff:*), Bash(git show:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh issue list:*), Bash(gh issue view:*)
---

# Standup — where are we?

Read-only. Make no edits, commits, or pushes. Gather, then report.

1. **Project tracking.** Find how this project tracks work and read it — don't
   assume a fixed layout. Look for, in rough order of preference:
   - An issue tracker (`gh issue list`, or a Jira/Linear board if configured) —
     open items, recently closed.
   - Repo status files — a sprint/backlog/board dir, `TODO`, `CHANGELOG`, or
     `ROADMAP` markdown. Treat the backlog/open list as the source of truth
     for what work exists and the done/changelog as recently shipped —
     Next-up's reporting scope is decided in step 3, not here.
   - While reading, note dependency/blocked signals: `blocked` labels,
     "depends on #N" in issue bodies, checklist items pointing at other
     tickets — step 3 needs these to judge what's ready to start.
   - If you find no tracking, say so and rely on git state alone.
2. **Git state.** Current branch, `git status`, last few commits — plus ALL
   in-flight work, not just the checked-out branch: `git branch` for local
   branches ahead of main, `gh pr list` for open PRs. Match branches and PRs
   to tickets by the ticket id in the branch name or PR title. Note each
   PR's review state and `gh pr checks` — approved-but-unmerged,
   changes-requested, or red CI often _is_ the immediate next action.
   Sources of truth: `gh` output is authoritative for remote/PR/merge state
   (local refs may be stale; don't fetch — this skill is read-only); git
   beats tracking files for what's actually landed. If a `gh` call fails
   (no remote, unauthenticated, rate-limited), say "couldn't check
   PRs/issues: <reason>" in the report rather than silently showing none.
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
   - **In progress:** every in-flight ticket — the checked-out branch plus
     any other branch or open PR matched to a ticket in step 2 — with
     uncommitted changes and PR/CI state per ticket.
   - **Next up:** the not-done tickets in scope (see Scope below), grouped
     by who can act on them.
     Render each non-empty group as a `###` heading with a count —
     e.g. `### Dispatchable (3)` — and the group's tickets as a bullet
     list under it. No `---` separators between groups; the headings
     carry the structure. Never inline the category as a tag on the
     ticket line; the heading IS the category. Omit empty groups
     entirely.

     Scope — this is a hard boundary, not a preference:
     - If the project tracks a current sprint/milestone, list every
       remaining ticket in it and NOTHING from the backlog — even if
       project instructions name a backlog/tracker file as the place to
       pull work from (that governs picking up work, not standup's
       reporting scope). A sprint counts as current until it is closed or
       archived; all-rows-done does not make it "no sprint".
     - If the current sprint has no not-done tickets, say "all sprint
       tickets done" and suggest running /plan-sprint to plan the next
       sprint. Stop there — do NOT fall back to the backlog.
     - Only when no sprint is tracked at all, fall back to the top ~5
       backlog tickets by the project's priority signal (labels,
       milestone, backlog order — in that preference).
     - Don't repeat tickets already shown under "In progress".

     Groups are judged from the ticket text alone — "looks dispatchable" is
     not a guarantee; an implementer can still hit hidden ambiguity and
     block mid-flight. Groups, in this order:
     - `### Dispatchable` — ready to hand to /sprint: unblocked, clear
       acceptance criteria, pure repo work a ticket-implementer can take
       end to end without a human. A ticket that already has a branch or
       open PR is NEVER Dispatchable — it goes under "In progress" (or
       Needs you, if its PR is approved and waiting on merge); listing it
       here would dispatch a second implementer onto in-flight work.
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
