---
description: Close the active iteration (sprint/milestone/cycle) and open the next — verify its tickets are done, archive it, and create the next one from the backlog against the current plan.
disable-model-invocation: true
allowed-tools: Bash(git *)
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
4. **Open the next iteration.** Create the successor. Pull its scope from the
   top of the backlog, aligned to the current plan/roadmap if there is one.
   Carry forward any tickets from step 2.
5. **Commit** the roll to the current branch, if it changed repo files
   (`chore: close <iteration>, open <next>`). Do not push without go-ahead.
6. **Report** one line: iteration closed, next opened, carried tickets.
