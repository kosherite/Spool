// Verification against the source workbook "2-Phase Line Sizing.xlsx" (sheet "2-Phase WCAP Typicals")
// and Beggs & Brill limiting cases. Run: node --test
//
// The workbook reports Dukler and Oliemans. Its Dukler holdup iteration is unstable (base case
// returns HL < λ and a mixture density above the liquid density), so Beggs & Brill results are
// compared with the workbook's Oliemans pressure gradient and holdup instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowIn, phases, compute, validate, checks, DEFAULTS } from "../js/calcs/two-phase-line-sizing/calc.js";
import { beggsBrill } from "../js/lib/multiphase.js";
import { colebrook, dp100 } from "../js/lib/hydraulics.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);

const PATM = 100.2;
const fromPsia = (psia) => psia * 6.894757 - PATM;
const e3m3d = (mmscfd) => (mmscfd * 1e6) / 35.3147 / 1000;
const m3d = (bbld) => bbld / 6.289811;
const liq = (bbld, lbft3) => ({ qo: 0, qw: m3d(bbld), rhow: lbft3 * 16.01846 });

const CASES = [
  { name: "Base Case (3.000 in)", dIn: 3.0,
    s: { ...DEFAULTS, qg: e3m3d(0.12154678459906551), ...liq(4402.86, 68.905328214252293), p: fromPsia(213.1), patm: PATM,
      t: 5, sg: 25.93197 / 28.964, z: 0.98, mul: 1, mug: 0.01, sig: 79.64265, eps: 0.0004 * 25.4 },
    want: { VSL: 5.8290931516207154, VSG: 1.865700682484104, lam: 0.75753727485004774, muN: 0.75996190210154724,
      rhoN: 52.452853848183373, ReN: 197568.28471961597, Ve: 13.807512303832995 },
    regime: "dist", olDp: 3.2036775015926549, olHL: 0.81392422026427402 },
  { name: "STAR1000 NPS3 (3.000 in)", dIn: 3.0,
    s: { ...DEFAULTS, qg: e3m3d(0.19042410858124661), ...liq(3503.7552869796909, 68.905328214252293), p: fromPsia(114.5), patm: PATM,
      t: 20, sg: 25.93197 / 28.964, z: 0.98, mul: 1.4136, mug: 0.01, sig: 75, eps: 0.00021 * 25.4 },
    want: { VSL: 4.6387384446219508, VSG: 5.7333601619433843, lam: 0.44723238956537881, rhoN: 31.112492693325521,
      ReN: 188236.51416365686, Ve: 17.928031070435587 },
    regime: "int", olDp: 3.3722269480513578, olHL: 0.49625089176353843 },
  { name: "STAR1000 NPS4 (3.910 in)", dIn: 3.91,
    s: { ...DEFAULTS, qg: e3m3d(0.38681451775015158), ...liq(7117.2889911118446, 68.905328214252293), p: fromPsia(114.5), patm: PATM,
      t: 20, sg: 25.93197 / 28.964, z: 0.98, mul: 1.4136, mug: 0.01, sig: 75, eps: 0.00021 * 25.4 },
    want: { VSL: 5.5471475044594722, VSG: 6.8561301513699728, lam: 0.4472323895653787, rhoN: 31.112492693325507,
      ReN: 293379.12121462979, Ve: 17.928031070435591 },
    regime: "int", olDp: 3.1970207775510597, olHL: 0.47689865373684437 },
];

for (const c of CASES) {
  test(`workbook '${c.name}': superficial velocities, no-slip properties, erosional`, () => {
    const f = flowIn(c.s, phases(c.s), c.dIn);
    for (const [k, v] of Object.entries(c.want)) near(f[k], v, 0.005, k);
  });
  test(`workbook '${c.name}': regime and pressure gradient vs Oliemans`, () => {
    const f = flowIn(c.s, phases(c.s), c.dIn);
    assert.equal(f.pat, c.regime, "flow regime (workbook: SLUG / NON SLUG)");
    near(f.dp, c.olDp, 0.10, "ΔP/100 ft vs Oliemans");
    near(f.HL, c.olHL, 0.12, "holdup vs Oliemans");
  });
}

test("all-liquid limit equals single-phase Darcy", () => {
  const p = { VSL: 6, VSG: 0, rhoL: 62.4, rhoG: 0.1, muL: 1, muG: 0.01, sigma: 72, dIn: 4.026, epsIn: 0.0018 };
  const bb = beggsBrill(p);
  const A = Math.PI / 4 * (4.026 / 12) ** 2, W = 6 * A * 3600 * 62.4;
  const Re = (123.9 * 4.026 * 6 * 62.4) / 1;
  near(bb.dp, dp100(colebrook(Re, 4.026), W, 4.026, 62.4), 0.005, "ΔP/100 ft");
  assert.equal(bb.HL, 1);
});

test("low-rate horizontal flow is stratified; uphill raises holdup and adds head", () => {
  const p = { VSL: 0.1, VSG: 1, rhoL: 62.4, rhoG: 0.5, muL: 1, muG: 0.01, sigma: 72, dIn: 6.065, epsIn: 0.0018 };
  const flat = beggsBrill(p), up = beggsBrill({ ...p, theta: (5 * Math.PI) / 180 });
  assert.equal(flat.pat, "seg");
  assert.ok(up.HL > flat.HL, `HL up ${up.HL} vs flat ${flat.HL}`);
  assert.ok(up.dpElev > 0 && flat.dpElev === 0);
  assert.ok(flat.HL >= flat.lam);
});

test("validation", () => {
  assert.deepEqual(validate(DEFAULTS), {});
  const e = validate({ ...DEFAULTS, qg: 0, qo: 0, qw: 0, sg: 0.3, dh: 500 });
  assert.deepEqual(Object.keys(e).sort(), ["dh", "qg", "qo", "sg"]);
});

test("default case: only the slug-regime warning", () => {
  const r = compute(DEFAULTS);
  const flagged = checks(DEFAULTS, r).filter((c) => c.sev !== "ok" && c.sev !== "na").map((c) => c.id);
  assert.deepEqual(flagged, ["regime"]);
});

test("failure modes trigger", () => {
  assert.ok(compute({ ...DEFAULTS, p: 45000, t: 40 }).fx.rupture);
  assert.ok(compute({ ...DEFAULTS, qg: 60, nps: 2 }).fx.shake);
  assert.ok(compute({ ...DEFAULTS, t: 2 }).fx.hydrate);
});
