---
description: One-time greenfield setup — turn an approved product vision (or brief) into a repo where every other skill's conventions exist to be discovered: stack and tracker settled with the user, minimal running scaffold with lint/test/CI green, README with how-to-run, iteration structure, brief committed. Runs once per project.
argument-hint: [path to vision doc | product brief]
disable-model-invocation: true
---

# Bootstrap

Run once, on a new project, to turn an approved product brief into a repo
the rest of the suite can work in. Every downstream skill discovers the
project's conventions at runtime — your job is to make that discovery
succeed: after you, /architect finds a codebase and a tracker,
/plan-sprint finds an iteration structure, ticket-implementers find lint
and test commands, qa-verifier finds how to run the app, and /deploy
finds a release mechanism (or a ticket saying there isn't one yet).

**Guard:** if the working directory is already a non-empty repo, stop and
say so — missing pieces in an existing project (tests, CI, tracker) are
tickets, not a re-bootstrap. This skill is greenfield-only.

1. **Read the product doc.** $ARGUMENTS is the path to a /vision doc
   (normal case for a new app) or a /shape brief; if missing or
   unreadable, stop and point at /vision — bootstrap builds foundations
   for a defined product, not for a guess. The vision's feature map is
   your stack input: what v1 must support (and what "later" implies)
   steers the choices in step 2. Unresolved open product decisions don't
   block you (they block /architect), but flag them.
2. **Settle the foundation decisions with me** — these are one-time and
   expensive to reverse, so they get the same dialogue treatment /shape
   gives product decisions. Propose a recommendation each, with a one-line
   why, and wait for my picks:
   - **Stack** — language, framework, package manager; steer by what the
     brief's product actually needs, not fashion.
   - **Tracker** — issue tracker (e.g. GitHub issues + milestones) or
     board files in the repo; this is what every skill will discover.
   - **Hosting/release target** — where v1 will run, even if the answer
     is "local only for now"; /deploy will discover whatever this sets up.
3. **Scaffold — deliberately minimal.** A skeleton that proves the
   pipeline, not a head start on the product: it compiles/runs, has lint
   and test commands wired with one passing test, and CI running both.
   Zero product features — every real behavior flows through tickets so
   it gets review and QA. This is also the one place test and CI
   infrastructure gets created; implementers are forbidden from
   bootstrapping it mid-ticket.
4. **README with how-to-run.** Install, run, test — exact commands. Write
   it as an instruction, not documentation: qa-verifier will follow it
   verbatim to launch the app, and a run step that needs tribal knowledge
   breaks /qa.
5. **Initialize the tracker and iteration structure** as decided in step 2
   (e.g. the board files plus a first iteration, or labels + a milestone).
   This is what /plan-sprint rolls; without it, it stops.
6. **Commit the product docs** — the vision doc and any briefs — into
   `docs/product/` (move them there if written elsewhere); the durable
   product contract lives in the repo.
7. **Local commits only, then ask.** `git init` and local commits are
   yours; creating a remote (`gh repo create`) and the first push are
   outward-facing — propose, and do them only on my explicit go-ahead.
8. **Verify the pipeline end**: lint passes, the one test passes, CI is
   green if a remote exists, the README's run command actually starts the
   app. Don't hand off a scaffold you haven't run.
9. **Report:** stack/tracker/hosting decisions, repo location, what the
   tracker looks like, any flagged open product decisions — and the
   ready-to-run next command: `/shape <first feature from the vision's
   build order>` (or `/architect <brief>` if a shaped brief already
   exists).
