---
description: Mine an iteration's audit trail — sprint run logs, review findings, QA results, tracker history — into a short retro: planned vs finished, review effort and recurring finding patterns, QA escapes, blocked-ticket causes, and one to three concrete process changes.
argument-hint: "[sprint-id]"
allowed-tools: Bash(git *), Bash(gh *)
---

# Retro

Read-only until the final step. This is the consumer of the audit trail the
other skills leave behind: run logs and findings files exist FOR this — read
them here, not during the sprint.

1. **Identify the iteration.** $1 as the sprint id if given, else the
   highest-numbered `.sprint/<sprint-id>*.md` run log — sprint run logs
   only; `.sprint/autopilot-*.md` relay logs are not run logs, never
   pick one. No `.sprint/` dir or
   no run logs → say so and stop; there is nothing to retro. Note that
   `.sprint/` is local-only — a retro only works on the machine the sprint
   ran on.
2. **Gather, per source:**
   - **Run log(s)** for the iteration, including `-2`/`-3` continuations:
     the `ORDER:` line (planned), return lines (finished, review rounds,
     PRs), `parked` lines and their reasons, `DECISION:` and `ANSWER:`
     lines, `RUN STOPPED` markers.
   - **Findings files** `.sprint/findings-<ticket>-r<N>.md` for the
     iteration's tickets: what the reviewer caught, per ticket and round.
   - **QA results** if /qa ran — exactly `.sprint/qa-<ticket>.md` and
     numeric-suffix reruns `qa-<ticket>-<N>.md`, never a looser prefix
     match (same rule as /qa: with bare numeric ids a `qa-1*` glob swallows
     ticket 12's results into ticket 1). Failures here are review escapes —
     bugs that survived a clean review.
   - **Tracker state** for the iteration's tickets: which actually reached
     done.
   - **Autopilot relay log** (`.sprint/autopilot-<feature>.md`), if the
     iteration ran under /autopilot: the stage timeline and gate answers —
     context for where the cycle stalled, not a run log.
3. **Analyze** — numbers first, then causes:
   - Planned vs finished, and where the gap went (parked on questions,
     failed reviews, never dispatched).
   - Review effort: rounds per ticket; for any ticket that needed 2+
     rounds, what kind of findings — bugs, security, or acceptance-criteria
     violations? Criteria violations at review time mean the ticket was
     underspecified; that's a ticket-writing lesson, not an implementation
     one.
   - Recurring finding patterns across tickets (same category, same
     subsystem, same mistake twice).
   - Blocked/parked causes: what did implementers have to ask that the
     tickets should have answered? These are /architect and /add-ticket
     lessons.
   - QA escapes: anything QA failed that review passed, and what check
     would have caught it earlier.
4. **Report** — short: the numbers, the top patterns with the tickets that
   show them, and **one to three concrete process changes**, each tied to
   the evidence (e.g. "auth tickets keep blocking on token-expiry
   questions — architect designs must settle session policy"). No generic
   advice; if the iteration was clean, say so and recommend nothing.
5. **Offer to capture.** For process changes worth keeping, offer to: file
   them as backlog tickets (via the project's conventions, on go-ahead),
   and/or append a retro section to wherever the project archives the
   iteration if such a place exists. Write nothing without my go-ahead;
   if there's nowhere for it, the report is the deliverable.
