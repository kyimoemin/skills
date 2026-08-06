---
description: Turn a feature idea into a design and ready-to-dispatch tickets — explore the codebase, settle the key decisions in a short design, split it into tickets with acceptance criteria and dependency links, then file them on go-ahead.
argument-hint: [feature idea]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Architect

Run to take a feature from idea to filed tickets. Follow in order; stop and
report if a check fails. The output feeds the rest of the pipeline: tickets
must be implementable by a ticket-implementer without a human — every
product decision gets settled here, not discovered mid-sprint.

1. **Understand the ask.** Start from $ARGUMENTS if given, else ask. Pin
   down scope and the done-condition with one or two clarifying questions if
   unclear — don't design against a guess.
2. **Check it isn't already tracked.** Search the project's tracker (discover
   it — issue tracker or backlog/board files) for existing tickets or an
   epic covering this. If found, show what exists and ask whether to extend
   it, replace it, or stop.
3. **Explore the codebase.** Map what the feature touches — entry points,
   affected modules, existing patterns to follow, constraints. Use Explore
   subagents for breadth; keep only conclusions, not file dumps. Note where
   the feature fights the current architecture — that's design input, not a
   footnote.
4. **Draft the design.** Short and decision-dense, not a spec: what changes
   and where, each key decision with the chosen option and why (alternatives
   one line each), what is explicitly out of scope, and open questions —
   which you resolve with me now, so none leak into tickets. Show it to me
   and iterate until I approve.
5. **Where the design lives.** Discover the project's convention (a docs/
   design dir, tracker epic description, ADRs). If there is none, put the
   relevant design context into each ticket's body instead — don't invent a
   docs structure on your own.
6. **Split into tickets.** Each one PR-sized, independently implementable,
   with clear acceptance criteria and no hidden decisions. Record
   dependencies between them the way this project does (`blocked` label,
   "depends on #N" in the body, tracker link type) — that's the signal
   standup and sprint read to judge dispatch order. Show me the ticket list
   with a one-line why per ticket. File only on my explicit go-ahead.
7. **File them** following the tracker's conventions (id scheme, title
   style, labels — read existing tickets to match). If repo files changed,
   commit (`chore: add <feature> tickets`) and push; if the current branch
   isn't the integration branch, ask first.
8. **Report:** design location, ticket ids with dependency order, and a
   ready-to-run `/sprint <ids>` line for the ones that are immediately
   dispatchable.
