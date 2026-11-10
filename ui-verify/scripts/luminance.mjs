#!/usr/bin/env node
// luminance.mjs — pixel luminance sampler for device-check screenshots.
//
// Reproduces a historical measurement method exactly, so numbers stay
// comparable across runs and across tickets:
//   * decoded straight from the PNG, no image library, no eyeballing
//   * `sample`: 9x9 box average at a tile centre, on the full-resolution shot
//   * `stats` : 8px grid sample over a whole image (mean / sd / min / max L)
//   * L = 0.2126R + 0.7152G + 0.0722B on sRGB byte values (no gamma decode)
//   * `contrast`: WCAG 2.x ratio between two colours — the one mode that DOES
//     gamma-decode; added later, does not touch the historical modes above
//
// Zero dependencies. Node >= 18 (uses node:zlib inflateSync).
//
// VERIFIED: reproduces an archived 24-screenshot / 216-sample measurement
// byte-for-byte, and an independent 17-image statistics table exactly. That
// reproducibility is the reason this file is mandated rather than reimplemented
// per run — do not change its arithmetic or its output shape.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inflateSync } from 'node:zlib';

const HELP = `luminance.mjs — sample pixel luminance out of PNG screenshots

USAGE
  luminance.mjs stats    <png...> [--step 8] [--csv]
  luminance.mjs sample   <png> --scale <n> [grid | points] [options]
  luminance.mjs pixel    <png> --at <x,y> [--box 9]
  luminance.mjs contrast (<png> --fg <x,y> --bg <x,y> [--box 9]
                          | --fg-rgb <r,g,b> --bg-rgb <r,g,b>)

COMMANDS
  stats    Whole-image luminance over an N-px grid. Reports meanL, sdL, min,
           max per file. This is the mode that produced the cover table in
           an archived whole-image statistics table.

  sample   Box-average samples at named tile centres, in the raw-samples.txt
           output shape. This is the mode that produced
           an archived raw-samples file, and the shape kept for comparability.

  pixel    One box-average sample at explicit device pixels. Ad-hoc probing.

  contrast WCAG 2.x contrast ratio between two colours — box-average sampled
           from a PNG (like pixel), or given directly as r,g,b (e.g. from a
           design-tokens file). The ONLY mode that gamma-decodes; use it for
           the 4.5:1 / 3:1 accessibility bars.

GRID ADDRESSING (sample)
  Points are laid out in logical points, converted to device pixels, then
  offset. For each cell:  px = round((originX + col*pitchX) * scale + offX)
  Rounding happens after scaling — at non-integer densities (Android 420dpi =
  scale 2.625) rounding the logical points first lands on the wrong pixel.

  --scale <n>        Device pixel ratio. iPhone 17 Pro / 15 Pro = 3,
                     a 420dpi Android device = 2.625. Required.
  --origin <x,y>     First cell centre, in logical points.
  --pitch <x,y>      Cell-to-cell distance, in logical points.
  --cols <n>         Cells per row; labels fill row-major. Default 3.
  --off <x,y>        Device-pixel offset added after scaling (scroll offset /
                     harness origin). Default 0,0.
  --labels <a,b,..>  Row label per sample, in row-major order. Required.
  --box <n>          Box edge in device pixels. Default 9 — the historical
                     unit; changing it breaks comparability with old numbers.
  --baseline <label> Label treated as the bare backdrop reference: it prints no
                     d= and is excluded from the delta chain. Default "bare".

POINTS ADDRESSING (sample)
  --points <x,y:label ...>   Explicit device-pixel centres, bypassing the grid.
                             Use for surfaces that are not on a regular grid.

OUTPUT (sample)
  --title <s>        Emits a "=== <s>" section header before the block.
  Each row prints: label, rgb(), L, @(x,y), and d= (max-channel delta from the
  previous non-baseline row). The baseline row (--baseline, default "bare")
  prints no d= and is excluded from the delta chain.

EXAMPLES
  # a 3x3 surface grid over a backdrop, iOS at scale 3
  luminance.mjs sample shot.png --scale 3 --origin 74,194 --pitch 108,128 \\
    --off 0,348 --labels control,panel,chrome,overArt,bare \\
    --title 'liquid / theme=dark / cover=dark (iPhone 17 Pro, iOS 26.5, scale 3)'

  # Labels are pure CLI input, never baked in. An archived run used a different
  # vocabulary for the same grid; re-running it with those labels still
  # reproduces that file exactly.

  # whole-image stats for the mock covers
  luminance.mjs stats mock-server/assets/covers/*.png

NOTES
  * The L printed by stats/sample/pixel is luma on raw sRGB bytes — kept that
    way for cross-run comparability. It is NOT WCAG relative luminance; never
    build a contrast ratio from it. Use "contrast", which gamma-decodes.
  * The PNG reader handles 8-bit greyscale / RGB / palette / +alpha,
    non-interlaced. 16-bit and Adam7-interlaced files are a hard error.
  * meanL/sdL of a whole cover and the backdrop L measured at a tile centre are
    different numbers and answer different questions — the blend formula depends
    on the local backdrop under the tile, not the image mean. Conflating them is
    a documented cause of a wrong conclusion.
`;

// ---------------------------------------------------------------- PNG decode

function decodePng(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error('not a PNG (bad signature)');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }

  if (depth !== 8) {
    throw new Error(`unsupported PNG bit depth ${depth} (only 8-bit is handled)`);
  }
  if (interlace !== 0) {
    throw new Error('unsupported PNG: Adam7 interlacing is not handled');
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);
  if (colorType === 3 && !palette) throw new Error('indexed PNG with no PLTE');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // undo per-scanline filters
  let ip = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ip++];
    const line = raw.subarray(ip, ip + stride);
    ip += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      switch (filter) {
        case 0:
          break;
        case 1:
          v = v + a;
          break;
        case 2:
          v = v + b;
          break;
        case 3:
          v = v + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      cur[x] = v & 0xff;
    }
  }

  // normalise to RGB triples
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, n = width * height; i < n; i++) {
    let r;
    let g;
    let b;
    if (colorType === 0 || colorType === 4) {
      r = g = b = out[i * channels];
    } else if (colorType === 3) {
      const idx = out[i] * 3;
      r = palette[idx];
      g = palette[idx + 1];
      b = palette[idx + 2];
    } else {
      r = out[i * channels];
      g = out[i * channels + 1];
      b = out[i * channels + 2];
    }
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { width, height, rgb };
}

// ------------------------------------------------------------------ sampling

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// WCAG 2.x relative luminance — gamma-decoded, unlike `lum` above. Used only
// by `contrast`; the historical modes stay on byte luma for comparability.
const wcagLum = (r, g, b) => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** Box average centred on (cx, cy), clamped to the image. Returns int RGB. */
function boxAverage(img, cx, cy, box) {
  const half = (box - 1) >> 1;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = cy - half; y <= cy + half; y++) {
    if (y < 0 || y >= img.height) continue;
    for (let x = cx - half; x <= cx + half; x++) {
      if (x < 0 || x >= img.width) continue;
      const i = (y * img.width + x) * 3;
      sr += img.rgb[i];
      sg += img.rgb[i + 1];
      sb += img.rgb[i + 2];
      n++;
    }
  }
  if (!n) throw new Error(`sample point (${cx},${cy}) is outside the image`);
  return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
}

function gridStats(img, step) {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 3;
      const L = lum(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]);
      n++;
      sum += L;
      sumSq += L * L;
      if (L < min) min = L;
      if (L > max) max = L;
    }
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return { n, mean, sd, min, max };
}

// ------------------------------------------------------------------ CLI glue

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'csv') {
        flags.csv = true;
        continue;
      }
      if (key === 'points') {
        const pts = [];
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) pts.push(argv[++i]);
        flags.points = pts;
        continue;
      }
      flags[key] = argv[++i];
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

const triple = (s, what) => {
  const m = String(s).split(',');
  if (m.length !== 3 || m.some((v) => v.trim() === '' || Number.isNaN(Number(v)))) {
    throw new Error(`--${what} wants "r,g,b", got "${s}"`);
  }
  return m.map(Number);
};

const pair = (s, what) => {
  const m = String(s).split(',');
  if (m.length !== 2 || m.some((v) => v.trim() === '' || Number.isNaN(Number(v)))) {
    throw new Error(`--${what} wants "x,y", got "${s}"`);
  }
  return [Number(m[0]), Number(m[1])];
};

const fmtL = (v) => v.toFixed(1).padStart(5);
const fmtC = (v) => String(v).padStart(3);

function cmdStats(files, flags) {
  const step = Number(flags.step ?? 8);
  if (flags.csv) console.log('file,meanL,sdL,min,max,samples');
  else console.log('| cover | meanL | sdL | min | max |\n| --- | --- | --- | --- | --- |');
  for (const f of files) {
    const img = decodePng(readFileSync(f));
    const s = gridStats(img, step);
    const name = basename(f).replace(/\.png$/i, '');
    if (flags.csv) {
      console.log(
        `${name},${s.mean.toFixed(1)},${s.sd.toFixed(1)},${s.min.toFixed(1)},${s.max.toFixed(1)},${s.n}`
      );
    } else {
      console.log(
        `| ${name} | ${s.mean.toFixed(1)} | ${s.sd.toFixed(1)} | ${s.min.toFixed(1)} | ${s.max.toFixed(1)} |`
      );
    }
  }
}

function cmdSample(file, flags) {
  const img = decodePng(readFileSync(file));
  const box = Number(flags.box ?? 9);
  const off = flags.off ? pair(flags.off, 'off') : [0, 0];

  let points;
  if (flags.points) {
    points = flags.points.map((p) => {
      const [xy, label] = p.split(':');
      const [x, y] = pair(xy, 'points');
      return { label: label ?? `${x},${y}`, x: Math.round(x), y: Math.round(y) };
    });
  } else {
    if (!flags.scale) throw new Error('--scale is required for grid addressing');
    if (!flags.labels) throw new Error('--labels is required');
    const scale = Number(flags.scale);
    const [ox, oy] = pair(flags.origin ?? '0,0', 'origin');
    const [px, py] = pair(flags.pitch ?? '0,0', 'pitch');
    const cols = Number(flags.cols ?? 3);
    points = flags.labels.split(',').map((label, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        label,
        x: Math.round((ox + col * px) * scale + off[0]),
        y: Math.round((oy + row * py) * scale + off[1]),
      };
    });
  }

  if (flags.title) console.log(`=== ${flags.title}`);
  console.log(
    `# ${basename(file)}  ${img.width}x${img.height}  off=(${off[0].toFixed(1)}, ${off[1].toFixed(1)})`
  );

  const baseline = flags.baseline ?? 'bare';
  let prev = null;
  for (const p of points) {
    const [r, g, b] = boxAverage(img, p.x, p.y, box);
    const isBaseline = p.label === baseline;
    const d =
      prev && !isBaseline
        ? Math.max(Math.abs(r - prev[0]), Math.abs(g - prev[1]), Math.abs(b - prev[2]))
        : null;
    console.log(
      `  ${p.label.padEnd(7)}rgb(${fmtC(r)},${fmtC(g)},${fmtC(b)})  L=${fmtL(lum(r, g, b))}  @(${p.x},${p.y})` +
        (d === null ? '' : `  d=${d}`)
    );
    if (!isBaseline) prev = [r, g, b];
  }
}

function cmdPixel(file, flags) {
  const img = decodePng(readFileSync(file));
  const [x, y] = pair(flags.at ?? '0,0', 'at');
  const [r, g, b] = boxAverage(img, Math.round(x), Math.round(y), Number(flags.box ?? 9));
  console.log(`  rgb(${fmtC(r)},${fmtC(g)},${fmtC(b)})  L=${fmtL(lum(r, g, b))}  @(${x},${y})`);
}

function cmdContrast(rest, flags) {
  let fg;
  let bg;
  if (flags['fg-rgb'] || flags['bg-rgb']) {
    if (!flags['fg-rgb'] || !flags['bg-rgb']) {
      throw new Error('contrast wants both --fg-rgb and --bg-rgb');
    }
    fg = triple(flags['fg-rgb'], 'fg-rgb');
    bg = triple(flags['bg-rgb'], 'bg-rgb');
  } else {
    if (!rest[0] || !flags.fg || !flags.bg) {
      throw new Error('contrast wants <png> --fg x,y --bg x,y, or --fg-rgb/--bg-rgb');
    }
    const img = decodePng(readFileSync(rest[0]));
    const box = Number(flags.box ?? 9);
    const [fx, fy] = pair(flags.fg, 'fg');
    const [bx, by] = pair(flags.bg, 'bg');
    fg = boxAverage(img, Math.round(fx), Math.round(fy), box);
    bg = boxAverage(img, Math.round(bx), Math.round(by), box);
  }
  const lf = wcagLum(fg[0], fg[1], fg[2]);
  const lb = wcagLum(bg[0], bg[1], bg[2]);
  const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
  console.log(`  fg  rgb(${fmtC(fg[0])},${fmtC(fg[1])},${fmtC(fg[2])})  Lrel=${lf.toFixed(4)}`);
  console.log(`  bg  rgb(${fmtC(bg[0])},${fmtC(bg[1])},${fmtC(bg[2])})  Lrel=${lb.toFixed(4)}`);
  console.log(`  contrast ${ratio.toFixed(2)}:1  (WCAG bars: >=4.5 body, >=3.0 large/UI)`);
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    process.exit(argv.length ? 0 : 1);
  }
  const cmd = argv[0];
  const { flags, rest } = parseArgs(argv.slice(1));
  try {
    if (cmd === 'stats') cmdStats(rest, flags);
    else if (cmd === 'sample') cmdSample(rest[0], flags);
    else if (cmd === 'pixel') cmdPixel(rest[0], flags);
    else if (cmd === 'contrast') cmdContrast(rest, flags);
    else throw new Error(`unknown command "${cmd}" — try --help`);
  } catch (e) {
    console.error(`luminance.mjs: ${e.message}`);
    process.exit(1);
  }
}

main();
