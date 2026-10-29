// Verification against the source workbook "Gas Line Sizing.xls" (sheet "BP Calc")
// and published references. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { hydraulics, compute, validate, checks, DEFAULTS, hydrateTempF, frictionFactor } from "../js/calcs/gas-line-sizing/calc.js";
import { mawp, flangeRating } from "../js/lib/pipe.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);

const PATM_KPA = 29.6 * 3.386389;             // 29.6 inHg, as in the workbook
const psigToKpa = (psia) => psia * 6.894757 - PATM_KPA;

test("workbook column 'VRU Suction', case 1 (3.068 in)", () => {
  const s = { ...DEFAULTS, q: 6.89485847976, mw: 26.06823, t: 20, patm: PATM_KPA, p: 0.1875 * 6.894757, z: 0.99, mu: 0.01, k: 1.25, len: 75 };
  const h = hydraulics(s, 3.068);
  near(h.W, 696.8975510988, 0.001, "mass flow lb/h");
  near(h.rho, 0.06844694832, 0.002, "density lb/ft3");
  near(h.V, 55.09018715, 0.002, "velocity ft/s");
  near(h.Re, 143451.594, 0.003, "Reynolds");
  near(h.f, 0.02009986, 0.002, "friction factor");
  near(h.dp100, 0.17610561, 0.005, "dP/100 ft psi");
  near(h.Ve, 382.2284, 0.002, "erosional ft/s");
  near(h.c, 1122.0729, 0.002, "sonic ft/s");
});

test("workbook column 'Gas Bypass to Flare - 403' (1.939 in, 166.6 psia)", () => {
  const s = { ...DEFAULTS, q: 40, mw: 23, t: 10, patm: PATM_KPA, p: psigToKpa(166.6), z: 0.99, mu: 0.01, k: 1.25 };
  const h = hydraulics(s, 1.939);
  near(h.W, 3567.13762, 0.001, "mass flow lb/h");
  near(h.rho, 0.70729036, 0.002, "density lb/ft3");
  near(h.V, 68.31823164, 0.002, "velocity ft/s");
  near(h.Re, 1161806.63, 0.003, "Reynolds");
  near(h.f, 0.02028534, 0.002, "friction factor");
  near(h.dp100, 4.46897893, 0.005, "dP/100 ft psi");
  near(h.Ve, 118.905277, 0.002, "erosional ft/s");
  near(h.c, 1174.03499, 0.002, "sonic ft/s");
});

test("workbook column 'Flare Header - 400' (4.026 in)", () => {
  const s = { ...DEFAULTS, q: 95.3, mw: 23, t: 10, patm: PATM_KPA, p: psigToKpa(166.6) };
  const h = hydraulics(s, 4.026);
  near(h.V, 37.75527195, 0.002, "velocity ft/s");
  near(h.f, 0.01722646, 0.002, "friction factor");
  near(h.dp100, 0.55822362, 0.005, "dP/100 ft psi");
});

test("laminar friction factor below Re 2000", () => {
  assert.equal(frictionFactor(1000, 2), 0.064);
});

test("B31.3 MAWP: NPS 4 Sch 40 A106 B, no CA ≈ 1,914 psig", () => {
  const { P } = mawp({ od: 4.5, tn: 0.237, ca: 0, S: 20000 });
  near(P, 1914, 0.002, "MAWP psig");
});

test("B16.5 Group 1.1 ratings", () => {
  assert.equal(flangeRating("150", 50), 285);
  assert.equal(flangeRating("300", 200), 680);
  near(flangeRating("600", 250), 1335, 1e-9, "Class 600 at 250 °F");
});

test("hydrate temperature vs Katz chart (0.7 SG, 1000 psia ≈ 62 °F)", () => {
  const t = hydrateTempF(1000, 0.7);
  assert.ok(Math.abs(t - 62) < 3, `got ${t}`);
});

test("default case passes every check", () => {
  const r = compute(DEFAULTS);
  assert.deepEqual(checks(DEFAULTS, r).filter((c) => c.sev !== "ok" && c.sev !== "na"), []);
});

test("validation rejects bad inputs", () => {
  const e = validate({ ...DEFAULTS, q: 0, z: -1, k: 1, t: -300, p: -200, ca: -1 });
  assert.deepEqual(Object.keys(e).sort(), ["ca", "k", "p", "q", "t", "z"]);
  assert.deepEqual(validate(DEFAULTS), {});
});

test("failure modes trigger", () => {
  const rupt = compute({ ...DEFAULTS, p: 45000, t: 40 });
  assert.ok(rupt.fx.rupture && rupt.fx.leak && rupt.fx.overstress);
  const choke = compute({ ...DEFAULTS, q: 30, nps: 1, sch: "80" });
  assert.ok(choke.fx.choke && choke.fx.stall);
  const caAll = compute({ ...DEFAULTS, ca: 10 });
  assert.equal(caAll.mawpPsig, 0);
});
