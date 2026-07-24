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
   If the project has no tracking at all, say so and ask where to put this
   ticket before creating anything — don't invent a `TODO.md` on your own.
3. **Check for duplicates.** Search tickets for the same problem — open ones
   and recently closed/done ones, since it may already be fixed. If a likely
   match exists, show it and ask whether to file anyway, add to the existing
   ticket instead, or stop.
4. **Draft** the ticket to match the conventions — title, description,
   acceptance criteria, labels/priority — and show it to me. If it depends on
   or is blocked by existing tickets, record the link the way this project
   does (`blocked` label, "depends on #N" in the body, tracker link type) —
   that's the signal standup and start-ticket read to judge what's ready.
   File only on my explicit go-ahead.
5. **File it:** create the tracker issue, or append to the backlog file in
   the project's format. If repo files changed, commit them
   (`chore: add <TICKET-ID>`) and push — an unpushed backlog entry is
   invisible to everyone else. If the current branch isn't the integration
   branch, ask first: committing here drops the ticket into an unrelated PR.
6. **Report** one line: ticket id/link and where it was filed.
