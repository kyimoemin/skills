# reference/ — optional implementations

**None of this is mandated.** It is one set of mechanics that worked, kept so
the next run does not rebuild it from scratch. Adapt it, replace it, or drive
your target with something else entirely — Playwright, XCUITest, Maestro, a
shell loop. The method in `SKILL.md` is what must be followed; these are
conveniences.

The one exception is `../scripts/luminance.mjs`, which **is** mandated, and for
a specific reason: its numbers are comparable across runs because it reproduces
a historical measurement exactly. Reimplementing "measure luminance" per run
silently breaks that.

| File | What | Verification |
| --- | --- | --- |
| `cdp.mjs` | Chrome DevTools Protocol driver — target listing, JS evaluation, screenshots, theme emulation, accessibility tree, raw CDP; plus React fiber helpers for reading resolved styles | **Browser path verified** against headless Chrome 151. Fiber helpers verified against `fiber-harness.html`. React Native path **recovered** from the original run harnesses but not re-executed here — same `/json` target selection, `Runtime.enable` → `Runtime.evaluate` and React-DevTools-hook fiber walk as the four earlier one-off harnesses, made dependency-free (the originals imported `ws` from the project's `node_modules`). Bring it up with `targets`, then `eval --expr '1+1'`, before trusting anything else |
| `fiber-harness.html` | A synthetic React fiber tree, a fake theme store and a fake scroller in a static page | The self-test used to verify the fiber helpers with no device. Open it in a debuggable browser and run `cdp.mjs fonts/tree/scroll/press/set-theme` against it |
| `screenshot.mjs` | Native capture wrapper (`simctl io` / `adb exec-out screencap`) with dimension reporting | Underlying commands recovered verbatim from runs that used them; this wrapper unrun |
| `devices.mjs` | Simulator/emulator lifecycle — status, boot with a one-target-at-a-time guard, shutdown, deep link, theme, theme-probe, storage reset, disk | Individual commands recovered verbatim; `theme-probe`'s loop and the boot paths unrun |

All are zero-dependency Node `.mjs` with `--help`. `cdp.mjs` needs Node ≥ 22 for
the global `WebSocket`; the others need ≥ 18.

`devices.mjs` and `screenshot.mjs` are mobile-only. A web run needs neither —
`cdp.mjs` covers capture and theme for a browser target.

## If one of these misbehaves

Fix it here rather than working around it in a throwaway script, and update its
verification status in the table above — the only place it is recorded. Four
previous runs of this procedure each rebuilt their harness and threw it away;
that is the waste this directory exists to end.
