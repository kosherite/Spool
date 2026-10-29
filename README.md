# Spool

Oil and gas facilities engineering calculators, each with a live diagram of the system it sizes.

## Calculators

| Code   | Calculator      | Standards                                   |
|--------|-----------------|---------------------------------------------|
| PIP-01 | Gas Line Sizing | Crane TP-410, API RP 14E, ASME B31.3, B16.5 |
| PIP-02 | Liquid Line Sizing | Crane TP-410, Colebrook, Hooper 2-K, API RP 14E, ASME B31.3, B16.5 |
| PIP-03 | 2-Phase Line Sizing | Beggs & Brill (1973), API RP 14E, ASME B31.3, B16.5 |
| PIP-04 | Flowline Sizing | Isothermal gas, Darcy, Beggs & Brill (marched), CSA Z662, API RP 14E |
| PIP-05 | Reducer and Expansion | Hooper (1988) 2-K, Weisbach vena contracta, API RP 14E |
| PIP-06 | Gooseneck Flow | Darcy–Weisbach with Hooper 2-K, GPSA Eq. 17-28 (Spitzglass), API 12F |
| PIP-07 | B31.3 Pipe Stress | ASME B31.3 304.1.2, Table A-1, 345.4.2, B16.5, B36.10M |

## Run

Static site, no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

Works as-is on GitHub Pages.

## Test

```sh
npm test   # Node 18+, no dependencies
```

Each calculator is checked against the worked values in its source workbook.

## Structure

```
index.html                 app shell markup
css/spool.css              theme tokens and layout
js/app.js                  search, panel, settings, canvas loop
js/lib/                    shared units, formatting, pipe data
js/calcs/registry.js       catalogue and live calculators
js/calcs/<calc>/calc.js    pure calculation (no DOM)
js/calcs/<calc>/view.js    inputs, results, equations
js/calcs/<calc>/scene.js   canvas diagram
tests/                     node:test verification
```

Equations are typeset with [KaTeX](https://katex.org) (MathML output, loaded from cdnjs).

## Adding a calculator

1. Create `js/calcs/<id>/` with `calc.js`, `view.js` and `scene.js`, following `gas-line-sizing`.
2. Register the view in `LIVE` in `js/calcs/registry.js`.
3. Add `tests/<id>.test.mjs` with values from the source workbook.
