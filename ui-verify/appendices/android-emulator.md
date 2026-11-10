# Appendix — Android emulator

**Verification status:** the `adb` / `emulator` commands here are recovered
verbatim from runs that executed them. The CDP driving is **recovered from the original
run harnesses but not re-executed** against a real app. See SKILL.md § Verified vs reconstructed.

## Start and reach the target

```bash
$ANDROID_HOME/emulator/emulator -list-avds
$ANDROID_HOME/emulator/emulator -avd <name> \
  -no-window -no-snapshot -gpu swiftshader_indirect
adb devices                                   # wait for "device"
adb wait-for-device shell getprop sys.boot_completed   # 1 when ready
adb emu kill                                  # shut down
```

**`-no-window` is not a preference.** On the machine these runs came from, a
windowed emulator sat at 0% CPU with no console port for over ten minutes across
three attempts; headless booted in thirteen seconds. If a windowed emulator
hangs, this is why.

One heavyweight target at a time; write results before booting the next.

Install and launch:

```bash
adb install -r app-debug.apk
adb shell am start -n <package>/.MainActivity
adb shell am force-stop <package>
```

## Reach a specific screen

```bash
adb shell am start -a android.intent.action.VIEW -d "myapp://path" <package>
```

Passing the package as the final argument targets one claimant and avoids a
chooser. Note the asymmetry with iOS: **a fully-qualified `com.example.app://`
scheme typically does not resolve on Android** (`Activity not started, unable to
resolve Intent`) — Android matches the scheme declared in the manifest. Use the
plain scheme plus the package.

## Capture a full-resolution screenshot

```bash
adb exec-out screencap -p > out.png
```

`exec-out` (not `shell`) avoids line-ending mangling that corrupts the PNG.
`reference/screenshot.mjs android` wraps this and prints dimensions.

Record the density: `adb shell wm density`. Sample coordinates in device pixels
depend on it — a 420dpi device is scale 2.625, not an integer, so logical-point
grids must be rounded after scaling, not before.

## Drive interaction

Two routes.

**Real input events** (no debugger needed, genuinely exercises press states):

```bash
adb shell input tap <x> <y>
adb shell input swipe <x1> <y1> <x2> <y2> <ms>
adb shell input text "hello"
adb shell input keyevent KEYCODE_BACK
```

Coordinates are device pixels. This is more honest than synthesising a press in
JS, but it is blind — pair it with a capture.

**The app's JS runtime**, for reading resolved values:

```bash
node reference/cdp.mjs targets --port 8081
node reference/cdp.mjs fonts --port 8081 --device '<device name>'
```

Recovered, not re-executed; bring up with `targets` then `eval --expr '1+1'`.

## Switch theme

```bash
adb shell cmd uimode night yes     # dark
adb shell cmd uimode night no      # light
```

Same caveat as everywhere: this is the OS lever, and an app that persists its
own theme overrides it while the command still succeeds. Probe by capturing both
ways and comparing numerically.

Clearing a persisted preference:

```bash
adb shell run-as <package> rm -rf files/mmkv       # verified, MMKV apps
adb shell pm clear <package>                       # fallback — nukes ALL app data
```

The `run-as` form is **verified** — executed successfully against a
react-native-mmkv app on an API 34 emulator, whose default store path is
`files/mmkv`. It needs a debuggable build, which a dev client is. Prefer it over
`pm clear`, which also destroys the signed-in session and any other app state
your run depends on.

Two things to expect afterwards: a dev-client launcher may need its server row
tapped again before the app reconnects (it looks like a hang, it isn't), and a
different storage library will use a different path — confirm by flipping the
lever and looking at the capture, then record the working path in the project
appendix.

## Layout across sizes

The emulator can be resized live without rebooting:

```bash
adb shell wm size 1080x2400      # adb shell wm size reset
adb shell wm density 420         # adb shell wm density reset
adb shell settings put system font_scale 1.30    # dynamic type
```

Always `reset` afterwards. *Untested here.* This makes Android the cheapest
target for the "layout across sizes" class in step 2.

## Target-specific traps

- **Windowed emulator hangs** — use `-no-window`.
- **AVDs can vanish.** A run found both named AVDs gone mid-session, with
  `~/.android/avd/` absent, most plausibly an automatic disk reclamation. The
  system image survived and a replacement AVD was hand-written (the SDK's
  bundled `avdmanager` is a legacy JAXB build that dies on modern JDKs). If AVDs
  disappear, check the system image before assuming a reinstall is needed — and
  record in the evidence file that results came from a substitute profile.
- **Transient dependency downloads poison Gradle builds.** One build failed on a
  truncated `.aar`; clearing that module's cache directory and rerunning fixed
  it. Not a code defect — recognise it rather than chasing it.
- **`adb shell` mangles binary output.** Use `exec-out` for screenshots.
- **Non-integer density.** 420dpi = 2.625. Round after scaling.
- **Platform palette overrides.** Some projects apply an Android-specific theme
  override, so a colour differing from iOS may be intentional. The project
  appendix should say; do not file it as off-palette without checking.
