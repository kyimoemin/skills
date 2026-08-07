---
description: One-time greenfield setup — turn an approved product vision (or brief) into a repo where every other skill's conventions exist to be discovered: stack and tracker settled with the user, minimal running scaffold with lint/test/CI green, README with how-to-run, tracker initialized, product docs committed. Runs once per project.
argument-hint: [path to vision doc | product brief]
disable-model-invocation: true
---

# Bootstrap

Run once, on a new project, to turn an approved product brief into a repo
the rest of the suite can work in. Every downstream skill discovers the
project's conventions at runtime — your job is to make that discovery
succeed: after you, /architect finds a codebase and a tracker,
ticket-implementers find lint and test commands, qa-verifier finds how
to run the app, /deploy finds a release mechanism (or a ticket saying
there isn't one yet) — and /plan-sprint finds an iteration structure,
if this project opted into one.

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
   - **Stack** — language, framework, package manager. Ask first whether
     I already have a stack I prefer or know well — on a project I'll be
     reading every PR of, familiarity beats marginal fit. Then present
     the consequential picks as separate decisions with real named
     alternatives (e.g. React vs Svelte vs no framework), one-line why
     each, steered by what the product needs, not fashion. Never bundle
     the whole stack inside a single "recommended" option — that's
     choosing for me while appearing to ask.
   - **Tracker** — issue tracker (e.g. GitHub issues + milestones) or
     board files in the repo; this is what every skill will discover.
   - **Hosting/release target** — where v1 will run, even if the answer
     is "local only for now"; /deploy will discover whatever this sets up.
3. **Scaffold — deliberately minimal.** Start from the ecosystem's
   official scaffolder when one exists (`pnpm create vite`, `cargo new`,
   `create-next-app`, …) and trim from there — hand-rolling the configs a
   scaffolder generates invites drift and version-mismatch bugs the
   ecosystem has already solved. What it must prove: the pipeline, not a
   head start on the product — it compiles/runs, has lint and test
   commands wired with one passing test, and CI running both.
   Zero product features — every real behavior flows through tickets so
   it gets review and QA. This is also the one place test and CI
   infrastructure gets created; implementers are forbidden from
   bootstrapping it mid-ticket.
4. **README with how-to-run.** Install, run, test — exact commands. Write
   it as an instruction, not documentation: qa-verifier will follow it
   verbatim to launch the app, and a run step that needs tribal knowledge
   breaks /qa.
5. **Initialize the tracker** as decided in step 2. For board files, the
   default shape is iteration-less and keeps each ticket's definition in
   exactly one immutable place: `board/tickets/T-<n>.md` holds the full
   ticket (body, acceptance criteria, and a status line — the status
   line is the only part that ever changes); `board/backlog.md` is an
   ordered list of references; `board/done.md` lists shipped refs with
   PR numbers. Scheduling and shipping move references, never bodies —
   /qa reads a ticket's acceptance criteria *after* its PR merges, so
   criteria must stay findable forever. Set up iterations (sprint files
   for /plan-sprint to roll) only if I asked for them in step 2 — and
   never pre-open one aimed at specific work; filling iterations is
   /plan-sprint's call, not yours.
6. **Commit the product docs** — the vision doc at `docs/product/` and
   any briefs under `docs/product/briefs/` (move them there if written
   elsewhere); the durable product contract lives in the repo.
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
