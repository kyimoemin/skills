---
description: I'm stepping away from the laptop — keep it awake, keep working on the current task without me, make the non-critical calls yourself, log every decision, and push to my phone only when you truly need me or when everything is done. Optional argument is when I'll be back (e.g. `/afk 6pm`, `/afk 2h`); `/afk off` or "I'm back" ends it. Use only when I type /afk or say I'm going afk / away from the laptop.
---

# AFK — keep going without me

I'm away. Carry on with whatever was in progress in this session. If nothing
was, say so in one line and stop: don't invent work.

**Times.** You don't know the clock time. Run `date +%H:%M` (or `date` for the
full date) whenever you need a time: the return time, log timestamps, the summary.

## 1. Startup (before I walk off)

Do these in one go and report them in **one short message**:

1. **Keep awake, tied to this session.**
   `nohup caffeinate -ims -w $PPID >/dev/null 2>&1 &`
   `$PPID` in a Bash call is this session's `claude` process, so caffeinate
   exits on its own when the session ends. There's no `-d` on purpose: the
   display may sleep and the screen lock as usual, and the session keeps running
   behind the lock.
2. **Lid and power.** Always tell me to **keep the lid open**. Closing it sleeps
   the Mac whatever caffeinate says, unless an external display is attached.
   Run `pmset -g batt | head -1`. If it's on battery, also tell me to plug in.
3. **Phone reach.** Pushes reach my phone only while Remote Control is
   connected. Remind me in one line to check it's on.
4. **Return time.** If I gave one (`6pm`, `2h`), turn it into a clock time with
   `date` and state it. It only decides when the summary should be ready.
   It never stops work.
5. **Decision log.** Create `~/.claude/afk/<YYYY-MM-DD-HHMM>-<repo or folder name>.md`
   with the Write tool, and append to it with Edit. The header holds the task, the
   start time, the return time, and the line `AFK rules: ~/.claude/skills/afk/SKILL.md`.
   Give me the full path. Do this first, while I'm still here, so any permission
   prompt for that path comes up now and not after I've gone.
6. State the task you're continuing in one line, so I can correct it before I go.

Then start working straight away. Don't wait for a reply.

## 2. While I'm away

**Decide yourself** anything reversible: implementation choices, naming,
which approach to try, fixing tests, in-scope refactors, including deleting or
moving tracked files on a feature branch, creating branches, commits on a
non-default branch, pushing a non-default branch, opening **draft** PRs, running
builds and tests. Prefer the option that's easiest to undo. Follow my CLAUDE.md
rules as usual. Where they say "ask me first", treat that as critical (below).

**Critical: don't do it, park it.** Anything hard to undo, that affects other
people, or that changes the machine or Claude itself:
- push to or merge into main/default or a protected branch, merging any PR,
  marking a PR ready for review
- deploys, releases, publishing, migrations against a real database
- destroying work: deleting untracked/ignored files or data outside git that you
  didn't create this session; `git reset --hard`, `checkout .`/`restore` over
  uncommitted changes, `clean -fd`, `stash drop`/`clear`; rebasing or
  force-pushing a branch that's already pushed
- messages or comments to other people (Slack, email, tracker comments for
  others, reviews on others' PRs)
- spending money, changing paid resources, touching secrets or credentials
- Claude's own settings, permissions, hooks, CLAUDE.md or memory. That includes
  adding an allow rule to get past a prompt.
- machine-wide changes: brew or global installs, shell rc files, system settings
- product or scope calls I'd clearly want to make (changing what the feature *is*)

For a critical item: log it under **Needs you**, push me if it blocks (§4), then
**keep working on everything that doesn't depend on it**.

**Never use AskUserQuestion** (or end a turn with a question to me). It
blocks the session until I'm back. A question becomes a log entry plus, when it
blocks everything, a push.

**Stuck rule.** If the same approach fails 3 times, stop that approach. Log what you
tried, then move to other work or a different approach. Don't loop.

**Don't stop early.** Ending your turn with nothing running in the background
ends the run. Waiting on your own background work (subagents, background Bash,
Monitor) is not the end. You'll be woken when it finishes, so don't poll it
and don't run Finishing yet. The run is over only when the task is done, or when
everything left is parked.

**Other skills.** If you're running `/sprint` (or another skill with its own
stop/notify rules), follow its flow, with two changes:
- Every point where that skill would **ask me** (confirm a list, push a base, add a
  permission, continue or start fresh) becomes park + log + push if it blocks,
  then carry on with anything else.
- An action the mode I explicitly invoked already authorizes, such as
  `/sprint auto` merging its own PRs, is allowed, but only that action. It doesn't
  loosen anything else in the critical list.

**After compaction.** If the conversation was summarized, re-read the log header
and this file before continuing.

## 3. Decision log

Append as you go, never only at the end. One line each, timestamped with `date +%H:%M`:

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

## 5. Replies while I'm away

A message from me that answers a parked item (often sent from my phone): act on
it, log it, and stay in afk mode. Treat it as approval for that item only.

`/afk off`, "I'm back", or anything that says I'm at the laptop again: run
Finishing, but skip the push.

## 6. Finishing

1. **Keep-awake.** If nothing is parked, stop it:
   `pkill -f "^caffeinate -ims -w $PPID\$"`. If items are parked, leave it
   running, so my reply from the phone still reaches an awake session. It
   ends with the session anyway, or at Finishing after `/afk off`.
2. Send the final push (not after `/afk off`).
3. End with a summary written for me coming back cold: what got done (PRs/branches),
   **Needs you** items, notable decisions worth a second look, the log path, and a TLDR at the bottom.
