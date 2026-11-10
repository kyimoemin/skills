#!/usr/bin/env node
// cdp.mjs — reference driver for a UI verification run.
//
// REFERENCE IMPLEMENTATION, NOT A MANDATED TOOL. It is one way that worked;
// adapt it, replace it, or drive your target however suits it better. The only
// mandated instrument in this skill is scripts/luminance.mjs.
//
// Chrome DevTools Protocol and React Native's Hermes debugger speak the SAME
// protocol. What differs is the transport endpoint and what the evaluation
// lands in:
//
//   browser        http://localhost:<port>/json   (Chrome --remote-debugging-port)
//                  evaluation runs in the page; Page.* and Emulation.* work
//   React Native   http://localhost:8081/json     (Metro; Hermes inspector)
//                  evaluation runs in the JS VM; Page.*/Emulation.* do NOT exist
//
// VERIFICATION STATUS (be precise about this — see SKILL.md):
//   VERIFIED against headless Chrome 151 ... the WebSocket transport end to end
//                                            (Runtime.enable -> Runtime.evaluate),
//                                            targets, eval, shot (incl. --theme,
//                                            --full, device metrics), a11y, raw
//   VERIFIED against a synthetic fiber tree  $roots/$walk/$flatten/$text/$name and
//                                            the fonts/tree/scroll/press/set-theme
//                                            snippets. This proves the ALGORITHM,
//                                            not that real React Native fibers
//                                            have this shape.
//   RECOVERED, not invented ................ the React Native / Hermes approach
//                                            here matches the original one-off
//                                            harnesses from four earlier runs,
//                                            found in the shared scratchpad
//                                            (cdp.mjs, drive.mjs, font-probe.js):
//                                            same /json target selection, same
//                                            Runtime.enable -> Runtime.evaluate,
//                                            same DevTools-hook fiber walk. This
//                                            file is dependency-free where they
//                                            imported `ws` by absolute path.
//   NEVER EXECUTED HERE .................... this file against a real React
//                                            Native app over Metro.
//
// Zero dependencies. Node >= 22 (global WebSocket).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const HELP = `cdp.mjs — evaluate and capture over the Chrome DevTools Protocol

USAGE
  cdp.mjs targets  [--port 9222] [--raw]
  cdp.mjs eval     (--expr <js> | --file <path>) [target opts] [--json]
  cdp.mjs shot     --out <file.png> [--full] [--theme light|dark]
                   [--width <px> --height <px> --scale <n>] [target opts]   browser only
  cdp.mjs emulate-theme (light|dark|none) [target opts]           browser only
  cdp.mjs a11y     [--out <file.json>] [target opts]              browser only
  cdp.mjs raw      --method <Domain.method> [--params <json>] [target opts]

  React-fiber helpers (work wherever React runs — browser or Hermes):
  cdp.mjs tier     --global <NAME> [target opts]
  cdp.mjs fonts    [--filter <substr>] [target opts]
  cdp.mjs tree     [--depth 6] [target opts]
  cdp.mjs scroll   (--to <y> | --by <dy>) [--match <js>] [--scroller <n>] [target opts]
  cdp.mjs press    --text <label> [target opts]
  cdp.mjs set-theme <value> --store <NAME> [target opts]

TARGET OPTIONS
  --port <n>      Debugger port. 9222 is Chrome's convention, 8081 is Metro's.
                  Default 9222.
  --device <s>    Substring matched against the target's name fields. REQUIRED
                  when more than one target is attached — the wrong one will
                  answer silently.
  --ws <url>      Use this webSocketDebuggerUrl verbatim.
  --index <n>     Pick the nth filtered target. Default: last.
  --timeout <ms>  Per-call timeout. Default 15000.

BROWSER-ONLY COMMANDS
  shot            Page.captureScreenshot. --full adds captureBeyondViewport for
                  the whole scrollable page rather than the viewport. Capture at
                  the device pixel ratio you intend to measure at and never
                  downscale afterwards.
  emulate-theme   Emulation.setEmulatedMedia with prefers-color-scheme.
                  ** CDP EMULATION OVERRIDES DIE WITH THE SESSION. ** Calling
                  this and then capturing in a SEPARATE invocation gives you two
                  byte-identical frames and a silent false pass — measured, not
                  theorised. Use "shot --theme dark|light", which sets and
                  captures on one socket. This standalone command is only useful
                  against a browser you are driving interactively.
                  Also: an app that persists its own theme overrides the media
                  query entirely, so probe before trusting either.
  a11y            Accessibility.getFullAXTree. Dumps the accessibility tree —
                  role, name and focusability per node. Pixels cannot catch a
                  container that swallows its subtree; this can.

FIBER HELPERS AVAILABLE INSIDE --expr / --file
  $roots()      Mounted FiberRoots via __REACT_DEVTOOLS_GLOBAL_HOOK__.
  $walk(fn)     Depth-first over every fiber; truthy return collects.
  $flatten(s)   Flattens style arrays/objects to one plain object.
  $text(f)      Concatenated string children under a fiber.
  $name(f)      Display name for a fiber's type.

  These read the React DevTools hook, which is present in development builds of
  both React DOM and React Native. They are how you read what ACTUALLY
  rendered — the resolved font, the resolved style — rather than what the
  stylesheet claimed. In a plain (non-React) web page use
  getComputedStyle via \`eval\` instead.

EXAMPLES
  # browser
  cdp.mjs targets --port 9222
  cdp.mjs emulate-theme dark && cdp.mjs shot --out shots/dark.png --full
  cdp.mjs eval --expr 'getComputedStyle(document.querySelector("h1")).fontFamily'
  cdp.mjs a11y --out evidence/axtree.json

  # React (either runtime)
  cdp.mjs fonts --filter Inter
  cdp.mjs eval --expr '$walk(f => $flatten(f.memoizedProps?.style)?.borderRadius).length'
`;

// -------------------------------------------------------- injected preamble

const PREAMBLE = `
var __hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
function $roots() {
  if (!__hook) throw new Error('no __REACT_DEVTOOLS_GLOBAL_HOOK__ — is this a development build?');
  var out = [];
  var ids = __hook.renderers ? Array.from(__hook.renderers.keys()) : [];
  for (var i = 0; i < ids.length; i++) {
    var set = __hook.getFiberRoots ? __hook.getFiberRoots(ids[i]) : null;
    if (set) set.forEach(function (r) { out.push(r); });
  }
  return out;
}
function $walk(fn, limit) {
  var hits = [];
  var roots = $roots();
  var seen = new Set();
  var max = limit || Infinity;
  for (var i = 0; i < roots.length; i++) {
    var stack = [roots[i].current];
    while (stack.length && hits.length < max) {
      var f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      var v;
      try { v = fn(f); } catch (e) { v = undefined; }
      if (v) hits.push(v === true ? f : v);
      // push sibling first so the child pops first — keeps hits in render order
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
  }
  return hits;
}
function $flatten(s) {
  if (!s) return null;
  if (Array.isArray(s)) {
    var o = {};
    for (var i = 0; i < s.length; i++) { var f = $flatten(s[i]); if (f) Object.assign(o, f); }
    return o;
  }
  return typeof s === 'object' ? s : null;
}
function $name(f) {
  var t = f && f.type;
  if (typeof t === 'string') return t;
  if (t && (t.displayName || t.name)) return t.displayName || t.name;
  if (f && f.elementType && (f.elementType.displayName || f.elementType.name)) {
    return f.elementType.displayName || f.elementType.name;
  }
  return null;
}
function $text(f) {
  var out = '';
  var stack = [f];
  while (stack.length) {
    var n = stack.pop();
    if (!n) continue;
    var p = n.memoizedProps;
    if (typeof p === 'string') out += p;
    else if (p) {
      if (typeof p.text === 'string') out += p.text;
      else if (typeof p.children === 'string') out += p.children;
    }
    if (n.child) stack.push(n.child);
    if (n !== f && n.sibling) stack.push(n.sibling);
  }
  return out;
}
`;

// ------------------------------------------------------------ CDP transport

async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json`).catch((e) => {
    throw new Error(
      `cannot reach a debugger on :${port} (${e.message}). ` +
        'Chrome needs --remote-debugging-port; React Native needs Metro running.'
    );
  });
  if (!res.ok) throw new Error(`/json returned ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('/json did not return an array');
  return list;
}

const describe = (t) =>
  [t.deviceName, t.title, t.description, t.appId, t.url].filter(Boolean).join(' | ');

async function pickWs(flags) {
  if (flags.ws) return flags.ws;
  const all = await listTargets(Number(flags.port ?? 9222));
  let list = all.filter((t) => t.webSocketDebuggerUrl);
  if (flags.device) {
    const needle = String(flags.device).toLowerCase();
    list = list.filter((t) => describe(t).toLowerCase().includes(needle));
  }
  if (!list.length) {
    throw new Error(
      `no debugger target matched${flags.device ? ` --device "${flags.device}"` : ''}. ` +
        'Run `cdp.mjs targets` to see what is attached.'
    );
  }
  // A debugger endpoint lists more than your app: extension pages and service
  // workers in Chrome, non-app pages in Metro. Prefer a React/Hermes-looking
  // target when nothing narrower was asked for.
  if (list.length > 1 && !flags.device && flags.index === undefined) {
    const likely = list.filter((t) => /Hermes|React|Bridgeless|Experimental/i.test(describe(t)));
    if (likely.length) list = likely;
  }
  if (list.length > 1 && flags.index === undefined) {
    console.error(
      `cdp.mjs: ${list.length} targets matched, using the last. Pass --device or --index:\n` +
        list.map((t, i) => `  [${i}] ${describe(t)}`).join('\n')
    );
  }
  const idx = flags.index === undefined ? list.length - 1 : Number(flags.index);
  const chosen = list[idx];
  if (!chosen) throw new Error(`--index ${idx} out of range (${list.length} targets)`);
  return chosen.webSocketDebuggerUrl;
}

/** Open one session, hand a `send(method, params)` to fn, close. */
async function withSession(flags, fn) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('no global WebSocket — this script needs Node >= 22');
  }
  const url = await pickWs(flags);
  const timeout = Number(flags.timeout ?? 15000);
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();

  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error(`timed out after ${timeout}ms talking to ${url}`));
    }, timeout);
    const done = (fnDone, v) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      fnDone(v);
    };

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
      }
    });
    ws.addEventListener('error', () => done(reject, new Error(`websocket error on ${url}`)));
    ws.addEventListener('open', async () => {
      try {
        done(resolve, await fn(send));
      } catch (e) {
        done(reject, e);
      }
    });
  });
}

async function evaluate(expression, flags) {
  return withSession(flags, async (send) => {
    await send('Runtime.enable');
    const r = await send('Runtime.evaluate', {
      expression: `${PREAMBLE}\n(function(){ return (${expression}); })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`in-app exception: ${d.exception?.description ?? d.text}`);
    }
    return r.result?.value;
  });
}

// ------------------------------------------------------------ fiber snippets

const S = {
  // The tier/mode constant is project-specific: pass the global or module value
  // you want read. There is no portable way to guess it.
  tier: (name) => `(function(){
    var g = globalThis[${JSON.stringify(name)}];
    if (g !== undefined) return { via: 'global', value: g };
    var hit = $walk(function (f) {
      var p = f.memoizedProps;
      return p && typeof p.children === 'string' && p.children.trim().length < 24
        ? p.children.trim() : null;
    });
    return { via: 'text scan', candidates: hit.slice(0, 40) };
  })()`,

  fonts: (filter) => `(function(){
    var want = ${JSON.stringify(filter ?? '')};
    var seen = [], keys = {}, out = [];
    $walk(function (f) {
      var st = $flatten(f.memoizedProps && f.memoizedProps.style);
      if (!st || !st.fontFamily) return null;
      var t = $text(f).trim();
      if (!t) return null;
      if (want && String(st.fontFamily).indexOf(want) === -1 && t.indexOf(want) === -1) return null;
      seen.push({
        text: t.length > 48 ? t.slice(0, 48) + '\\u2026' : t,
        fontFamily: st.fontFamily, fontSize: st.fontSize, lineHeight: st.lineHeight,
        letterSpacing: st.letterSpacing, fontWeight: st.fontWeight
      });
      return null;
    });
    for (var i = 0; i < seen.length; i++) {
      var k = JSON.stringify(seen[i]);
      if (!keys[k]) { keys[k] = 1; out.push(seen[i]); }
    }
    return out;
  })()`,

  tree: (depth) => `(function(){
    var max = ${Number(depth ?? 6)}, out = [], roots = $roots();
    for (var r = 0; r < roots.length; r++) {
      var stack = [[roots[r].current, 0]];
      while (stack.length) {
        var e = stack.pop(), f = e[0], d = e[1];
        if (!f) continue;
        var n = $name(f);
        if (n && d <= max) out.push(new Array(d + 1).join('  ') + n);
        if (f.sibling) stack.push([f.sibling, d]);
        if (f.child) stack.push([f.child, d + 1]);
      }
    }
    return out;
  })()`,

  // --match is important, not a nicety: screens you navigated AWAY from stay
  // mounted (under a modal, in a stack), so "the last scrollable" is routinely
  // the wrong one and the page you are looking at does not move. Match on
  // something unique to the target scroller's props.
  scroll: (flags) => `(function(){
    var idx = ${Number(flags.scroller ?? 0)};
    var match = ${flags.match ? `(function(f){ return (${flags.match}); })` : 'null'};
    var scrollers = $walk(function (f) {
      if (!(f.stateNode && typeof f.stateNode.scrollTo === 'function')) return null;
      if (match && !match(f)) return null;
      return f.stateNode;
    });
    if (!scrollers.length) {
      return { ok: false, reason: match ? 'no scrollable fiber matched --match' : 'no scrollable fiber found' };
    }
    var s = scrollers[idx];
    if (!s) return { ok: false, reason: 'index out of range', count: scrollers.length };
    ${
      flags.to !== undefined
        ? `s.scrollTo({ y: ${Number(flags.to)}, animated: false });`
        : `if (typeof s.scrollBy === 'function') { s.scrollBy({ y: ${Number(flags.by ?? 0)}, animated: false }); }
           else { return { ok: false, reason: 'no scrollBy; use --to with an absolute offset' }; }`
    }
    return { ok: true, scrollers: scrollers.length, used: idx };
  })()`,

  press: (text) => `(function(){
    var want = ${JSON.stringify(text)};
    var hits = $walk(function (f) { return $text(f).trim() === want ? f : null; });
    if (!hits.length) return { ok: false, reason: 'no fiber whose text is ' + want };
    for (var i = 0; i < hits.length; i++) {
      var n = hits[i];
      while (n) {
        var p = n.memoizedProps;
        if (p && typeof p.onPress === 'function') { p.onPress(); return { ok: true, on: $name(n) }; }
        n = n.return;
      }
    }
    return { ok: false, reason: 'found the text but no pressable ancestor' };
  })()`,

  // Driving an app's own theme store. The store name is project-specific and
  // must be reachable — module-scoped stores are not, without a temporary
  // export. See the project appendix.
  setTheme: (value, globalName) => `(function(){
    var want = ${JSON.stringify(value)};
    function apply(store, via) {
      var st = store.getState();
      if (typeof st.setTheme !== 'function') return null;
      st.setTheme(want);
      return { ok: true, via: via, theme: store.getState().theme };
    }
    var g = ${globalName ? `globalThis[${JSON.stringify(globalName)}]` : 'undefined'};
    if (g && typeof g.getState === 'function') {
      var r = apply(g, ${JSON.stringify(globalName ?? '')});
      if (r) return r;
    }
    var found = $walk(function (f) {
      var bags = [f.memoizedProps, f.memoizedState];
      for (var i = 0; i < bags.length; i++) {
        var bag = bags[i];
        if (!bag || typeof bag !== 'object') continue;
        for (var k in bag) {
          var v = bag[k];
          if (v && typeof v.getState === 'function' && typeof v.setState === 'function') {
            var s = v.getState();
            if (s && typeof s.setTheme === 'function') return v;
          }
        }
      }
      return null;
    });
    for (var j = 0; j < found.length; j++) {
      var r2 = apply(found[j], 'fiber scan');
      if (r2) return r2;
    }
    return { ok: false, reason: 'no store exposing setTheme was reachable — a module-scoped ' +
      'store needs a temporary global export, or use the platform theme lever instead' };
  })()`,
};

// ------------------------------------------------------------------ CLI glue

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['raw', 'json', 'full'].includes(k)) flags[k] = true;
      else flags[k] = argv[++i];
    } else rest.push(a);
  }
  return { flags, rest };
}

const print = (v, asJson) =>
  console.log(asJson || typeof v === 'object' ? JSON.stringify(v, null, 2) : v);

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    process.exit(argv.length ? 0 : 1);
  }
  const cmd = argv[0];
  const { flags, rest } = parseArgs(argv.slice(1));

  if (cmd === 'targets') {
    const list = await listTargets(Number(flags.port ?? 9222));
    if (flags.raw) return print(list, true);
    if (!list.length) return console.log('(no targets attached)');
    list.forEach((t, i) => {
      console.log(`[${i}] ${describe(t)}`);
      console.log(`    ${t.webSocketDebuggerUrl ?? '(no webSocketDebuggerUrl)'}`);
    });
    return;
  }

  if (cmd === 'shot') {
    if (!flags.out) throw new Error('shot needs --out <file.png>');
    if (flags.theme && !['light', 'dark'].includes(flags.theme)) {
      throw new Error('--theme wants light | dark');
    }
    const r = await withSession(flags, async (send) => {
      await send('Page.enable');
      // CDP emulation overrides live and die with the SESSION. Setting the
      // theme in one CLI invocation and capturing in the next silently gives
      // you two identical frames — verified, see the web appendix. So the flip
      // and the capture must share one socket.
      if (flags.theme) {
        await send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: flags.theme }],
        });
      }
      if (flags.width || flags.height || flags.scale) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: Number(flags.width ?? 0),
          height: Number(flags.height ?? 0),
          deviceScaleFactor: Number(flags.scale ?? 0),
          mobile: false,
        });
      }
      return send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: !!flags.full,
      });
    });
    mkdirSync(dirname(flags.out), { recursive: true });
    const buf = Buffer.from(r.data, 'base64');
    writeFileSync(flags.out, buf);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    console.log(`${flags.out}  ${w}x${h}  ${buf.length} bytes`);
    return;
  }

  if (cmd === 'emulate-theme') {
    const v = rest[0];
    if (!['light', 'dark', 'none'].includes(v)) throw new Error('emulate-theme wants light | dark | none');
    await withSession(flags, (send) =>
      send('Emulation.setEmulatedMedia', {
        features: v === 'none' ? [] : [{ name: 'prefers-color-scheme', value: v }],
      })
    );
    console.log(
      `prefers-color-scheme=${v}. CONFIRM THE FLIP IN A SCREENSHOT — an app that persists ` +
        'its own theme will override this and the command still succeeds.'
    );
    return;
  }

  if (cmd === 'a11y') {
    const r = await withSession(flags, async (send) => {
      await send('Accessibility.enable');
      return send('Accessibility.getFullAXTree');
    });
    const nodes = (r.nodes ?? []).map((n) => ({
      role: n.role?.value,
      name: n.name?.value,
      ignored: n.ignored,
      focusable: (n.properties ?? []).find((p) => p.name === 'focusable')?.value?.value,
      disabled: (n.properties ?? []).find((p) => p.name === 'disabled')?.value?.value,
    }));
    if (flags.out) {
      mkdirSync(dirname(flags.out), { recursive: true });
      writeFileSync(flags.out, JSON.stringify(r, null, 2));
      console.log(`${flags.out}  ${nodes.length} nodes`);
    }
    for (const n of nodes) {
      if (n.ignored) continue;
      console.log(
        `${String(n.role ?? '').padEnd(18)} ${n.focusable ? 'focusable' : '         '} ` +
          `${n.disabled ? 'disabled ' : '         '} ${n.name ?? ''}`
      );
    }
    return;
  }

  if (cmd === 'raw') {
    if (!flags.method) throw new Error('raw needs --method <Domain.method>');
    const params = flags.params ? JSON.parse(flags.params) : {};
    return print(await withSession(flags, (send) => send(flags.method, params)), true);
  }

  let expr;
  if (cmd === 'eval') {
    if (flags.file) expr = readFileSync(flags.file, 'utf8');
    else if (flags.expr) expr = flags.expr;
    else throw new Error('eval needs --expr or --file');
  } else if (cmd === 'tier') {
    if (!flags.global) throw new Error('tier needs --global <NAME> (the constant to read)');
    expr = S.tier(flags.global);
  } else if (cmd === 'fonts') expr = S.fonts(flags.filter);
  else if (cmd === 'tree') expr = S.tree(flags.depth);
  else if (cmd === 'scroll') {
    if (flags.to === undefined && flags.by === undefined) throw new Error('scroll needs --to or --by');
    expr = S.scroll(flags);
  } else if (cmd === 'press') {
    if (!flags.text) throw new Error('press needs --text <label>');
    expr = S.press(flags.text);
  } else if (cmd === 'set-theme') {
    if (!rest[0]) throw new Error('set-theme needs a value');
    expr = S.setTheme(rest[0], flags.store);
  } else throw new Error(`unknown command "${cmd}" — try --help`);

  const value = await evaluate(expr, flags);
  if (cmd === 'fonts' && !flags.json && Array.isArray(value)) {
    for (const f of value) {
      console.log(
        `${String(f.fontFamily).padEnd(26)} ${String(f.fontSize ?? '').padStart(4)}` +
          `${f.lineHeight ? '/' + f.lineHeight : ''}  ${f.text}`
      );
    }
    return;
  }
  print(value, flags.json);
}

main().catch((e) => {
  console.error(`cdp.mjs: ${e.message}`);
  process.exit(1);
});
