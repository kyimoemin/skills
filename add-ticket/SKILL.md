---
description: Capture a bug, idea, or task as a ticket — discover the project's tracker and ticket conventions, check for duplicates, draft the ticket to match, then file it on go-ahead.
argument-hint: [one-line summary]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Add ticket

Run to capture a bug, idea, or task into the project's tracking. Follow in
order; stop and report if a check fails.

1. **Understand what to capture.** Start from $ARGUMENTS if given, else ask.
   If the scope or the done-condition is unclear, ask one or two clarifying
   questions — don't file a vague ticket.
2. **Discover the tracker and its conventions.** Find where the project
   tracks work (issue tracker via `gh`/Jira/Linear, or backlog/board files)
   and read a few existing tickets: id scheme, title style, labels,
   priority signal, and structure (description / acceptance criteria).
3. **Check for duplicates.** Search open tickets for the same problem. If a
   likely match exists, show it and ask whether to file anyway, add to the
   existing ticket instead, or stop.
4. **Draft** the ticket to match the conventions — title, description,
   acceptance criteria, labels/priority — and show it to me. File only on
   my explicit go-ahead.
5. **File it:** create the tracker issue, or append to the backlog file in
   the project's format. Commit if repo files changed
   (`chore: add <TICKET-ID>`); do not push without go-ahead.
6. **Report** one line: ticket id/link and where it was filed.
