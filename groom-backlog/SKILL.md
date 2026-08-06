---
description: Backlog hygiene — read every open backlog ticket, judge it for staleness, duplication, readiness, and fit against the roadmap, propose keep/fix/merge/kill/promote per ticket, then apply only what I approve.
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Groom backlog

Run periodically, or before /plan-sprint when the backlog has gone unweeded.
Nothing is closed, edited, or reordered without my per-ticket approval —
killing someone's ticket is not a bulk operation.

1. **Discover the tracker and the plan.** Find where the project tracks
   work (issue tracker or backlog/board files) and whether a roadmap/plan
   exists (ROADMAP file, tracker milestones/epics) — fit is judged against
   it when it exists, and skipped when it doesn't.
2. **Scope: the backlog only.** Open tickets not in the current iteration
   and not in progress (no branch, no PR — check, don't assume). The
   current sprint's tickets are /sprint and /standup territory; don't touch
   them.
3. **Judge each ticket** — evidence, not vibes:
   - **Stale/superseded:** does recently shipped work (changelog, merged
     PRs, closed tickets) already cover it? Cite what supersedes it.
   - **Duplicate:** same problem as another open ticket → propose merging
     into the better-specified one.
   - **Not ready:** missing acceptance criteria, an unsettled decision, or
     an undeclared dependency — name the specific gap (recorded on the
     ticket in step 5; /plan-sprint's only-pull-ready check reads it when
     drafting the next iteration).
   - **Off-plan:** doesn't serve any roadmap item, if a roadmap exists —
     flag it, don't judge its worth yourself; keep-vs-kill on scope is my
     call.
   - **Ready and valuable:** candidate for the next iteration.
4. **Propose** a per-ticket verdict list — keep / fix (with the gap) /
   merge into X / kill (with the evidence) / promote — grouped by verdict,
   one line of why each. Where the tracker has a priority signal, also flag
   mis-ordered tickets (a P1 sitting under P3s). Then stop and wait.
5. **Apply what I approve, ticket by ticket:** close kills with a comment
   linking the superseding work, merge duplicates (fold the better details
   into the survivor, close the other with a pointer), record named gaps on
   the not-ready tickets the way the project marks them, adjust priority
   where I agreed, and mark promotes durably in the project's own signal —
   priority label, backlog order, or milestone — so a later /plan-sprint
   session sees them; a promote that lives only in this conversation's
   report is lost. Anything I didn't explicitly approve stays untouched.
6. **Commit** if tracking files changed (`chore: groom backlog`) and push —
   asking first if the current branch isn't the integration branch.
7. **Report:** counts per verdict (proposed vs applied), the promote list
   as next-iteration candidates for /plan-sprint, and tickets I chose to
   keep against your recommendation — so the next groom doesn't re-litigate
   them; note them wherever the project can carry that marker.
