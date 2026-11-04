# QA phase

The dispatch logic shared by `/qa` and `/sprint`'s QA phase. The caller
hands you a list of merged tickets; this file says which ones to check, how
to dispatch the verifiers, how to record what they return, and where
failures go. You stay a dispatcher throughout: you never run the app or
judge a criterion yourself.

## The repo's QA lines

Grep the root `CLAUDE.md` and `AGENTS.md` for these. Each is one line:

- `sprint: qa after merge` turns on `/sprint`'s QA phase. `/qa` ignores it.
- `qa: runbook <path>` is the repo's QA runbook: how to build, launch and
  sign in, and what the target can't check. Pass it to every verifier. With
  no runbook, verifiers work out how to run the app themselves.
- `qa: regression <path>` is the repo's committed regression suite. With
  one, every QA batch ends with one regression run (see below).
- `qa: max <n> parallel` lets up to `n` verifiers run at once, one per
  lane. Default 1; above 2 counts as 2. A lane is one simulator or
  emulator id, one account env-var prefix (`QA_TEST_`, `QA_TEST_2_`), one
  Metro or dev-server port and one scratch folder (outside `.sprint/`,
  which is archived). The runbook declares them under a `Lanes` heading,
  one row per lane: grep for it and read only that section, not the whole
  runbook. The lane count is the smaller of `n` and the lanes declared. At 1 or less there are no lanes, and
  everything below runs exactly as written for one verifier at a time.

## Before the first dispatch

- **Main checkout:** verifiers test the main checkout on the base branch.
  It must be clean and on the base branch; pull it with `--ff-only`. If
  it's dirty or on another branch, don't switch it or stash anything.
  Stop the batch and report it.
  With lanes, every verifier tests the same commit: pull once, before the
  first dispatch, then leave the checkout alone until the batch, regression
  included, is done.
- **Migrations:** a merged ticket whose migration isn't applied is checked
  against the wrong schema. `/sprint` applies migrations in its merge
  phase. Standalone, the runbook says how to check for unapplied ones, and
  the verifier blocks on them.

## Which tickets get a check

Check a merged ticket only when it has all of these:

- **A merged PR.** Owner-only tickets have no PR: `skipped: no PR`.
- **Findable acceptance criteria.** On a file-based board, grep the ticket
  file to confirm a criteria section exists, then pass the path. Don't
  read the body. Only when the verifier can't read the tracker (its tools
  are file and shell only) do you paste the criteria verbatim. No
  criteria: `skipped: no criteria`.
- **A change to something that runs.** Use `gh pr view <n> --json files`.
  If every path is a doc (`*.md`, or under `docs/`), it's
  `skipped: docs only`. The regression run still covers the batch.

Write each skip to the ticket's next free results file as a one-line
`skipped: <reason>` entry. That's how /deploy's gate and `recent` see the
ticket was handled.

## Dispatch

Without lanes, run verifiers one at a time, synchronously, in the
foreground. They drive the same simulator, ports and test account, so two
at once fight. Send each `qa-verifier` only these:

- **ticket mode:** `ticket:` id, `criteria:` ticket file path (or verbatim
  text), `repo:` path, `pr:` merged PR number, `runbook:` path if there is one.
- **regression mode**, once, after the last ticket: `regression:` suite
  path, `repo:` path, `runbook:` path, `covers:` the batch's ticket ids.

Each verifier cleans up whatever it started: Metro, a simulator it booted,
any background process. So the next one starts from a clean machine.

**With lanes**, run one verifier per lane at a time, each in the
background; it's still one verifier per ticket. Each ticket dispatch adds
`lane: <k>, device <id>, account <prefix>, port <port>, scratch <folder>`.
A lane is busy from its dispatch until its verifier returns. Give the next
ticket to the first free lane, and record each return as it arrives. Each
verifier keeps to its lane and cleans up only what it started, so the next
one on that lane starts clean. Native builds still run one at a time: the
repo's build script or lock serializes them, and a verifier waits out
another lane's build instead of starting a second. The regression run
stays alone: dispatch it only once every lane is idle, with lane 1's
`lane:` line, so it doesn't pick a device on its own.

**Checks that must run alone.** A lane's verifier returns `solo: <reason>`
when a criterion needs the machine to itself: it resets or onboards an
account another lane may be using, or edits data every account shares.
It returns before starting anything and writes no results file. Record it
as `<ticket> qa solo-wait: <reason>`, not as blocked or failed. Then stop
handing out tickets. Let the busy lanes finish their current tickets and
record their returns; another `solo:` joins the wait. Once every lane is
idle, rerun each waiting ticket alone, one at a time, with lane 1's
`lane:` line plus `alone: other lanes idle`, so the verifier runs every
criterion and doesn't return `solo:` again. Its results go to the next
free results file as usual. Then resume lane dispatch; the regression
run still comes last. Without lanes no verifier returns `solo:`.

## Recording returns

The verifier returns one line: `pass`, `pass with <n> unverifiable → <path>`,
`<n> of <m> … failed → <path>`, or `blocked: <question>`. With lanes it
may also be `solo: <reason>` (see Dispatch).

- **`blocked`:** write the question to the next free results file as a
  `blocked: <question>` entry, so it outlives the session. That's
  `.sprint/qa-<ticket>.md` (`qa-regression.md` for the suite), or the next
  `-<N>` suffix if earlier runs exist. A blocked file is a non-pass.
  /deploy's gate fails closed on it, and `recent` keeps the ticket in scope.
- **`solo`:** nothing ran, so write no results file; the alone rerun
  writes it. Until then the ticket has none, so `recent` keeps it in
  scope.
- **`→ inline`:** the verifier couldn't write its file. Write its entries
  yourself to the next free results file, word for word.
- **Never overwrite** an earlier results file. The suffixed files are the
  audit trail.

## The regression baseline

`.sprint/qa-baseline` holds the base-branch commit of the last regression
run that finished, pass or fail. Read it from the archive first
(`git show refs/sprint/archive:.sprint/qa-baseline`), then the local file.
A ticket merged at or before that commit is covered by the regression
run, so `recent` leaves it out. Right before dispatching a regression run,
capture `git rev-parse HEAD` in the main checkout: that's the commit the
suite tests. After a run that didn't block, write that commit to the file,
never a later `origin/<base>`, which could cover work merged mid-run.

## Failures become bug tickets

For each failed results file, `grep -n FAIL` it. Read only those lines,
not the whole file. Draft one bug per distinct failure:

- **Ticket check:** "from <ticket>". The criterion's expected-vs-observed
  line is the fix's acceptance criterion. Reference the results file and
  the original PR.
- **Regression run:** one bug per failing flow. It's "from" every ticket
  in `covers:`, since no single merge owns it. Reference the flow file and
  the results file.

How they get filed depends on the caller:

- **`/qa`:** show me the drafts and file only on my go-ahead (see its
  SKILL.md).
- **`/sprint auto`:** they become `file: ready bug: …` lines on the phase's
  close-tracking dispatch. The loop guard applies: a failure on a ticket
  this run filed (a `FILED:` line names it) is `file: proposed bug: …`.
- **`/sprint` without auto:** list them in the final summary. Don't file.

## After the batch

Snapshot `.sprint/` to `refs/sprint/archive` and push, exactly as
`/sprint`'s sync section does. QA results feed /deploy's gate, possibly
from another machine. `/sprint` already syncs after its merge phase, which
covers this.
