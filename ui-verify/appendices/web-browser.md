# Appendix — web browser

Applies to any web UI, including React Native for Web (`expo start --web` /
`npm run web`), which renders to DOM and is verified as an ordinary web page.

**Verification status: this appendix is the most verified of the three.** Every
command below was executed against headless Chrome 151 on macOS while writing
it, except where marked.

## Start and reach the target

Serve the app however the project does (`npm run dev`, `npm run web`, a static
server). Then launch a browser with the DevTools Protocol exposed:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/ui-verify-profile --no-first-run --disable-gpu \
  "http://localhost:3000/"
```

`--user-data-dir` is not optional in practice: without a scratch profile Chrome
may attach to an existing instance and ignore the debugging port. Headed works
too — drop `--headless=new` — and is better when you need to watch an
interaction.

```bash
node reference/cdp.mjs targets --port 9222
```

**Expect noise.** A real Chrome lists extension background pages, service
workers and omnibox popups alongside your page — nine targets in the verified
run. Always select yours explicitly with `--device` (matched against title and
URL).

## Reach a specific screen

Navigate by URL; it is the one target where deep-linking is free. For state that
is not addressable, drive it:

```bash
node reference/cdp.mjs eval --device 'My App' \
  --expr 'document.querySelector("[data-testid=open-settings]").click(); "ok"'
```

For a React app you can also press through the render tree — see
`reference/cdp.mjs press`. For a plain page, `click()` on the element is simpler
and more honest.

## Capture a full-resolution screenshot

```bash
node reference/cdp.mjs shot --device 'My App' --out shots/home-light.png \
  --full --theme light --width 390 --height 844 --scale 3
```

- `--full` uses `captureBeyondViewport` for the whole scrollable page.
- `--width/--height/--scale` set device metrics; `--scale` is the device pixel
  ratio. **Capture at the ratio you intend to measure at and never downscale.**
- Record dimensions with every capture; the command prints them.

## Drive interaction

`Runtime.evaluate` through `cdp.mjs eval` covers most of it. For real input
events — hover, focus rings, press states that only respond to trusted events —
use `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` via `cdp.mjs raw`
(*this specific pair is untested here*):

```bash
node reference/cdp.mjs raw --method Input.dispatchMouseEvent \
  --params '{"type":"mouseMoved","x":120,"y":240}'
```

Reading resolved values — the step-5 "measure, do not eyeball" rule:

```bash
# what font ACTUALLY rendered, not what the stylesheet asked for
node reference/cdp.mjs eval --device 'My App' \
  --expr 'getComputedStyle(document.querySelector("h1")).fontFamily'
```

`document.fonts.check('16px Inter')` tells you whether the face is loaded at
all, which distinguishes "wrong rule" from "font never arrived".

## Switch theme

```bash
node reference/cdp.mjs shot --out shots/dark.png --theme dark --device 'My App'
```

**The theme must be set and the capture taken in the same session.** Verified
failure: `emulate-theme dark` in one invocation followed by `shot` in the next
produced two byte-identical frames (mean luminance 254.5 both times) because the
`Emulation.setEmulatedMedia` override died with the socket. Doing both on one
socket gives 14.7 vs 254.5. This is the single easiest way to produce a false
"both themes verified".

If the app persists its own theme (localStorage, a cookie, a store), the media
query is overridden and this lever does nothing. Probe by comparing the two
frames numerically:

```bash
node scripts/luminance.mjs stats shots/dark.png shots/light.png --csv
```

If the means match, the app is overriding — clear its stored preference or drive
its own setter.

## Accessibility tree

The class of defect pixels cannot catch:

```bash
node reference/cdp.mjs a11y --device 'My App' --out evidence/axtree.json
```

Prints role / focusable / disabled / name per node. Check each interactive
control appears individually, is focusable, and has a name. A container that
swallows its subtree shows up as a single node where you expected several.

## Layout across sizes

Loop `--width/--height/--scale` over the project's breakpoints and capture each.
Browser zoom is `Emulation.setPageScaleFactor`; text-only zoom is
`Emulation.setEmulatedMedia` plus a root font-size override. *Untested here.*

## Target-specific traps

- **Emulation overrides are per-session.** Above. The biggest one.
- **`--user-data-dir` omitted** → Chrome silently attaches to your running
  browser and the debugging port never opens.
- **Extension and service-worker targets pollute `/json`.** Select explicitly.
- **Headless and headed rasterise text slightly differently**, and `--disable-gpu`
  changes it again. Fine for measuring colour and geometry; do not compare glyph
  pixels across modes.
- **`file://` pages** work for harnesses but have different CORS and storage
  behaviour than the real app.
- **React Native for Web** renders RN primitives to DOM. The React fiber helpers
  work; the *shape* of what you find differs from native (no `RCTText`), and
  styles arrive as DOM classes rather than RN style objects — prefer
  `getComputedStyle` there.
