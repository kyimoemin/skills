---
description: Maintain a visual progress file for the current run — an autopilot feature loop or a standalone /sprint run — with a mermaid diagram, a waiting-on-you list, and a ticket table, all derived read-only from the run's own logs. One-shot by default; --watch keeps it live while the run works.
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
  refreshes it.
- **`--watch`:** start it as a background task and confirm what it's
  watching. It regenerates on every `.sprint/` change until stopped; tell
  me it keeps running and how to stop it. Don't poll it — it needs no
  supervision.
- Script prints "No autopilot or sprint run log" (or no `.sprint/`) →
  relay that message as-is; nothing to fix. Both /autopilot and /sprint
  create their log at startup, so this just means neither has run here
  yet.

## What the script derives (for your report, not for you to re-derive)

Which run it renders, in precedence order: an unfinished
`.sprint/autopilot-*.md` (autopilot's own resume rule) → else an
unfinished standalone sprint run log → else the newest finished run,
autopilot first. A sprint run log is identified by content — a `.md` in
`.sprint/` whose first entry is the `ORDER:` line /sprint writes, under an
optional `# ...` heading naming the run (which becomes the progress file's
title) — so stray notes are never mistaken for one, and logs an autopilot log points
at (`STAGE: sprint started →`) belong to that feature run rather than
counting as standalone.

For the chosen run it reads its sprint logs, `review-<ticket>-r<N>.md`
files as the live mid-ticket signal, and `qa-<ticket>[-<N>].md`
verdicts. It writes exactly one file — `.sprint/progress-<feature>.md`
for an autopilot run, `.sprint/progress-<sprint-id>.md` for a sprint run
(re-runs `<id>-2.md`, `-3.md` share the one file) — and touches nothing
else: no network, no dependencies. The two views differ: autopilot draws
the shape → … → retro pipeline, a sprint run draws its own
planned → working → ready → merged funnel plus its waves. Tests live
next to the script (`bun test` in the scripts dir).
