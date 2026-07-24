---
description: Close a finished ticket — verify its PR against the base branch, merge on explicit go-ahead, then update wherever the project tracks ticket status.
argument-hint: [TICKET-ID]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Close ticket

Run when a ticket's PR has been reviewed and is ready to land. Follow in
order; stop and report if any check fails.

1. **Identify the ticket.** Use $1 if given, else infer the ticket id from the
   current branch name (e.g. a `ABC-123` style prefix, or whatever convention
   this repo uses). Confirm the ticket id and its PR before proceeding.
2. **Verify the PR.** `gh pr view` — confirm its base branch (the repo's
   integration branch, e.g. `main`/`develop`/`master`; take it from the PR
   itself, don't assume), that CI is green, and that it's approved /
   review-complete. Report the state; do NOT merge.
3. **Get go-ahead.** Merging requires my explicit confirmation. Ask, then
   wait. Never merge without it.
4. **Merge** into the base branch once confirmed (`gh pr merge`), then delete
   the ticket branch.
5. **Close the ticket in tracking.** Update wherever this project records
   ticket status, if anywhere. Discover it rather than assuming a fixed path:
   - If an issue tracker is in use (GitHub Issues via `gh`, Jira, Linear,
     etc.), transition/close the ticket there.
   - If status lives in repo files (a backlog/board/sprint or `TODO`/`CHANGELOG`
     markdown), find those files, move the ticket to done/newest-first, and
     preserve its ticket id and PR number.
   - If you can't find any tracking, say so and skip this step.
6. **Commit the tracking update** if step 5 changed repo files
   (`chore: close <TICKET-ID>`), and push. Skip if nothing changed.
7. **Report** one line: ticket, PR merged, what was updated.
