---
description: Functional QA on merged work — pick the merged tickets in scope, dispatch a qa-verifier per ticket to exercise its acceptance criteria against the running app (plus the repo's regression suite, if it has one), then propose bug tickets for failures and file them on go-ahead.
argument-hint: "[TICKET-IDs space separated | recent | regression]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *), Bash(claude agents --json), Bash(echo $PPID)
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

The dispatch rules — which tickets get a check, the verifier prompt, the
regression run, recording returns, the baseline, drafting bugs — are in
`~/.claude/skills/qa/reference/phase.md`. Read it before dispatching.
`/sprint` runs the same phase after its merges when a repo opts in with
`sprint: qa after merge`.

## Not during a sprint run

Verifiers need the main checkout clean and on the base branch, and they
drive the QA simulator and test account (one per lane, if the repo
declares lanes; see phase.md). A running sprint needs both.
Before scoping, look at the newest run log in `.sprint/` (a `.md` whose
first entry is an `ORDER:` line, under an optional `#` heading). If its
last line is neither `RUN COMPLETE` nor `RUN STOPPED …`, a run may be
active. /sprint also leaves a log like that after merging a subset, and a
crashed session does too, so name the log and wait for my word. If that
run's repo opted in, its own QA phase covers it.
Also run `claude agents --json` and `echo $PPID` (this session's pid). If
another `busy` session (pid ≠ `$PPID`) has a cwd inside this repo, name it
and wait for my word. If the command fails, say so in one line and carry on.

## Scope

- **Ticket ids given** → those tickets. Confirm each has a merged PR
  (`gh pr list --search`); skip and report the ones that don't.
- **`regression`** → only the regression run, if the repo has a
  `qa: regression` suite (see phase.md); otherwise say there is none.
- **`recent` or no argument** → every ticket merged into the base branch
  that has no QA result yet. There's no count cap and no tag cutoff. List
  the merged PRs (`gh pr list --state merged --base <base> --limit 500
  --json number,title,headRefName,mergeCommit`) and match them to tickets
  by the id in the branch or PR title. Then drop:
  - tickets merged at or before the regression baseline (phase.md); the
    regression run covers them;
  - tickets whose highest-suffix result file records a completed run.
    Result files are exactly `.sprint/qa-<ticket>.md` or a numeric-suffix
    rerun `qa-<ticket>-<N>.md`, never a looser prefix match: with bare
    numeric ids, a `qa-1*` glob would wrongly swallow ticket 1 because
    ticket 12 was QA'd.

  A file whose latest entry is `blocked:` is an open question, not a
  result. Its ticket stays in scope, even before the baseline, and is
  listed with that question. With a suite, the batch ends with a
  regression run. Show me the list (after phase.md's skips) and confirm
  before dispatching.

Result files may live on another machine: if `.sprint/` is missing (or has
no results where the run log says a sprint happened), restore it from the
archive ref before concluding nothing ran —
`git fetch origin refs/sprint/archive:refs/sprint/archive` then
`git archive refs/sprint/archive | tar -xk` (`-k` skips existing local
files on macOS's tar; on GNU tar use `--skip-old-files`). No such ref on
the remote → genuinely no results.

## Before dispatching

Make sure `.sprint/` is in `.git/info/exclude`
(NOT `.gitignore` — same rule as /sprint: results are local-only, and a
tracked-file change would dirty the tree, tripping the verifier's own
clean-tree check and the /deploy gate).

Check the write permission too: every verifier writes its results under
`.sprint/`, so if `Edit(//**/.sprint/**)` is not in `permissions.allow` in
`~/.claude/settings.json` or `~/.claude/settings.local.json`, each dispatch
stalls on a prompt. Say so in one
line and let me decide whether to add it — don't add it yourself.

Set `effort: high` on every qa-verifier dispatch, ticket checks and the
regression run alike. The agent file sets no effort of its own; /sprint
sets its own levels per ticket, and a standalone /qa run checks
everything at high.

Then dispatch, record, and sync as phase.md says. Continue past a blocked
verifier and surface every blocked one together at the end.

## Failures → bug tickets

Draft the bugs as phase.md says, following the project's ticket
conventions (id scheme, title style, labels — read existing tickets to
match). Check for duplicates first. Show me the drafts; file only on my
explicit go-ahead, then commit tracking-file changes if any
(`chore: file QA findings`) — asking first if the current branch isn't the
integration branch.

## Report

One line per ticket — id, `pass` / `pass with unverifiable` / `fail` /
`blocked` / `skipped`, and the results path or reason — plus the regression
run's line. Then: bugs filed (ids), criteria needing human eyes (from
`unverifiable` entries), and every blocked verification with its question —
all blockers in one place. If everything passed, say so and note the batch
is clear for /deploy.
