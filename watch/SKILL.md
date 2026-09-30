---
description: Maintain a visual progress file for the current /sprint run with a mermaid diagram, a waiting-on-you list, and a ticket table, all derived read-only from the run's own logs. One-shot by default; --watch keeps it live while the run works.
argument-hint: "[project-path] [--watch]"
allowed-tools: Bash(bun run *)
---

# Watch

Arguments: $ARGUMENTS

You are a thin wrapper around a deterministic script — the script does all
the work, and that is the point: the progress file is never model-written,
so it cannot drift from the logs it is derived from. Do not compose,
edit, or "fix" the generated file yourself, and do not summarize run
state from your own reading of the logs — run the script and relay.

## Run

```
bun run ~/.claude/skills/watch/scripts/render-md.ts <project-path> [--watch]
```

- Project path: from my arguments, else the current project root (the
  directory whose `.sprint/` the run lives in). Pass it explicitly.
- **One-shot (default):** run it once, then report one line — the path it
  wrote and a reminder that VS Code's markdown preview (Cmd-Shift-V) live-
  refreshes it; a preview left open on `.sprint/progress-current.md`
  always shows the current run, whichever sprint that is.
- **`--watch`:** start it as a background task and confirm what it's
  watching. It regenerates on every `.sprint/` change and exits on its
  own when the run completes, or after 24h with no `.sprint/` activity.
  If the run is already complete it renders once, prints "run complete —
  not watching" and exits; relay that. To stop it early: `kill $(cat
  <project-path>/.sprint/.progress-watch.pid)` (`kill %1` does nothing
  here). Don't poll it — it needs no supervision.
- Script prints "No sprint run log" (or no `.sprint/`) → relay that
  message as-is; nothing to fix. /sprint creates its log at startup, so
  this just means it hasn't run here yet.

**Project folder.** If the path is a folder of several repos (not itself a
repo, with a `## Repos` table in its `CLAUDE.md`), the script covers every
mapped repo. It refreshes each repo's own progress files and writes one
combined page, `<project folder>/sprint-progress.md`: everything waiting on
me across the repos, a row per repo, and the ticket table of each run still
open. `--watch` then watches every repo's `.sprint/` and exits when every
repo's run is complete. Its pidfile is `<project folder>/.progress-watch.pid`.
Report the combined page's path.

## What the script derives (for your report, not for you to re-derive)

Which run it renders: the newest sprint run log, if it is unfinished (an
older unfinished log never outranks a newer one) → else the newest
finished run. A sprint run log is identified by content — a `.md` in
`.sprint/` whose first entry is the `ORDER:` line /sprint writes, under an
optional `# ...` heading naming the run (which becomes the progress file's
title) — so stray notes are never mistaken for one.

For the chosen run it reads its sprint logs, `review-<ticket>-r<N>.md`
files as the live mid-ticket signal, and `qa-<ticket>[-<N>].md`
verdicts. It writes `.sprint/progress-<sprint-id>.md` (re-runs
`<id>-2.md`, `-3.md` share the one file) plus an identical copy at the
fixed path `.sprint/progress-current.md`, and touches nothing else: no network, no dependencies (it reads the `origin` remote locally
to link PR numbers to GitHub). It draws the run's
planned → working → ready → merged funnel plus its waves, and shows the
`NOTE:` written just before `RUN STOPPED` as why it stopped. The
ticket table links each PR, the newest review round file and the QA file,
and only the newest five decisions stay unfolded. Tests live
next to the script (`bun test` in the scripts dir).
