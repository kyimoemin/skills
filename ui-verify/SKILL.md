---
name: ui-verify
description: Verify that a UI actually renders and behaves as claimed — on a real target (iOS simulator, Android emulator, or browser) rather than by reading code or trusting a screenshot. Extracts falsifiable assertions (from a ticket, or from a supplied design file, spec, or tokens), picks conditions that could disprove them rather than convenient ones, measures pixels/fonts/contrast/accessibility instead of eyeballing, and writes an evidence file that discloses what was not checked. Use when acceptance criteria say "verified on device/in browser", when a change touches theme, colour, typography, spacing or layout tokens, when checking a build against a design, or when a reviewer asks for proof of how something renders.
---

# UI verification

A UI review that looks right and is wrong is the normal failure, not the rare
one. This skill is a method for producing a verdict that can be checked by
somebody who was not there.

It is target-agnostic. The method is the same for an iOS simulator, an Android
emulator and a browser; the mechanics differ and live in `appendices/`.

## The one lesson this skill is built around

A verification once ran a full sweep of a glass-surface component, both themes,
both platforms, dozens of screenshots, and returned a clean pass. The
implementation was defective. It took two more tickets to find, and the reason
the check missed it was arithmetic:

> The surfaces were translucent fills over a backdrop. Separation between two of
> them is `Δalpha × |backdrop luminance − fill luminance|`. The check ran over
> the app's default background, which sat about **2 luminance levels** from the
> fill. Every surface therefore had to render the same colour — not because the
> code was right, but because that one backdrop made the difference
> mathematically invisible.

Generalised, and this is the spine of the method:

**Work out what the rendering actually depends on, then choose inputs that
bracket that variable's range. Never let the project's own dev fixtures define
the range — they cluster in the comfortable middle, which is exactly where the
bug hides.** In that project every stock fixture sat in a narrow band that could
not have exposed the defect at either end. (Widening the fixtures was filed as
its own ticket; the verification could not wait for it, and used purpose-built
bracketing inputs instead — see `fixtures/`.)

The corollary matters just as much: **a pass under one condition is a statement
about that condition only.** Say so in the evidence file.

## Method

Eight steps. Two modes feed step 1 — a ticket claim, or a design file (see
"Design-conformance mode"). Everything after step 1 is identical.

### 1. State the claim so it can be disproved

Write down, before touching a target, what would make this a FAIL. "Does it look
right" has no failure condition and produces a wandering check that concludes
whatever the author already believed.

Good claims are arithmetic or categorical: *these two surfaces separate by ≥12
levels on every backdrop*; *every label resolves to Inter, not a fallback*;
*each control in this modal is individually focusable*; *no string truncates at
the smallest supported width*.

If the caller has not given you one, derive it and state it back to them.

### 2. Choose conditions that could disprove it

For each claim, name the variable the rendering depends on, then pick inputs
that bracket it — the extremes and the middle, not the default. Backdrop
luminance, string length, screen width, dynamic-type scale, locale, data volume,
network state. Justify each choice in one line; a reader must be able to see
that you tried to break it.

The classes worth covering, and the trap in each:

| Class | Measure | Why eyeballing fails |
| --- | --- | --- |
| **Contrast / legibility** | Sample fg and bg pixels; compute the ratio with `luminance.mjs contrast`; compare against a stated bar (e.g. 4.5:1 body, 3:1 large/UI) | A pass on one backdrop says nothing about another. Text over imagery, over glass, and over an accent fill are three different checks |
| **Typography resolving** | Read the *resolved* font family off the running UI, not the stylesheet | A missing font falls back silently. It looks fine, just wrong. One project shipped the system font instead of its brand font through a full visual review |
| **Layout across sizes** | Smallest and largest supported width, dynamic type / browser zoom, longest supported locale, longest realistic string | Nothing overflows at the developer's own window size with lorem ipsum |
| **Theme correctness** | Every state in both themes; establish the theme lever first (step 6) | A theme you did not actually switch produces two identical screenshots and a false pass |
| **Interaction / focus states** | hover, press, focus, disabled — that they *differ*, and that focus is visible | Static screenshots never contain these states |
| **Accessibility tree** | Walk the a11y tree; check every control is individually focusable, labelled, and correctly roled | **Pixels cannot catch this.** A wrapper defaulting to "accessible" can swallow its whole subtree — the page renders perfectly while neither the confirm button nor the dismiss action is individually reachable. Worst in a forced modal, where it leaves the user with no reachable control at all |
| **Non-happy states** | empty, loading, error, offline, permission-denied | These are the least-verified surfaces in most projects, because they are the hardest to reach on purpose |

Cover the classes the claim touches. Say which you skipped.

### 3. Reach the surface on each target

Get to the exact screen and state, reproducibly, and record how. If a state is
only reachable by hand, that is worth recording as a finding of its own.
Mechanics per target: `appendices/`.

### 4. Capture at full resolution

Never downscale, never crop before measuring. Record the pixel dimensions and
the scale factor with every capture — a number measured at an unknown scale is
not comparable to anything.

### 5. Measure — do not eyeball

Use `scripts/luminance.mjs` for anything colour- or luminance-shaped.

**This is the one mandated tool in the skill, and the reason is comparability:**
it reproduces the historical measurements exactly (see "Verified vs
reconstructed"), so numbers from a run today sit in the same units as last
quarter's. Do not replace it with an ad-hoc sampler, and do not "simplify" it
away.

```bash
node scripts/luminance.mjs --help
node scripts/luminance.mjs stats <png...>            # whole-image mean/sd/min/max
node scripts/luminance.mjs sample <png> --scale 3 \  # box average at tile centres
  --origin 74,194 --pitch 108,128 --labels a,b,c,bare
node scripts/luminance.mjs contrast <png> --fg 210,480 --bg 240,480   # WCAG ratio
```

One boundary to respect: the `L` that `stats`/`sample`/`pixel` print is luma on
raw sRGB bytes — kept that way for cross-run comparability. It is **not** WCAG
relative luminance. For the 4.5:1 / 3:1 bars in step 2, use
`luminance.mjs contrast`, which gamma-decodes per WCAG 2.x (and also takes
`--fg-rgb`/`--bg-rgb` for values read straight from a tokens file). Never build
a contrast ratio out of the byte-luma `L`.

Two rules that come with it:

- **Sample a bare reference of the backdrop alongside the thing you are
  measuring.** A surface colour without its backdrop is uninterpretable.
- **Whole-image mean is not the local backdrop under an element.** On any
  photograph they diverge hard. Conflating them is what produced the wrong
  conclusion in the story above.

For non-colour properties, read the resolved value out of the running UI —
computed style in a browser, the render tree in a React app — rather than the
source. `reference/cdp.mjs` shows one way.

### 6. Both themes — and establish the theme lever first

Do not assume the platform theme switch works. **An app that persists its own
theme preference overrides the OS/browser lever, and the lever still reports
success.** That silently yields two identical "both themes" captures.

Probe it: flip the lever, capture, flip back, capture, and compare the two
frames numerically. If they did not move, the app is overriding — find the app's
own lever, or clear its persisted preference, before making any theme-dependent
claim. Record in the evidence file **which lever was used and which way the
preference was left**.

### 7. Write evidence incrementally

Create the evidence file *before* the first capture, with the claim, the plan
and a `STATUS: IN PROGRESS` banner. Refine it in place as results land. Do the
highest-risk condition first and write its result before moving on.

End with a literal `VERDICT: FINAL` line. **A file without that line is not a
verdict** — it is a partial run whose numbers are provisional, and it should say
so in its own banner. (Long runs get killed: machine sleep, timeouts, session
limits. Durable partial results beat a complete result you never got to write.)

### 8. Disclose what was not run

An explicit "not verified" section, as unchecked boxes. Targets skipped,
conditions not reached, props never exercised, anything inferred rather than
observed. **Silent omission is the failure mode** — a reader cannot tell the
difference between "checked and fine" and "never looked".

## Design-conformance mode

When the caller supplies a design source of truth — an image export, a PDF, a
written spec, a design-tokens file, or a link — it does not change the method. It
changes where step 1's claims come from: **the design file is the source of the
falsifiable assertions.**

### Extract assertions; do not pixel-diff

**Naively diffing a mockup against a screenshot looks rigorous and is almost
always wrong.** Device scale factors, font rasterisation and hinting, real data
versus placeholder text, platform chrome, and safe-area insets all differ, so
the diff is dominated by noise. You then get either false failures, or — worse —
false confidence, once somebody raises the difference threshold until it passes.
A threshold tuned until the diff is green measures nothing.

Instead, pull *measurable properties* out of the design and compare each one
numerically against the same property read from the running UI:

colours · spacing and padding · type size, weight, line height, tracking · corner
radii · border widths · opacity · icon shape and size · elevation/shadow · the
set of states drawn

`scripts/luminance.mjs` samples a design export exactly as it samples a
screenshot, which is what makes the colour comparison apples-to-apples.

### State tolerances before measuring

Write the tolerance per property class *first* — colour within N levels, spacing
within N px, type size exact, radii exact. **A tolerance chosen after seeing the
result is not a check.** If you have to widen one mid-run, say so in the evidence
file and say why.

### Unspecified is not a pass

Where the design is silent or ambiguous — a state not drawn, a breakpoint not
shown, no dark-theme variant, no long-string treatment — record it as
**unspecified** and raise it to the caller as a question. Do not infer the
intended value and quietly mark it conformant.

In practice this is the most valuable output of a design check: the design never
covered a state the implementation is obliged to have.

### Reconcile against tokens

Three things can disagree: the design file, the token definitions, and the
implementation. Check **implementation against tokens** *and* **design against
tokens**. A design that contradicts the tokens is itself a finding to report —
not something to silently resolve in favour of whichever side you looked at
first.

### Handle the input format honestly

| Input | What to do |
| --- | --- |
| Raster export (PNG/JPG) | Sample it directly with `luminance.mjs`. Record the export's pixel dimensions and its intended scale — a 2x export and a 1x screenshot are not comparable on spacing |
| PDF / multi-page spec | Frame selection matters. Record **which page/frame each assertion came from**, so a reader can re-check one row |
| Design tokens file | The strongest case: read values directly, no sampling error. Prefer this whenever it exists |
| Written spec | The assertions are already in words. The risk is prose that is not actually checkable ("feels spacious", "subtle shadow") — push back and ask for a number rather than inventing precision |
| Hosted link (Figma etc.) | May not be reachable from the sandbox. If it is not, **say so and ask for an export** — do not guess at its contents |

### The disproof rule still applies, harder

A design file typically shows **one idealised backdrop, one theme, one string
length, one screen size**. Conformance verified only in the drawn condition
proves very little. Extract the assertions from the design, then test them under
step 2's bracketing conditions — including the ones the design never drew.

### Evidence shape

One row per assertion, so any single row can be re-checked without rerunning
everything:

| # | Assertion (source) | Design value | Measured | Tolerance | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | card fill, frame "Home/dark" | `#151922` | `rgb(21,25,34)` | ±2 levels | PASS |
| 2 | card radius, frame "Home/dark" | 16px | 16px | exact | PASS |
| 3 | pressed state | — | — | — | UNSPECIFIED — not drawn; raised to caller |

Same `VERDICT: FINAL` discipline; same explicit list of assertions that could not
be checked, and why.

## Project appendix

Project-specific facts — bundle ids, deep links, how to reach a component
gallery, how the app stores its theme, known open bugs that affect verification
— do not belong in this skill. **Look for a project-local appendix and read it
before starting:**

1. `docs/ui-verify.md`
2. otherwise, search the repo for `ui-verify.md`
3. otherwise, check the project's agent instructions (`AGENTS.md`, `CLAUDE.md`)
   for a verification section

If none exists, say so in the evidence file, and record the target-specific
facts you had to discover — bundle id, how you reached the screen, how you
switched theme — so somebody can turn them into one.

## Gotchas

Tagged with where they apply. Skip the ones that are not your target.

- **[all] An animated element defeats frame de-duplication.** A spinner or a
  looping animation makes every capture differ even at an identical scroll
  offset, so md5-comparing consecutive frames will never tell you that you have
  reached the bottom of a page. Find it visually.

- **[all] Emulation and appearance overrides can be session-scoped.** Measured:
  setting `prefers-color-scheme` over CDP in one process and capturing in the
  next produced two **byte-identical** frames — the override died with the
  socket. Set and capture in one session, and always confirm the flip
  numerically.

- **[all] More than one target attached means the debugger lists them all**, and
  the wrong one answers silently. Always select explicitly. A real Chrome lists
  extension pages and service workers alongside your page (nine targets in the
  verified run); a mobile bundler lists every attached device.

- **[all] "The last scrollable element" is routinely the wrong one.** Screens you
  navigated away from stay mounted — under a modal, deeper in a stack — so a
  scroll command can succeed while the page you are looking at does not move.
  Match the scroller on something unique to it, and confirm the scroll landed by
  capturing, not by the command's return value.

- **[mobile] Boot one heavyweight target at a time.** Two simulators plus an
  emulator plus a bundler is enough to destabilise a laptop; a killed run loses
  everything not yet written. Shut one down before booting the next, and write
  results between them.

- **[mobile] A dev-server hot reload can silently no-op.** One historical
  capture came back showing the previous state. Render the variable you are
  measuring (theme, fixture id, mode) into the UI itself so a stale frame is
  detectable — that is how it was caught.

- **[mobile/React Native] Adding an import to a hot module can break it** until
  a full app restart (`ReferenceError`, black screen). Terminate and relaunch
  after any import change.

- **[macOS] `df /` reads the sealed read-only system volume and lies.** Use
  `/System/Volumes/Data`. A run was once aborted over a phantom disk-full.

## Files

| Path | Status | Purpose |
| --- | --- | --- |
| `scripts/luminance.mjs` | **mandated** | PNG luminance sampler. Box average at named points; whole-image grid stats. Zero deps |
| `fixtures/` | instruments | Four backdrops bracketing luminance ~9 to ~245, with measured statistics |
| `appendices/ios-simulator.md` | mechanics | |
| `appendices/android-emulator.md` | mechanics | |
| `appendices/web-browser.md` | mechanics | |
| `reference/` | **optional** | Reference implementations of the driving and capture mechanics — one way that worked. Adapt or replace freely |

Everything is zero-dependency Node `.mjs` and takes `--help`. Nothing is ever
added to the project's dependency manifest: verification tooling must not
perturb a dependency set that release tooling validates.

**Paths in this file are relative to the skill's own install directory, not the
project.** When the skill is installed personal-scoped
(`~/.claude/skills/ui-verify/`) the working directory is the project being
verified, so invoke the scripts by their absolute install path — resolve it once
at the start of a run and reuse it.

## Verified vs reconstructed

Keep this distinction in anything this skill produces. `scripts/luminance.mjs`
is **verified**: it reproduces a historical 216-sample measurement byte-for-byte
and an independent 17-image statistics table exactly, and its later-added
`contrast` subcommand is verified against WCAG reference values (black on white
= 21.00:1, `#767676` on white = 4.54:1) while touching none of the historical
modes' arithmetic.

Everything under `reference/` is a mix of verified and recovered-but-unrun. The
per-file table in `reference/README.md` is the single authority on which is
which — read it before trusting any of those files, and bring each recovered one
up with its smoke step first. Don't restate that status here; two copies drift.

When this skill's own tooling misbehaves, **fix it here** rather than working
around it in a one-off script, and update that table. The whole point is that
the next run inherits a working harness instead of rebuilding one.
