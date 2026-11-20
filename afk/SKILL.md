---
description: I'm stepping away from the laptop — keep it awake, keep working on the current task without me, make the non-critical calls yourself, log every decision, and push to my phone only when you truly need me or when everything is done. Optional argument is when I'll be back (e.g. `/afk 6pm`, `/afk 2h`). Use only when I type /afk or say I'm going afk / away from the laptop.
---

# AFK — keep going without me

I'm away. Carry on with whatever was in progress in this session. If nothing
was, say so in one line and stop: don't invent work.

## 1. Startup (before I walk off)

Do these in one go and report them in **one short message**:

1. **Keep awake, tied to this session.**
   `nohup caffeinate -dims -w $PPID >/dev/null 2>&1 &`
   (`$PPID` in a Bash call is this session's `claude` process, so caffeinate
   exits on its own when the session ends, with no stray process to clean up.)
2. **Power.** Run `pmset -g batt | head -1`. On battery, warn me: closing the lid on
   battery sleeps the Mac whatever caffeinate says. Tell me to plug in and keep the lid open.
3. **Phone reach.** Pushes reach my phone only while Remote Control is
   connected. Remind me in one line to check it's on.
4. **Return time.** If I gave one (`6pm`, `2h`), turn it into a clock time and
   state it.
5. **Decision log.** Create `~/.claude/afk/<YYYY-MM-DD-HHMM>-<repo or folder name>.md`
   with a heading naming the task, and give me the full path.
6. State the task you're continuing in one line, so I can correct it before I go.

Then start working straight away. Don't wait for a reply.

## 2. While I'm away

**Decide yourself** anything reversible or local: implementation choices,
naming, which approach to try, fixing tests, refactors inside the task's scope,
creating branches, commits on a non-default branch, opening PRs, running
builds and tests. Prefer the option that's easiest to undo. Follow my
CLAUDE.md rules as usual: where they say "ask me first", treat that as critical (below).

**Critical: don't do it, park it.** Anything hard to undo or that leaves the
machine:
- push to or merge into main/default or a protected branch, or merging any PR
- deploys, releases, publishing, migrations against a real database
- deleting files or data you didn't create in this session, `git reset --hard`, force-push
- messages or comments to other people (Slack, email, tracker comments for others, PR reviews on others' PRs)
- spending money, changing paid resources, touching secrets or credentials
- product or scope calls I'd clearly want to make (changing what the feature *is*)

For a critical item: log it under **Needs you**, push me once (below), then
**keep working on everything that doesn't depend on it**. Stop only when nothing
is left that you can do without me.

**Never use AskUserQuestion** (or end a turn with a question to me). It
blocks the session until I'm back. A question becomes a log entry plus, when it
blocks everything, a push.

**Stuck rule.** If the same approach fails 3 times, stop that approach. Log what you
tried, then move to other work or a different approach. Don't loop.

**Don't stop early.** Ending your turn ends the run. Keep going until the task
is done, everything left is parked, or the return time is close.

**Other skills.** If you're running `/sprint` (or another skill with its own
stop/notify rules), those rules win. `/afk` only adds keep-awake, the log and
the end-of-run push.

## 3. Decision log

Append as you go, never only at the end. One line each:

```
- HH:MM decided: <what> — <why, one clause>
- HH:MM parked: <what> — needs you because <reason>
- HH:MM stuck: <what> — tried <x, y, z>; moved on to <next>
```

Keep a **Needs you** section at the top, listing only what's still open.

## 4. Pushing to my phone

Use the `PushNotification` tool (deferred: load it with ToolSearch
`select:PushNotification` first). Under 200 chars, one line, the thing I'd act on
first. Push **only** when:
- something critical is parked *and* it blocks most of the remaining work, or
- the run is finished (done, or everything left is parked).

No progress pings. Don't send more than one push for the same blocker. Collect
the non-blocking parked items into the final push.

Examples: `afk: blocked, PR #42 ready but merge to main needs you` ·
`afk done: 3 PRs open, 1 item needs you (see log)`.

A "not sent" result is fine. It's still in the log.

## 5. Finishing

1. Stop keep-awake: `pkill -f "caffeinate -dims -w $PPID"`.
2. Send the final push.
3. End with a summary written for me coming back cold: what got done (PRs/branches),
   **Needs you** items, notable decisions worth a second look, the log path, and a TLDR at the bottom.
