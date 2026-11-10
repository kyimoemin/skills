# Appendix — iOS simulator

**Verification status:** the `simctl` commands here are recovered verbatim from
runs that executed them. The CDP driving (`reference/cdp.mjs` against a React
Native app over Metro) is **recovered from the original run harnesses but has
not been re-executed** — bring it up carefully. See SKILL.md § Verified vs reconstructed.

## Start and reach the target

```bash
xcrun simctl list devices available          # find the udid and its runtime
xcrun simctl boot <udid>
xcrun simctl shutdown all                    # between targets — see below
```

**Boot one heavyweight target at a time**, and write results to the evidence
file before booting the next. Pick the highest-risk one first.

Which runtime you pick is part of the check, not a convenience: OS version can
select a whole rendering path (system materials, blur implementations, font
stacks). If the project has version-dependent rendering, its appendix should say
which runtimes correspond to which path — verify the path actually resolved
rather than assuming it from the version.

Install/launch the app:

```bash
xcrun simctl install <udid> /path/to/App.app
xcrun simctl launch <udid> <bundle-id>
xcrun simctl terminate <udid> <bundle-id>
```

A JS/style-only change needs no native rebuild if a dev client is already
installed and assets are served by the bundler. A native module change does.

## Reach a specific screen

```bash
xcrun simctl openurl <udid> "<bundle-id>://path/to/screen"
```

**Use the fully-qualified bundle id as the scheme where the app supports it.** A
bare custom scheme (`myapp://`) raises a disambiguation dialog whenever a stale
build with a different bundle id also claims it — which a machine used for
development very often has. A previous run treated that dialog as a hard
blocker; it is not, it is an addressing mistake.

Some surfaces are unlinked (component galleries, debug screens). The project
appendix should record how to reach them.

## Capture a full-resolution screenshot

```bash
xcrun simctl io <udid> screenshot out.png
```

Full device resolution, no downscaling. `reference/screenshot.mjs ios` wraps
this and prints dimensions and byte size so a capture can be sanity-checked
without opening it.

## Drive interaction

`simctl` has no tap injection, and UI automation needs a macOS Accessibility
grant that a headless agent often does not have. The route that worked without
any TCC grant is the app's own JS runtime over the bundler's debugger endpoint:

```bash
node reference/cdp.mjs targets --port 8081       # Metro
node reference/cdp.mjs eval --port 8081 --device '<device name>' --expr '1+1'
node reference/cdp.mjs fonts --port 8081 --device '<device name>'
node reference/cdp.mjs scroll --port 8081 --to 640 --device '<device name>'
```

Hermes speaks the same protocol as Chrome DevTools; only the endpoint and the
evaluation context differ. `Page.*` and `Emulation.*` do **not** exist there —
screenshots and theme come from `simctl`, not from CDP.

**This path is recovered, not re-executed.** Verify it in this order: `targets` → `eval --expr
'1+1'` → anything else.

## Switch theme

```bash
xcrun simctl ui <udid> appearance dark      # or light
```

This is the OS lever. It does nothing when the app persists its own theme
preference — and it still exits 0. One historical run also saw it report the new
value on an older runtime while the UI kept rendering the old one, through an
app relaunch.

**So: probe, do not trust.** Flip, capture, flip, capture, compare numerically
(`reference/devices.mjs theme-probe` automates this; the loop itself is
unverified). Clearing a persisted preference means removing the app's storage:

```bash
xcrun simctl get_app_container <udid> <bundle-id> data
# then remove the app's storage directory under that container, and relaunch
```

The exact path is project-specific and belongs in the project appendix.

## Layout across sizes

Boot different device models rather than resizing — `simctl` has no viewport
override. Dynamic Type:

```bash
xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large
```

*Untested here.* Sizes run `extra-small` … `accessibility-extra-extra-extra-large`.

## Target-specific traps

- **Two simulators plus an emulator plus a bundler** is a real stability risk on
  a laptop. One at a time.
- **`df /` reads the sealed read-only system volume and lies.** Use
  `/System/Volumes/Data`. A run was aborted over a phantom disk-full.
- **A stale build claiming the same URL scheme** causes the disambiguation
  dialog. Fully-qualify the scheme.
- **`simctl io screenshot` captures the device, not the app** — status bar and
  home indicator are included, so fixed sample coordinates shift if you change
  device model.
- **Simulator ≠ device.** GPU-backed materials, real blur cost and display gamma
  are all different. Anything performance- or gamma-sensitive stays unverified
  until it runs on hardware; say so.
