# fixtures/ — bracketing backdrops

Four images that bracket backdrop luminance from ~9 to ~245. They exist to make
step 2 of the method possible for anything drawn *over* imagery: translucent
surfaces, text on photos, scrims, overlays, glass.

## Why a project's own fixtures are not enough

Separation between a translucent surface and what is behind it is

    Δalpha × |backdrop luminance − fill luminance|

so the interesting behaviour is at the *ends* of the backdrop range. Stock dev
fixtures cluster in the comfortable middle: in the project these came from, all
seventeen shipped covers measured meanL 43–104, and a check run only over them
reproduced exactly the blind spot that hid a real defect for two tickets.

Use these instead, or generate an equivalent spread for your own case. What
matters is that the inputs bracket the variable, not that these particular
images are used.

## The four

| id | file | role |
| --- | --- | --- |
| `dark` | `backdrop-dark.png` | dark, low local contrast — the common case |
| `busy` | `backdrop-busy.png` | high local detail, very dark at centre |
| `mid` | `backdrop-mid.png` | genuine photograph, mid luminance |
| `bright` | `backdrop-bright.png` | high luminance — the end no stock fixture reaches |

`dark` is 384×384; the rest are 512×512. All 8-bit non-interlaced PNG (`busy`
carries alpha), which `scripts/luminance.mjs` reads.

## Measured

```bash
node scripts/luminance.mjs stats fixtures/*.png --step 4
```

| id | meanL @8px | sdL @8px | meanL @4px | sdL @4px |
| --- | --- | --- | --- | --- |
| `dark` | 43.2 | 11.8 | 43.3 | 11.8 |
| `busy` | 67.9 | 52.5 | 68.3 | 52.8 |
| `mid` | 115.5 | 52.5 | 115.6 | 52.6 |
| `bright` | 189.1 | 71.4 | 188.4 | 71.9 |

These values are the point of the files. **Do not regenerate or "improve" them**
— stable statistics are what let a measurement taken today be compared with one
taken a year ago. If you need different images, add them; do not replace these.

## Whole-image mean is not the number the formula uses

The blend depends on the backdrop *under the element*, which is a local sample.
On a photograph the two diverge hard — measured at the sample point in one run:

| id | whole-image meanL | at the element's centre |
| --- | --- | --- |
| `dark` | 43.2 | 38.6 |
| `busy` | 68.3 | **9.4** |
| `mid` | 115.6 | **159.8** |
| `bright` | 188.4 | 244.1 |

`busy` has the highest whole-image detail of the four and the lowest value where
it actually mattered — which is why it produced the worst collapse measured
anywhere. Conflating the two columns is a documented cause of a wrong
conclusion. **Always sample a bare reference cell of the backdrop alongside the
element and report it.**

A related caution: a "detail"/local-contrast figure was quoted in the original
write-up, but its definition appears neither in that write-up nor in any of the
recovered measurement harnesses, so it is not reproducible. Only mean/sd/min/max
are. Do not cite that figure as if it could be recomputed.

## Provenance

`dark` is a procedurally generated cover from a mock server. `bright` is a
generated poster-style image. `busy` and `mid` are Apple-shipped macOS
wallpapers, kept purely as local test input — **do not ship them in a product
bundle.** For the same reason those two are git-ignored: the repo carries
`dark` and `bright` only, and `busy` and `mid` exist on the machine that
made them.

## These are instruments, not product data

Some projects also want richer *dev* fixtures — better-looking placeholder
imagery for building screens against. That is a different purpose with different
pressures: dev data gets regenerated for aesthetic reasons. Keep the two sets
separate. Measurement instruments must be stable, or every historical number
they produced becomes uncomparable. Copying one of these as a starting point for
a dev fixture is fine; merging the sets is not.
