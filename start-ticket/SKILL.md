---
description: Pick a ticket and implement it — choose (or take) a ready ticket, mark it in progress, branch, build, self-review, and open a PR. Stops before merge; closing is close-ticket's job.
argument-hint: [TICKET-ID]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Start ticket

Run to take a ticket from open to a reviewable PR. Follow in order; stop and
report if a check fails.

1. **Pick the ticket.** Use $1 if given. Otherwise recommend one from
   wherever the project tracks work (discover it — issue tracker, or
   backlog/board/sprint files): only items ready to start — unblocked,
   dependencies done — ordered by the project's priority signal (labels,
   milestone, backlog order). Confirm the pick with me before starting.
2. **Mark it in progress** wherever the project records ticket status, if
   anywhere (tracker transition, or moving it in board/backlog files). Skip
   with a note if there's no tracking.
3. **Branch** off the up-to-date integration branch, following the repo's
   branch-naming convention (infer it from existing branches, e.g. an
   `ABC-123-short-desc` style).
4. **Implement.** Read the ticket's description and acceptance criteria,
   plan briefly, then build. Run the project's lint and tests locally as
   you go; don't proceed with either failing.
5. **Self-review.** Run the code-review skill on the changes and fix
   confirmed findings before opening the PR.
6. **Open a PR** referencing the ticket, with a summary tied to the
   acceptance criteria. Do not merge — that's close-ticket's job.
7. **Report** one line: ticket, branch, PR link.
