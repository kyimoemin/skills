---
description: Functional QA on merged work — pick the merged tickets in scope, dispatch a qa-verifier per ticket to exercise its acceptance criteria against the running app, then propose bug tickets for failures and file them on go-ahead.
argument-hint: "[TICKET-IDs space separated | recent]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# QA

You are a dispatcher. Do not run the app, do not read implementation files,
do not verify anything yourself — verification happens inside `qa-verifier`
subagents, one per ticket. Your context stays small: the scope list and the
one-line returns.

This is post-merge QA. Per-PR code review already happened in the sprint
flow; this pass proves the merged, integrated behavior. Tickets whose PR
isn't merged yet are out of scope — list them as skipped, don't verify
unmerged work.

## Scope

- **Ticket ids given** → those tickets. Confirm each has a merged PR
  (`gh pr list --search`); skip and report the ones that don't.
- **`recent` or no argument** → find merged-but-not-yet-QA'd work: merged
  PRs since the last release tag (or the last ~10 if the project doesn't
  tag), matched to tickets by id in branch or PR title, minus tickets that
  already have a result file — exactly `.sprint/qa-<ticket>.md` or a
  numeric-suffix rerun `qa-<ticket>-<N>.md`, never a looser prefix match
  (with bare numeric ids, a `qa-1*` glob would wrongly swallow ticket 1
  because ticket 12 was QA'd). Show me the list and confirm before
  dispatching.

Read each ticket's acceptance criteria from the tracker (discover it —
issue tracker or backlog/board files). A ticket with no findable criteria
is skipped with a note — a verifier can't judge against nothing.

## Dispatch

Before the first dispatch, make sure `.sprint/` is in `.git/info/exclude`
(NOT `.gitignore` — same rule as /sprint: results are local-only, and a
tracked-file change would dirty the tree, tripping the verifier's own
clean-tree check and the /deploy gate).

Work through the tickets ONE AT A TIME — verifiers run the app, and two at
once fight over ports and state. Per ticket, dispatch a `qa-verifier`
subagent, synchronously, with: ticket id, acceptance criteria verbatim,
repo path, merged PR number, and any how-to-run notes from the project's
docs if you already know them. Nothing else — it discovers the rest itself.

On return, record the one-line result and move on. `blocked` → note the
question, continue with the remaining tickets, and surface all blocked ones
together at the end. If the return says `→ inline`, write the entries
yourself to the next free results file — `.sprint/qa-<ticket>.md`, or
`qa-<ticket>-2.md` and so on if earlier runs exist — never overwriting a
previous run; the suffixed files are the QA audit trail.

## Failures → bug tickets

After the last verifier returns, for each ticket with failures: read its
results file and draft one bug ticket per distinct failure, following the
project's ticket conventions (id scheme, title style, labels — read
existing tickets to match). Reference the originating ticket and PR, and
put the verifier's expected-vs-observed evidence in the body — that's the
acceptance criterion for the fix. Check for duplicates first. Show me the
drafts; file only on my explicit go-ahead, then commit tracking-file
changes if any (`chore: file QA findings`) — asking first if the current
branch isn't the integration branch.

## Report

One line per ticket — id, `pass`/`fail`/`blocked`/`skipped`, and the
results path or reason. Then: bugs filed (ids), criteria needing human
eyes (from `unverifiable` entries), and every blocked verification with
its question — all blockers in one place. If everything passed, say so
and note the batch is clear for /deploy.
