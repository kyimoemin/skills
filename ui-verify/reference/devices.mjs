#!/usr/bin/env node
// devices.mjs — boot / shutdown / deep-link / theme helpers for a mobile target.
//
// REFERENCE IMPLEMENTATION, NOT A MANDATED TOOL. The individual commands are
// recovered verbatim from runs that executed them; this wrapper around them was
// not run. What it adds is the one rule those runs kept re-learning: ONE TARGET
// AT A TIME — `boot` refuses to start a second device while another is up.
//
// Project-agnostic: bundle ids, URL schemes and storage paths are arguments,
// never constants. Put those in the project's own ui-verify appendix.
//
// Zero dependencies.

import { spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';

const HELP = `devices.mjs — one-target-at-a-time mobile device control

USAGE
  devices.mjs status
  devices.mjs disk
  devices.mjs boot     --ios <udid> | --avd <name>   [--force]
  devices.mjs shutdown [--ios <udid> | --android | --all]
  devices.mjs open     --url <deep-link> [--app <id>] [--ios <udid> | --android]
  devices.mjs theme    (--ios <udid> | --android) (light|dark)
  devices.mjs theme-probe [--ios <udid> | --android] [--delta 5]
  devices.mjs theme-state --ios <udid> --app <bundle-id> [--store <rel-path>]
  devices.mjs reset-theme --ios <udid> --app <bundle-id> --store <rel-path>

COMMANDS
  status       What is booted right now, on both platforms. Run before boot.

  disk         Free space. \`df /\` reads the sealed read-only macOS system
               volume and LIES; the real figure is on /System/Volumes/Data.
               A run was once aborted over a phantom disk-full reading this
               wrong.

  boot         Boot exactly one target. Refuses if anything else is booted
               (--force overrides, but do not). Android is booted headless:
               \`emulator -avd X -no-window -no-snapshot -gpu swiftshader_indirect\`.
               With a window an emulator has been seen to sit at 0% CPU for >10
               minutes across three attempts; -no-window booted it in 13s.

  shutdown     \`xcrun simctl shutdown\` / \`adb emu kill\`. Run this between
               targets, before booting the next one.

  open         Deep-link into the app with --url. THE FORM IS PER-PLATFORM and
               the difference bites:
                 iOS      prefer the fully-qualified bundle id as the scheme
                          ("com.example.app://path"). A bare custom scheme
                          raises a disambiguation dialog whenever a stale build
                          also claims it.
                 Android  use the plain scheme ("myapp://path") and pass the
                          package via --app as the final argument. The
                          fully-qualified form typically does NOT resolve
                          ("Activity not started, unable to resolve Intent").
               The project's appendix should record both exact strings.

  theme        OS-level appearance: \`simctl ui <udid> appearance light|dark\` /
               \`adb shell cmd uimode night no|yes\`. This lever only works while
               the app is following the system theme — an app that persists its
               own preference overrides it, and this command still exits 0. See
               theme-probe. ALWAYS confirm a flip in the screenshot, never from
               a return value.

  theme-probe  DECIDE THE LEVER EMPIRICALLY. Flips OS appearance both ways,
               captures a frame each time, and compares mean luminance. If the
               screen moved, the OS lever is obeyed (preference is 'system'). If
               it did not, a preference is pinned and overriding it — use
               reset-theme, or drive the app's own store with
               \`cdp.mjs set-theme\`.

               Requires the app foregrounded on a themed screen. Do this before
               any theme-dependent observation: which state a device is in is
               NOT inferable from what the previous run did.

  theme-state  Print the app's data container, and whether --store exists under
               it. Weaker evidence than theme-probe — a store existing does not
               prove a theme key is set inside it. Prefer theme-probe.

  reset-theme  Delete a persisted-preference store under the app's data
               container so the theme falls back to its default, then relaunch
               the app. iOS only.

               --store is a path RELATIVE TO THE DATA CONTAINER and is
               storage-library specific, e.g. "Documents/mmkv",
               "Library/Preferences/<id>.plist", "Library/Application Support".
               Get it from the project's appendix. This usually clears more than
               the theme; acceptable on a scratch simulator.

               NO ANDROID EQUIVALENT IS IMPLEMENTED — no run has recorded a
               working one. Untested candidates, in order of bluntness:
                 adb shell pm clear <package>                (all app data)
                 adb shell run-as <package> rm -rf files/<store>
               The second needs a debuggable build. Verify whichever you use by
               flipping the OS lever afterwards and looking at the screenshot,
               then record it in the project appendix.

EXAMPLES
  devices.mjs status
  devices.mjs boot --ios <udid>
  devices.mjs open --ios <udid> --url "com.example.app://settings"
  devices.mjs open --android --url "myapp://settings" --app com.example.app
  devices.mjs theme-probe --ios <udid>
  devices.mjs reset-theme --ios <udid> --app com.example.app --store Documents/mmkv
`;

const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function bootedIos() {
  const out = sh('xcrun', ['simctl', 'list', 'devices', 'booted']).stdout ?? '';
  return out
    .split('\n')
    .filter((l) => l.includes('(Booted)'))
    .map((l) => {
      const m = l.match(/^\s*(.+?)\s+\(([0-9A-F-]{36})\)/);
      return m ? { name: m[1], udid: m[2] } : null;
    })
    .filter(Boolean);
}

function adbDevices() {
  const r = sh('adb', ['devices']);
  if (r.error || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === 'device')
    .map((p) => p[0]);
}

function cmdStatus() {
  const ios = bootedIos();
  const andr = adbDevices();
  console.log('iOS simulators booted:');
  if (ios.length) ios.forEach((d) => console.log(`  ${d.name}  ${d.udid}`));
  else console.log('  (none)');
  console.log('Android devices attached:');
  if (andr.length) andr.forEach((s) => console.log(`  ${s}`));
  else console.log('  (none)');
  const total = ios.length + andr.length;
  if (total > 1) {
    console.log(`\n!! ${total} targets are up. Shut all but one down before continuing.`);
  }
}

function cmdDisk() {
  // `df /` reports the sealed read-only system volume and is meaningless here.
  const r = sh('df', ['-h', '/System/Volumes/Data']);
  process.stdout.write(r.stdout ?? '');
  console.log('(read from /System/Volumes/Data — `df /` reports the sealed system volume and lies)');
}

function cmdBoot(flags) {
  const up = [...bootedIos().map((d) => d.name), ...adbDevices()];
  if (up.length && !flags.force) {
    console.error(
      `devices.mjs: ${up.join(', ')} already up. One target at a time — shut it down first ` +
        `(devices.mjs shutdown --all). Use --force only if you know why.`
    );
    process.exit(1);
  }
  if (flags.ios) {
    const r = sh('xcrun', ['simctl', 'boot', flags.ios], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
  if (flags.avd) {
    const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    if (!home) throw new Error('ANDROID_HOME / ANDROID_SDK_ROOT is not set');
    const log = flags.log ?? `/tmp/emulator-${flags.avd}.log`;
    const fd = openSync(log, 'a');
    const child = spawn(
      `${home}/emulator/emulator`,
      ['-avd', flags.avd, '-no-window', '-no-snapshot', '-gpu', 'swiftshader_indirect'],
      { detached: true, stdio: ['ignore', fd, fd] }
    );
    child.unref();
    console.log(
      `booting ${flags.avd} headless (pid ${child.pid}), log: ${log}\n` +
        'It took ~13s last time. Poll with `adb devices` until it reports "device", ' +
        'then `adb wait-for-device shell getprop sys.boot_completed` returns 1.'
    );
    return;
  }
  throw new Error('boot needs --ios <udid> or --avd <name>');
}

function cmdShutdown(flags) {
  if (flags.all || (!flags.ios && !flags.android)) {
    sh('xcrun', ['simctl', 'shutdown', 'all'], { stdio: 'inherit' });
    for (const s of adbDevices()) sh('adb', ['-s', s, 'emu', 'kill'], { stdio: 'inherit' });
    return cmdStatus();
  }
  if (flags.ios) sh('xcrun', ['simctl', 'shutdown', flags.ios], { stdio: 'inherit' });
  if (flags.android) for (const s of adbDevices()) sh('adb', ['-s', s, 'emu', 'kill'], { stdio: 'inherit' });
  return cmdStatus();
}

function cmdOpen(flags) {
  if (!flags.url) throw new Error('open needs --url "<scheme>://<path>" (see --help: the form differs per platform)');
  if (flags.android) {
    if (!flags.app) throw new Error('open --android needs --app <package> as the intent target');
    const r = sh(
      'adb',
      ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', flags.url, flags.app],
      { stdio: 'inherit' }
    );
    process.exit(r.status ?? 0);
  }
  const r = sh('xcrun', ['simctl', 'openurl', flags.ios ?? 'booted', flags.url], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}

function cmdTheme(flags, value) {
  if (!['light', 'dark'].includes(value)) throw new Error('theme wants light | dark');
  if (flags.android) {
    sh('adb', ['shell', 'cmd', 'uimode', 'night', value === 'dark' ? 'yes' : 'no'], {
      stdio: 'inherit',
    });
  } else {
    sh('xcrun', ['simctl', 'ui', flags.ios ?? 'booted', 'appearance', value], { stdio: 'inherit' });
  }
  console.log(
    `set OS appearance to ${value}. This is ignored while the app's persisted theme ` +
      `preference is 'light'/'dark' — see \`devices.mjs reset-theme\`. CONFIRM THE FLIP IN A ` +
      `SCREENSHOT, not from this command's exit code.`
  );
}

/** Mean luminance of a freshly captured frame, via the sibling scripts. */
function frameMeanL(flags, tmp) {
  const here = new URL('.', import.meta.url).pathname;
  const shot = spawnSync(
    process.execPath,
    [
      `${here}screenshot.mjs`,
      flags.android ? 'android' : 'ios',
      tmp,
      ...(flags.ios ? ['--udid', flags.ios] : []),
    ],
    { encoding: 'utf8' }
  );
  if (shot.status !== 0) throw new Error(`capture failed: ${(shot.stderr ?? '').trim()}`);
  const st = spawnSync(process.execPath, [`${here}../scripts/luminance.mjs`, 'stats', tmp, '--csv'], {
    encoding: 'utf8',
  });
  if (st.status !== 0) throw new Error(`stats failed: ${(st.stderr ?? '').trim()}`);
  return Number(st.stdout.trim().split('\n').pop().split(',')[1]);
}

function cmdThemeProbe(flags) {
  const min = Number(flags.delta ?? 5);
  const a = `/tmp/theme-probe-dark.png`;
  const b = `/tmp/theme-probe-light.png`;
  const set = (v) =>
    flags.android
      ? sh('adb', ['shell', 'cmd', 'uimode', 'night', v === 'dark' ? 'yes' : 'no'])
      : sh('xcrun', ['simctl', 'ui', flags.ios ?? 'booted', 'appearance', v]);

  set('dark');
  const dark = frameMeanL(flags, a);
  set('light');
  const light = frameMeanL(flags, b);
  const delta = Math.abs(light - dark);

  console.log(`OS appearance=dark   meanL ${dark.toFixed(1)}  ${a}`);
  console.log(`OS appearance=light  meanL ${light.toFixed(1)}  ${b}`);
  console.log(`delta ${delta.toFixed(1)} (threshold ${min})`);
  if (delta >= min) {
    console.log(
      '\nOS LEVER OBEYED — the persisted preference is at its default. Drive theme with ' +
        '`devices.mjs theme`, and record that in the evidence file.'
    );
  } else {
    console.log(
      '\nOS LEVER IGNORED — a theme preference is pinned in the app and is overriding it. ' +
        'This is NOT broken theme switching. Either clear it (`devices.mjs reset-theme`, ' +
        'iOS only, relaunch after) or drive the store directly (`cdp.mjs set-theme`, which ' +
        'leaves it pinned). Record which you did and which way it was set.\n' +
        'If the app was backgrounded or on an unthemed screen, this result is meaningless — ' +
        'check the two PNGs before believing it.'
    );
  }
}

function containerPath(flags) {
  if (!flags.app) throw new Error('this command needs --app <bundle-id>');
  const r = sh('xcrun', ['simctl', 'get_app_container', flags.ios ?? 'booted', flags.app, 'data']);
  if (r.status !== 0) throw new Error(`get_app_container failed: ${(r.stderr ?? '').trim()}`);
  return r.stdout.trim();
}

function cmdThemeState(flags) {
  const root = containerPath(flags);
  console.log(root);
  if (!flags.store) {
    console.log(
      '  (pass --store <path-relative-to-container> to check a specific store; the path is\n' +
        '   storage-library specific and belongs in the project appendix)'
    );
    return;
  }
  const dir = `${root}/${flags.store}`;
  const ls = sh('ls', ['-la', dir]);
  console.log(dir);
  console.log(ls.status === 0 ? ls.stdout : '  (absent — the preference is at its default)');
  console.log(
    'A store existing does not prove a theme key is set inside it, and most of these formats ' +
      'are binary rather than greppable. Prefer `theme-probe`, which decides empirically.'
  );
}

function cmdResetTheme(flags) {
  if (!flags.store) {
    throw new Error(
      'reset-theme needs --store <path-relative-to-container>, e.g. Documents/mmkv — ' +
        'it is storage-library specific; get it from the project appendix'
    );
  }
  const dir = `${containerPath(flags)}/${flags.store}`;
  const r = sh('rm', ['-rf', dir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`failed to remove ${dir}`);
  console.log(
    `removed ${dir}\nTerminate and relaunch the app — the preference is back to its default ` +
      'and the OS theme lever should be obeyed. Confirm with `theme-probe`, not by assuming. ' +
      'This usually clears more than the theme; fine on a scratch simulator.'
  );
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    process.exit(argv.length ? 0 : 1);
  }
  const cmd = argv[0];
  const flags = {};
  const rest = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['android', 'all', 'force'].includes(k)) flags[k] = true;
      else flags[k] = argv[++i];
    } else rest.push(a);
  }

  if (cmd === 'status') return cmdStatus();
  if (cmd === 'disk') return cmdDisk();
  if (cmd === 'boot') return cmdBoot(flags);
  if (cmd === 'shutdown') return cmdShutdown(flags);
  if (cmd === 'open') return cmdOpen(flags);
  if (cmd === 'theme') return cmdTheme(flags, rest[0]);
  if (cmd === 'theme-probe') return cmdThemeProbe(flags);
  if (cmd === 'theme-state') return cmdThemeState(flags);
  if (cmd === 'reset-theme') {
    if (flags.android) {
      throw new Error(
        'no verified Android reset exists — see --help for the two untested candidates, ' +
          'run one by hand, confirm it with a screenshot, then record it here'
      );
    }
    return cmdResetTheme(flags);
  }
  throw new Error(`unknown command "${cmd}" — try --help`);
}

try {
  main();
} catch (e) {
  console.error(`devices.mjs: ${e.message}`);
  process.exit(1);
}
