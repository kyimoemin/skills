---
description: Audit the project from one or more points of view — dispatch a read-only audit-* subagent per lens (product, ui-ux, business, architecture, engineering, security, release-ops), check their top findings against the code, and write one ranked report. `all` runs every lens; lens names run only those. Read-only — files no tickets.
argument-hint: "[all | product | ui-ux | business | architecture | engineering | security | release-ops ...]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git ls-files:*), Bash(gh pr list:*), Bash(gh repo view:*), Bash(mkdir:*), Bash(ls:*)
---

# Audit

You are a dispatcher and a checker. The auditing happens inside `audit-*`
subagents, one per lens. Your own work is the brief before they start and
the verification after they return.

Read-only. Change nothing in the repo, file no tickets, commit nothing.
The only files written are the reports in the run's audit folder (step 2).

## Lenses

| Lens | Agent | Also accepted |
|---|---|---|
| product | `audit-product` | `pm` |
| ui-ux | `audit-ui-ux` | `ui`, `ux`, `design` |
| business | `audit-business` | `biz`, `gtm` |
| architecture | `audit-architecture` | `arch` |
| engineering | `audit-engineering` | `eng`, `code` |
| security | `audit-security` | `sec`, `privacy` |
| release-ops | `audit-release-ops` | `release`, `ops` |

- **`all`** → every lens.
- **One or more names** (`/audit security`, `/audit security arch`) →
  only those.
- **No argument** → print this table and the usage line, and stop. Seven
  agents is a cost I choose by typing `all`.
- **A name that matches no lens** → say which name, print the table, and
  stop. Don't guess a lens from it.

Run from inside one repo. In a project folder that maps several repos,
say so and stop: an audit covers one repo per run.

## 1. Brief

The auditors know nothing about this project except what you hand them and
what they read. A thin brief gets a generic checklist back. Spend a few
cheap reads here; don't audit anything yourself yet.

- **Conventions.** Read the repo's `CLAUDE.md` and `AGENTS.md`.
- **Stage.** Work out where the project stands: what has shipped or been
  submitted, what is in flight, what comes next, and how much is open.
  Sources: the plan, the active sprint or milestone, a release checklist,
  `git log`, open PRs, the tracker's status counts. Write it as 3–6 lines
  with dates.
- **Settled.** List the decisions that must not come back as findings:
  what the project instructions state as rules or owner decisions, and
  the recorded decisions in the architecture or spec docs. Name them
  briefly; the auditors read the docs for the detail.
- **Covered.** Earlier audits: a `docs/audits/` folder or the like, and
  the newest earlier run in the audit folder (step 2). Name the files so the auditors point to
  them instead of redoing them.
- **Machine and privacy rules** the project instructions set (memory
  limits, ports, files not to open, private documents). Pass them on.
- **What was audited.** Record the branch, the HEAD sha, and whether the
  tree is dirty.

## 2. Output folder

One folder per run, `<YYYY-MM-DD>/`, holding `<lens>.md` per lens and
`summary.md`. A second run on the same day uses `<YYYY-MM-DD>-2`, and so
on. Where it goes:

- **The repo already has an audits folder** (`docs/audits/` or the like),
  or has a `docs/` folder → `docs/audits/<run>/`. The files are left
  uncommitted for me to read; commit them only when I ask.
- **No `docs/` folder** → `.audit/<run>/`, kept out of git through
  `.git/info/exclude`, never `.gitignore`: add the line if it isn't there.

Below, `<audits>` is whichever of the two applies.

## 3. Dispatch

Send every chosen lens in ONE message so they run side by side. Each gets
its own agent type from the table and this prompt:

```
repo: <absolute path>
stage: <the 3–6 lines>
settled: <the list>
covered: <files, or "none">
out: <absolute path>/<audits>/<run>/<lens>.md
<machine and privacy rules, if any>
```

- Don't set a model or effort unless the project instructions or I ask.
- Don't hand an auditor your own suspicions. An agent given a hypothesis
  tends to return it confirmed.
- They run in the background. While you wait, don't do their work.
- If the `audit-*` agent types aren't available, say so and stop. Don't
  substitute a general agent with a prompt written from memory.

An auditor that returns `blocked:` or fails gets one re-dispatch if the
cause is something you can supply. Otherwise its lens is listed as not
run.

## 4. Verify

Findings come back sounding equally certain whether they are right or
not. Before anything reaches me:

- **Open the evidence** for every Critical and High finding, and for
  anything else headed for the top of the summary. Read the cited lines
  yourself and mark the finding:
  - `confirmed`: the code or doc says what the finding says.
  - `partly`: true, but narrower or less severe than claimed. Restate it.
  - `not confirmed`: the evidence doesn't support it. Drop it from the
    ranking and list it under Dropped with the reason.
  - `unchecked`: you couldn't check it statically (needs a device, a live
    service, or the owner). Keep it, labelled.
- **Check the tracker claim.** Where a finding says "no ticket", grep the
  tracker yourself for the top ones.
- **Merge duplicates** across lenses into one finding that names each
  lens that raised it. Two lenses reaching the same finding on their own
  is a signal: say so.
- **Re-rank across lenses** against the stage. Severity from one auditor
  isn't comparable with another's until you have read both.
- Don't run the test suite, builds or anything live to verify. If a
  finding needs that, it is `unchecked`.

## 5. Summary file

Write `<audits>/<run>/summary.md`:

1. **Audited:** date, branch, sha, lenses run, lenses not run and why.
2. **Stage assumed:** the lines you gave the auditors.
3. **Verdict:** 3–5 lines across all lenses.
4. **Top findings:** at most 15, ranked. Each: title, severity, lens or
   lenses, evidence, verification mark, the existing ticket (id and
   title) or "untracked", and the fix in a line or two.
5. **By lens:** each lens's verdict and a link to its report.
6. **Dropped:** findings that failed verification, one line each.
7. **Not checked:** what no auditor could cover.

For a single-lens run the summary is the same file with one lens in it.

## 6. Report to me

Short, and it stands on its own:

- The verdict.
- The top findings, at most 10, as a ranked list: title, severity, where,
  ticket id with its title or "untracked". Say how many were confirmed,
  restated and dropped.
- The path of `summary.md`.
- One line offering the next step: which untracked findings to file with
  `/add-ticket`. File nothing until I pick. Follow the project's rule on
  where new tickets go (the active sprint's scope may be fixed).
