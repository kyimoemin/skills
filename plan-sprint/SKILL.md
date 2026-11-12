---
description: Close the active iteration (sprint/milestone/cycle) and open the next — verify its tickets are done, archive it, and create the next one from the backlog against the current plan. Use only when I ask to plan, roll or open the next sprint, or name /plan-sprint.
allowed-tools: Bash(git *), Bash(gh *)
---

# Plan / roll the iteration

Run to close the current iteration and open the next. Follow in order; stop and
report if a check fails. First discover how this project tracks iterations —
a sprint/cycle/milestone dir, dated files, an issue-tracker milestone, etc. —
and adapt these steps to it. If the project has no iteration concept, say so
and stop.

1. **Identify the active iteration.** The current/highest-numbered sprint,
   cycle, or open milestone. If the structure exists but no iteration has
   ever been opened (fresh bootstrap: a sprint dir with only a template),
   skip steps 2–3 and open the first iteration via steps 4–5.
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
   - Only pull items that are ready to start — unblocked, dependencies
     done, or depending only on tickets in this same proposal (an
     in-sprint chain constrains dispatch order, not membership).
   - Give each ticket an effort level for /sprint, from its full body:
     **high** when it touches something costly to get wrong — auth,
     payments, migrations or data deletion, sync, security rules, release
     config — or when its scope is large or unclear; **medium** otherwise,
     docs-only tickets included. /sprint often runs unattended, so when in
     doubt, high. A ticket already marked (by /add-ticket) keeps its level
     unless its body now says otherwise; say so when you change one.
   - Present the proposed list with a one-line why and the effort level per
     ticket (`ABC-12 — token refresh · effort high (auth)`), then wait for
     my explicit go-ahead. Do not create anything yet.
5. **Open the next iteration** as confirmed (adjusting for any changes I
   asked for), carrying forward the step 2 tickets. Store each ticket's
   effort level where /sprint reads it: an `[effort: <level>]` token on the
   ticket's line in a file-based list, or an `effort: <level>` label on a
   card or issue tracker (create the label if it doesn't exist). When a
   level changes, replace the old token or label — never leave both.
   Carried tickets keep their level unless I changed it.
6. **Commit** the roll to the current branch, if it changed repo files
   (`chore: close <iteration>, open <next>`). Do not push without go-ahead,
   but ask for it: /sprint's implementers branch from the remote base, so
   it won't dispatch until this commit is pushed.
7. **Report** one line: iteration closed, next opened, carried tickets — plus
   a one-line retro: planned vs finished for the closed iteration.
