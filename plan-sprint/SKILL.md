---
description: Close the active iteration (sprint/milestone/cycle) and open the next — verify its tickets are done, archive it, and create the next one from the backlog against the current plan.
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Plan / roll the iteration

Run to close the current iteration and open the next. Follow in order; stop and
report if a check fails. First discover how this project tracks iterations —
a sprint/cycle/milestone dir, dated files, an issue-tracker milestone, etc. —
and adapt these steps to it. If the project has no iteration concept, say so
and stop.

1. **Identify the active iteration.** The current/highest-numbered sprint,
   cycle, or open milestone.
2. **Verify closure.** Every ticket in it should be done (in the project's
   done list / closed in the tracker). List any still open — if there are
   unfinished tickets, ask whether to carry them forward or hold the roll
   before continuing.
3. **Archive.** Move or mark the finished iteration as closed however the
   project does it (e.g. into an `archive/` dir, or closing the milestone).
4. **Propose the next iteration's scope.** Draft the successor's ticket list
   from the backlog, aligned to the current plan/roadmap if there is one:
   - Size it to roughly what the just-closed iteration actually finished,
     plus any tickets carried forward from step 2.
   - Only pull items that are ready to start — unblocked, dependencies done.
   - Present the proposed list with a one-line why per ticket, then wait for
     my explicit go-ahead. Do not create anything yet.
5. **Open the next iteration** as confirmed (adjusting for any changes I
   asked for), carrying forward the step 2 tickets.
6. **Commit** the roll to the current branch, if it changed repo files
   (`chore: close <iteration>, open <next>`). Do not push without go-ahead.
7. **Report** one line: iteration closed, next opened, carried tickets — plus
   a one-line retro: planned vs finished for the closed iteration.
