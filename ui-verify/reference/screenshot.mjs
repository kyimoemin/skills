#!/usr/bin/env node
// screenshot.mjs — capture a full-resolution frame off a simulator or emulator.
//
// REFERENCE IMPLEMENTATION. The underlying commands are recovered verbatim from
// runs that executed them; this wrapper around them was not run:
//   iOS      xcrun simctl io <udid|booted> screenshot <out.png>
//   Android  adb [-s <serial>] exec-out screencap -p > <out.png>
// This wrapper adds the parts that were re-derived by hand every run: naming,
// full-res verification, and the size/dimension line the write-up needs.
//
// Zero dependencies.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const HELP = `screenshot.mjs — capture a device frame to PNG

USAGE
  screenshot.mjs ios     <out.png> [--udid <udid|booted>]
  screenshot.mjs android <out.png> [--serial <serial>]
  screenshot.mjs auto    <out.png>

NOTES
  * "auto" picks whichever of the two is currently up, and errors if both are —
    a device check should only ever have one target booted at a time.
  * Captures are at the device's full resolution (e.g. 1206x2622, 1179x2556,
    1080x2400). Do not downscale and do not crop before measuring: every
    measurement in this skill samples full-resolution pixels, and a number
    measured at an unknown scale is comparable to nothing.
  * Prints "<file>  <w>x<h>  <bytes>" so the capture can be sanity-checked
    without opening it.
  * md5 de-duplication of consecutive frames does NOT work on a page containing
    any animation — a spinner alone makes every frame differ at an identical
    scroll offset. Find the bottom of a page visually instead.
`;

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 256, ...opts });

function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

function bootedIos() {
  const r = run('xcrun', ['simctl', 'list', 'devices', 'booted']);
  const out = r.stdout.toString();
  const ids = [...out.matchAll(/\(([0-9A-F-]{36})\) \(Booted\)/g)].map((m) => m[1]);
  return ids;
}

function adbDevices() {
  const r = run('adb', ['devices']);
  if (r.error) return [];
  return r.stdout
    .toString()
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === 'device')
    .map((p) => p[0]);
}

function captureIos(out, udid) {
  const r = run('xcrun', ['simctl', 'io', udid ?? 'booted', 'screenshot', out]);
  if (r.status !== 0) throw new Error(`simctl screenshot failed: ${r.stderr.toString().trim()}`);
}

function captureAndroid(out, serial) {
  const args = serial ? ['-s', serial, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'];
  const r = run('adb', args);
  if (r.status !== 0) throw new Error(`adb screencap failed: ${r.stderr.toString().trim()}`);
  if (!r.stdout.length) throw new Error('adb screencap returned no bytes');
  writeFileSync(out, r.stdout);
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    process.exit(argv.length ? 0 : 1);
  }
  let mode = argv[0];
  const out = argv[1];
  if (!out) throw new Error('an output path is required');
  const flags = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  }
  mkdirSync(dirname(out), { recursive: true });

  if (mode === 'auto') {
    const ios = bootedIos();
    const andr = adbDevices();
    if (ios.length && andr.length) {
      throw new Error(
        'both an iOS simulator and an Android device are up. Boot ONE target at a ' +
          'time (see the skill\'s gotcha list) or pass ios/android explicitly.'
      );
    }
    if (ios.length) mode = 'ios';
    else if (andr.length) mode = 'android';
    else throw new Error('nothing is booted');
  }

  if (mode === 'ios') captureIos(out, flags.udid);
  else if (mode === 'android') captureAndroid(out, flags.serial);
  else throw new Error(`unknown mode "${mode}" — ios | android | auto`);

  const size = pngSize(out);
  if (!size) throw new Error(`${out} is not a valid PNG`);
  console.log(`${out}  ${size[0]}x${size[1]}  ${statSync(out).size} bytes`);
}

try {
  main();
} catch (e) {
  console.error(`screenshot.mjs: ${e.message}`);
  process.exit(1);
}
