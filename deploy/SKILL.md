---
description: Ship the integration branch — discover the project's release mechanism, verify CI and QA gates, bump version and changelog per repo convention, then tag/publish/deploy on explicit go-ahead and verify it's live.
argument-hint: "[version | environment]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# Deploy

Run to release what's on the integration branch. Follow in order; stop and
report if a check fails. Deploying is outward-facing and hard to reverse:
nothing ships without my explicit go-ahead at step 5, ever — including
re-runs after a failed attempt.

1. **Discover the release mechanism.** Find how this project actually
   ships — read before assuming: CI release workflows (tag- or
   branch-triggered), publish config in the package manifest, deploy
   scripts or Makefile targets, platform config (Dockerfile/compose,
   Vercel, Fly, etc.), and release notes in README/CONTRIBUTING/CLAUDE.md.
   Take $ARGUMENTS as the version or target environment if given. If you
   find no mechanism, report what you looked for and ask how this project
   deploys — don't invent a pipeline.
2. **Verify the gates.**
   - On the up-to-date integration branch with a clean tree.
   - CI green on the head commit.
   - Approved-but-unmerged PRs: flag them — am I shipping without them
     intentionally?
   - QA: for each ticket merged since the last release, look for its
     results file — exactly `.sprint/qa-<ticket>.md` or a numeric-suffix
     rerun `qa-<ticket>-<N>.md`, never a looser prefix match (same rule
     as /qa: with bare numeric ids a `qa-1*` glob swallows ticket 12's
     results into ticket 1). Take the highest-suffix file as current.
     Failed or blocked QA → stop and report. No results locally → the QA
     may have run on another machine: restore `.sprint/` from the archive
     ref first (`git fetch origin refs/sprint/archive:refs/sprint/archive`
     then `git archive refs/sprint/archive | tar -xk`; `-k` skips existing
     local files on macOS's tar, GNU tar wants `--skip-old-files`). Still
     no QA results → say so and ask whether to run
     /qa first or ship without it; don't silently skip the gate.
3. **Version & changelog.** Infer the versioning scheme from tags and the
   package manifest, and judge the bump from the merged changes since the
   last release. If the project keeps a changelog, draft the entry in its
   existing format from those merges; if it doesn't, don't create one.
   Show me the proposed version and entry.
4. **State the plan.** The exact sequence you will run: bump commit, tag,
   push, the publish/deploy command or the CI workflow the tag triggers,
   and the target environment. No surprises after go-ahead.
5. **Go-ahead gate.** Ask, then wait. Never proceed without my explicit
   confirmation.
6. **Execute.** Commit the bump (`chore: release <version>`), tag, push,
   then run the deploy/publish. If CI does the deployment, watch the run
   (`gh run watch`) to completion. On failure at any point: stop, report
   exactly what state was left behind (tag pushed? partially published?) —
   don't retry blind and don't roll anything back without asking.
7. **Verify it's live.** Prove the release exists where users get it —
   health/version endpoint, registry listing, deployed URL — using the
   check that fits the mechanism from step 1. A deploy that can't be
   verified is reported as unverified, not as done.
8. **Report** one line: version, what shipped where, verification result.
