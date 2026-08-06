---
description: Create or update the project's roadmap — the layer between raw backlog and iterations that plan-sprint and groom-backlog read. Reconciles it against what actually shipped, drafts changes decision-dense (now/next/later with a why and a done-condition each), writes only on go-ahead.
argument-hint: "[focus or change, e.g. 'add payments milestone']"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Roadmap

Run to create the roadmap, revisit it after something shipped, or work in a
specific change ($ARGUMENTS if given). The roadmap is direction, not a
schedule: ordered priorities with reasons, not date promises.

1. **Find the existing roadmap.** A ROADMAP/PLAN file, tracker milestones,
   or epics — read it fully if found. If none exists, ask where it should
   live before creating anything (repo file vs tracker milestones — repo
   default is `ROADMAP.md` only if I confirm it).
2. **Reconcile against reality.** What shipped since the roadmap was last
   touched (changelog, merged PRs, closed tickets) and what the backlog
   actually contains. Mark roadmap items that are: done (should be marked
   or removed), stale (superseded by a decision or by shipped work), or
   missing (a theme the backlog clearly has tickets for that the roadmap
   never mentions).
3. **Draft the update** — decision-dense, same bar as an architect design:
   - Shape: now / next / later (or the project's existing structure —
     don't restructure a roadmap that has one just to match this template).
   - Each item: one line of what, one line of why now/next/later, and a
     done-condition — what observable thing makes it complete.
   - Ordering is a decision: if I've given no priority signal, propose one
     and mark it as your proposal.
   - Scope changes (adding/dropping/reordering items) are highlighted
     separately from bookkeeping (marking done, pruning stale) — I approve
     scope, bookkeeping just needs a glance.
4. **Iterate with me until approved.** The roadmap is my call end to end;
   your job is a sharp draft and honest reconciliation, not quiet
   rewrites.
5. **Write it** where step 1 settled, in the project's format. Commit if
   repo files changed (`chore: update roadmap`) and push — asking first if
   the current branch isn't the integration branch.
6. **Report** one line: what changed (items added/done/pruned/reordered),
   and — if backlog tickets now obviously serve a new item — a pointer to
   run /groom-backlog to align them.
