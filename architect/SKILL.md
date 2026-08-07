---
description: Turn a feature idea into a design and ready-to-dispatch tickets — explore the codebase, settle the key decisions in a short design, split it into tickets with acceptance criteria and dependency links, then file them on go-ahead.
argument-hint: [feature idea | path to product brief]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Architect

Run to take a feature from idea to filed tickets. Follow in order; stop and
report if a check fails. If there's no repo here, or an empty one with no
conventions to discover, stop and point at /bootstrap — architect designs
into an existing foundation, it doesn't lay one. The output feeds the rest of the pipeline: tickets
must be implementable by a ticket-implementer without a human — every
product decision gets settled here, not discovered mid-sprint.

1. **Understand the ask.** If $ARGUMENTS is a path to an existing file,
   it's a product brief from /shape: read it and treat its decisions as
   settled — scope, done-condition, and acceptance come from the brief, not
   from re-asking. If the brief lists open product decisions, stop and
   resolve them with me before designing; never decide them silently.
   Otherwise start from $ARGUMENTS as a raw idea (or ask), and pin down
   scope and the done-condition with one or two clarifying questions if
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
   one line each), what is explicitly out of scope (inherit the brief's
   out-of-scope list when one exists — don't reinvent it), and open questions —
   which you resolve with me now, so none leak into tickets. Include a
   mermaid diagram when the design has structure prose carries poorly — a
   new data flow, state machine, or component interaction — and skip it for
   flat changes; a two-ticket feature doesn't need a box-and-arrow. Show it
   to me and iterate until I approve.
5. **Where the design lives.** Discover the project's convention (a docs/
   design dir, tracker epic description, ADRs); if there is none, write
   `docs/design/<feature>.md`, mirroring the brief's basename. The doc is
   a decision record for whoever inherits the repo: it keeps the diagram
   and the alternatives, not just the outcome, and it records the design
   as decided — later features supersede it with their own docs rather
   than editing history. Tickets still carry the design context each one
   needs (an implementer reads only its ticket) plus a link to the doc;
   the doc complements tickets, it doesn't replace their
   self-sufficiency. Diagrams live in the doc only — tickets stay prose.
6. **Split into tickets.** Each one PR-sized, independently implementable,
   with clear acceptance criteria and no hidden decisions. Record
   dependencies between them the way this project does (`blocked` label,
   "depends on #N" in the body, tracker link type) — that's the signal
   standup and sprint read to judge dispatch order. Show me the ticket list
   with a one-line why per ticket. File only on my explicit go-ahead.
7. **File them** following the tracker's conventions (id scheme, title
   style, labels — read existing tickets to match), into the backlog:
   pulling tickets into an iteration is /plan-sprint's job where the
   project tracks iterations — never yours. If repo files changed,
   commit (`chore: add <feature> tickets`) and push; if the current branch
   isn't the integration branch, ask first.
8. **Report:** design location, ticket ids with dependency order, and a
   ready-to-run `/sprint <ids>` line for the ones that are immediately
   dispatchable.
