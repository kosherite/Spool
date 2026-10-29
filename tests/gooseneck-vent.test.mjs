// Verification against the source workbook "Gooseneck Flow Calculations.xlsx" (sheet "Vent Flow Calc").
// Run: node --test
//
// The workbook's Darcy section reads f = 0.2 from the Moody chart; for Re 75,118 in 3" Sch 40 steel
// f ≈ 0.022, so its 0.054 psi is about 10× high. The Darcy test reproduces its arithmetic with 0.2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spitzglass, airToGas, compute, validate, checks, DEFAULTS } from "../js/calcs/gooseneck-vent/calc.js";
import { colebrook } from "../js/lib/hydraulics.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);

test("workbook Spitzglass (GPSA 17-28): 3.068 in, 9 ft, 0.5 psig, SG 0.7239 → 1.3605 MMscfd", () => {
  const scfh = spitzglass({ hw: 0.5 * 27.707, sg: 0.7239, L: 9, d: 3.068 });
  near(scfh * 24, 1360464.966926662, 0.002, "SCFD");
});

test("workbook air-to-gas conversion: 10,337 scfm air → 12,149 scfm gas", () => {
  near(airToGas(10337, 0.7239), 12149.411111563564, 1e-9, "scfm gas");
});

test("workbook Darcy arithmetic with its f = 0.2, and with Colebrook", () => {
  const dp = (f) => (f * 9 * 0.0542925 * 36.288258038808983 ** 2) / (2 * 32.2 * 0.25566666666666665) / 144;
  near(dp(0.2), 0.054277785272514888, 1e-6, "ΔP psi with f = 0.2");
  const f = colebrook(75117.725056756128, 3.068);
  assert.ok(f > 0.019 && f < 0.025, `Colebrook f = ${f}`);
  assert.ok(dp(f) < 0.15 * dp(0.2), "correct f gives roughly a ninth of the workbook ΔP");
});

test("capacity solves to the design pressure", () => {
  const r = compute(DEFAULTS);
  near(r.dpAt(r.qCap).dp, r.pdPsi, 1e-6, "ΔP at capacity = design");
  assert.ok(r.dpAt(r.qCap * 0.5).dp < r.pdPsi && r.dpAt(r.qCap * 1.5).dp > r.pdPsi);
});

test("Spitzglass cross-check within 20% of Darcy capacity", () => {
  const r = compute(DEFAULTS);
  near(r.qSpitz, r.qCap, 0.2, "Spitzglass vs Darcy");
});

test("workbook relief rate overpressures a 12\" gooseneck at 8 oz/in²", () => {
  const s = { ...DEFAULTS, qreq: (10337 * 60) / 35.3147, sg: 0.7239 };
  const r = compute(s);
  assert.ok(r.fx.over, `tank P ${r.ptReq} psig vs design ${r.pdPsi}`);
});

test("default case passes every check", () => {
  const r = compute(DEFAULTS);
  assert.deepEqual(checks(DEFAULTS, r).filter((c) => c.sev !== "ok").map((c) => c.id), []);
});

test("validation", () => {
  assert.deepEqual(validate(DEFAULTS), {});
  assert.deepEqual(Object.keys(validate({ ...DEFAULTS, qreq: 0, ells: 1.5, kx: -1 })).sort(), ["ells", "kx", "qreq"]);
});
