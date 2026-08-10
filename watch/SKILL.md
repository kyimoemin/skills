---
description: Maintain a visual progress file for the current autopilot run — .sprint/progress-<feature>.md with a mermaid pipeline, a waiting-on-you list, and a ticket table, all derived read-only from the run's own logs. One-shot by default; --watch keeps it live while autopilot runs.
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
- Script prints "No autopilot log" → relay that message as-is; nothing to
  fix. An autopilot run creates its log at startup, so this just means
  the loop hasn't started here yet.

## What the script derives (for your report, not for you to re-derive)

The newest unfinished `.sprint/autopilot-*.md` (autopilot's own resume
rule), its sprint run logs via the `STAGE: sprint started →` pointers,
`review-<ticket>-r<N>.md` files as the live mid-ticket signal, and
`qa-<ticket>[-<N>].md` verdicts. It writes exactly one file,
`.sprint/progress-<feature>.md`, and touches nothing else — no network,
no dependencies. Tests live next to it (`bun test` in the scripts dir).
