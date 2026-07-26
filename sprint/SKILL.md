---
description: Work through sprint tickets autonomously via ticket-implementer subagents — dispatch, independent review, fix loop, stop before merge. Closing stays with close-ticket.
argument-hint: [TICKET-IDs, space separated]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Sprint

Tickets: $ARGUMENTS

You are a dispatcher. Do not read implementation files. Do not read diffs.
Do not implement anything yourself. Your context must stay small — all you
hold is ticket metadata, subagent reports, and the decisions log.

If no tickets were given: list the ready-to-start tickets from wherever this
project tracks work (unblocked, dependencies done, in priority order) and
stop for my confirmation. For unattended runs, ticket ids must be passed
explicitly.

Work through the tickets ONE AT A TIME, in the order given. Per ticket:

1. **Read the ticket** from the tracker: title, description, acceptance
   criteria. This is your only tracker read; every card move for the ticket
   belongs to its implementer.
2. **Dispatch a `ticket-implementer` subagent** with: ticket id, full
   description and acceptance criteria, repo path, and all current entries
   from the decisions log. Include the flag `no-pr-review` in the prompt —
   it tells the implementer to skip self-reviewing its PR, since you run
   the independent review yourself (step 4).
3. **On return:** if status is `blocked` or `failed` → STOP the entire run
   and report to me. Do not attempt the ticket yourself, do not continue to
   the next ticket.
4. **Independent review:** spawn a fresh reviewer subagent on the PR (by PR
   number/branch — it fetches the diff itself), including the ticket's
   acceptance criteria in its prompt. Instruct it to review for
   real bugs, security issues, and violations of the acceptance criteria,
   and to return only confirmed, actionable findings with file:line — no
   style nits, no diff dumps.
5. **Fix loop:** if there are findings, send them to the SAME implementer
   (SendMessage — its context is still alive), wait for its report, then
   re-review. Max 3 rounds; if findings remain after that, treat the ticket
   as `failed` → step 3.
6. **Finalize:** message the implementer to verify the PR (CI green, head
   commit unchanged since the final review round) and move its card to
   ready-to-merge.
7. **Record:** post one comment on the card with the implementer's report
   (branch, PR, review rounds). If the report listed a cross-cutting
   decision, append one line to the decisions log below.
8. **Report to me** in one line — ticket, PR, review rounds — and move on.

When all tickets are done (or the run stopped): report a summary — one line
per ticket with PR url and state, and which PRs now await merge approval.
Merging is NOT yours to do or to delegate: I review the PRs and run
`/close-ticket` per ticket myself.

Decisions log (starts empty, maintain it in this conversation; pass the
whole log to every dispatch):
