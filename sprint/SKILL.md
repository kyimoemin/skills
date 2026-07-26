---
description: Work through sprint tickets autonomously via ticket-implementer subagents — dispatch, independent review, fix loop, stop before merge. Merge only the tickets I explicitly approve at the end.
argument-hint: "[TICKET-IDs space separated | all]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Sprint

Tickets: $ARGUMENTS

You are a dispatcher. Do not read implementation files. Do not read diffs.
Do not implement anything yourself. Your context must stay small — hold the
ticket you are on and nothing more; the run log below is where run state
lives, so re-read it rather than carrying it.

## Run log

This run's state lives in `.sprint/<sprint-id>.md` in the repo, where
`<sprint-id>` is the sprint or milestone name (fall back to today's date).
It is local-only: add `.sprint/` to `.git/info/exclude` if it isn't there —
NOT to `.gitignore`, which is a tracked file and would either dirty the tree
(blocking every implementer) or drop an unrelated change into someone's PR.

Before anything else, look for this sprint's run logs and take the
highest-numbered one:

- **Exists, not ending in `RUN COMPLETE`** → first check it is even this
  run's log: if its `ORDER:` line shares no ticket with what I asked for, it
  belongs to a different run — leave it untouched and start a new log at the
  next free suffix. Otherwise do not start. Replay it, and for the
  interrupted ticket establish the real state yourself with `git` and `gh` —
  does the branch exist, how old is its last commit, is there a PR and in
  what state. You have both tools; no subagent needs to run to find this
  out. Report that alongside what the log says, then ask me, per interrupted
  ticket, whether to continue on the existing branch or start it fresh.
  Dispatch only after I answer, and carry the answer in the dispatch prompt
  as `resume: continue on <branch>` or `resume: start fresh, <branch> is
  abandoned`. Without that line the implementer will block on the work it
  finds — correct behaviour on a normal dispatch, and an infinite loop on a
  resume. Skip the tickets the log records as finalized or merged, and never
  reconstruct half-finished work yourself.
- **Exists, ends in `RUN COMPLETE`** → that run is closed. Start a new log
  at the next free `<sprint-id>-2.md`, `-3.md` and so on. Never append past
  a `RUN COMPLETE`; a log with a terminator in the middle can't be replayed.
- **No file** → create it, and write the `ORDER:` line as its first entry.

**Append, never rewrite.** Each entry is one line added at the end. A
rewrite that dies mid-write can truncate the whole log; an append can only
lose its own last line. A ticket's current state is whatever its last line
says.

Append a line when: the order is planned, a ticket is dispatched, an
implementer returns, a review round finishes (with finding count), a ticket
is finalized, a ticket is merged, the run stops. Plus every decisions-log
entry (below). One line each — ticket id first, then what happened. No
prose, no pasted reports.

Use this format, so any later run can replay a log it didn't write:

```
ORDER: ABC-12, ABC-15, ABC-9
ABC-12 dispatched
ABC-12 returned complete, PR #204
ABC-12 review round 1: 2 findings
ABC-12 review round 2: clean
ABC-12 finalized
DECISION: auth errors now surface as 401 not 500 (ABC-12)
ABC-15 dispatched
ABC-15 returned blocked: acceptance criteria don't cover expired tokens
RUN STOPPED at ABC-15
```

Replayed, that says ABC-12 is finalized and awaiting merge, ABC-15 needs an
answer from me before anything else happens, and ABC-9 was never started.
`RUN STOPPED` / `RUN COMPLETE` are the last line of a log that ended
deliberately; a log whose last line is neither was interrupted.

The log records what happened in this RUN. It does not mirror the board:
ticket status lives on the card and is owned by the implementer. When you
need a card's column, read it from the tracker — never cache it in the log,
or the two will drift, which is the exact failure this split exists to
prevent.

Keep the log when the run finishes; it is the only record of planned-vs-
finished and review effort, which the iteration retro needs.

If no tickets were given: list the ready-to-start tickets from wherever this
project tracks work (unblocked, dependencies done, in priority order) and
stop for my confirmation. For unattended runs, ticket ids must be passed
explicitly — `all` does not count; a stale board could trigger a lot of
unwanted work.

If the argument is `all`: fetch the not-yet-started tickets in the current
sprint (active sprint / the board list this project treats as the sprint —
skip anything already in progress, in review, or done) and plan the
execution order yourself — in-batch blockers first, then priority, then
board order. Tickets blocked from outside the batch are excluded — list
them as skipped with the reason. If nothing is ready, report that and stop.
Otherwise report the planned order in one short list, then proceed
immediately without waiting for confirmation (I can interrupt if the order
looks wrong).

Work through the tickets ONE AT A TIME, in the order given (or planned).
Per ticket:

1. **Read the ticket** from the tracker: title, description, acceptance
   criteria. Read what you need and comment where the steps below say to,
   but never move a card — every card move belongs to its implementer. The
   one exception is the merge-phase fallback below, when the implementer
   that owned the card no longer exists to do it.
2. **Dispatch a `ticket-implementer` subagent** with: ticket id, full
   description and acceptance criteria, repo path, and all current decisions
   entries read from the run log. Include the flag `no-pr-review` in the prompt —
   it tells the implementer to skip self-reviewing its PR, since you run
   the independent review yourself (step 4).
3. **On return:** if status is `blocked` or `failed` → append the reason and
   `RUN STOPPED at <ticket>` to the run log, then STOP the entire run and
   report to me. Do not attempt the ticket yourself, do not continue to the
   next ticket. The implementer has already commented the question on its
   card and left the card where it stood — don't move it.
4. **Independent review:** spawn a fresh reviewer subagent on the PR (by PR
   number/branch — it fetches the diff itself), including the ticket's
   acceptance criteria in its prompt. Instruct it to review for
   real bugs, security issues, and violations of the acceptance criteria,
   and to return only confirmed, actionable findings with file:line — no
   style nits, no diff dumps.
5. **Fix loop:** if there are findings, send them to the SAME implementer
   (SendMessage — its context is still alive), wait for its report, then
   re-review. Max 3 rounds; if findings remain after that, treat the ticket
   as `failed` → step 3 — but first comment the unresolved findings on the
   card yourself: this failure is your call, not the implementer's (its last
   report was `complete`), so without your comment the card carries no
   record of why the ticket stopped.
6. **Finalize:** message the implementer to verify the PR (CI green, head
   commit unchanged since the final review round) and move its card to
   ready-to-merge. The card must NOT go to done here — nothing is merged
   yet. If the board has no ready-to-merge state, the card correctly stays
   in progress; that is not a failure.
7. **Record:** the implementer has already logged its branch, PR and fix
   rounds on the card as it worked — don't repeat them. Comment only what
   it couldn't know: the review verdict and round count. If the report
   listed a cross-cutting decision, append it to the decisions log too.
8. **Report to me** in one line — ticket, PR, review rounds, card column —
   and move on.

Note that an implementer reporting status `complete` means it finished the
message you sent it, not that the ticket is finished. A ticket only reaches
done after you merge its PR and the implementer confirms the close-tracking
move.

**Nothing lives only in this conversation.** A sprint can be interrupted at
any point; what survives is the tracker and the run log. Before the final
summary, confirm no card is left in a state that contradicts its PR.

When all tickets are done (or the run stopped): report a summary — one line
per ticket with PR url, PR state, and the card's current column — and which
PRs now await merge approval. Flag any card sitting in done whose PR you
haven't merged; that's a tracking error to fix, not a finished ticket.
Then STOP and wait for my merge instruction. Never merge without it.

**Merge phase** — when I say "merge all" or name specific tickets, for each
approved ticket in order:

1. **Re-verify the PR:** `gh pr view` — CI green, mergeable, and the head
   commit unchanged since the final review round. If any check fails, skip
   this ticket, report why, and continue with the rest.
2. **Merge** with `gh pr merge` (repo's default strategy) and delete the
   ticket branch.
3. **Close tracking via the implementer:** SendMessage the ticket's
   implementer — "PR merged, close the ticket in tracking" — so the card
   move stays with it. If its context is gone, do the tracking update
   yourself as a fallback. On a resumed run this is the normal case, not an
   edge one: implementers from the interrupted session no longer exist, so
   expect to close their tickets yourself.
4. **Report** one line: ticket, PR merged, tracking closed — and append the
   merge to the run log.

Append `RUN COMPLETE` only when no ticket in this run is still awaiting a
merge decision. If you merged a subset and the rest are open, the run is not
finished — leave the log unterminated so a later run picks those tickets up
instead of starting fresh on top of them.

Tickets I didn't name stay open — list them at the end as still awaiting my
decision. (For tickets closed outside a sprint run, `/close-ticket` still
exists.)

**Decisions log** — cross-cutting decisions a later ticket needs to know
about. These are entries in the run log like any other, prefixed `DECISION:`
so you can pick them out when assembling a dispatch (step 2) — not a
separate section, which would mean writing into the middle of an append-only
file. It starts empty; a run that produces none is normal, so don't invent
entries to fill it.
