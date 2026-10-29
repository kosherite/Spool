// Verification against the source workbook "ASME B31.3 Piping Stress Calculations - Preferred.xlsx".
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, mawpKpa, allowable, yCoeff, normalize, validate, checks, flangeKpa, DEFAULTS } from "../js/calcs/b313-pipe-stress/calc.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);
const S20 = 137895.15;   // 20 ksi in kPa, as the workbook

test("workbook wall-thickness sheet: 10\" XS-80 A333 Gr 6, 9930 kPag, c = 3.2 mm", () => {
  const r = compute(DEFAULTS);
  near(r.S, S20, 1e-6, "S");
  near(r.t, 9.5560758780309616, 1e-6, "t");
  near(r.tc, 12.756075878030963, 1e-6, "t + c");
  near(r.tm, 13.201649999999999, 1e-9, "t_m");
  assert.ok(r.tc <= r.tm && !r.thick, "OK FOR USE");
});

test("workbook MAWP table", () => {
  const rows = [
    [60.325, 3.9116, 1.5, 9019.8352916458662],
    [88.9, 7.62, 0, 22004.544542553194],
    [114.3, 17.1196, 3.175, 31048.281994246419],
    [168.275, 7.112, 1.5, 7918.4452365915877],
    [219.075, 8.1788, 1.5, 7271.0087633673847],
    [323.85, 10.3124, 1.5, 6528.2007534325121],
    [273.05, 15.0876, 3.6455718894707578, 9929.9999796667489],
  ];
  for (const [D, tn, c, want] of rows) near(mawpKpa({ D, tn, c, mt: 12.5, S: S20, E: 1, W: 1, Y: 0.4 }), want, 2e-6, `MAWP D ${D}`);
});

test("Table A-1 allowable stress and Table 304.1.1 Y", () => {
  assert.equal(allowable("A106B", 20), 20.0);
  assert.equal(allowable("A106B", (600 - 32) * 5 / 9), 17.3);
  near(allowable("TP316", (400 - 32) * 5 / 9), 14.3, 1e-9, "316 at 400 °F");
  assert.equal(yCoeff("ferritic", 400), 0.4);
  assert.equal(yCoeff("ferritic", 538), 0.7);
  assert.equal(yCoeff("austenitic", 593), 0.5);
});

test("B16.5 Group 1.1 at ambient matches the workbook table", () => {
  for (const [cls, kpa] of [["150", 1965], ["300", 5102], ["600", 10204], ["900", 15306], ["1500", 25545], ["2500", 42550]]) near(flangeKpa(cls, 20), kpa, 0.001, `Class ${cls}`);
});

test("hydrotest: 1.5 × P at ambient design temperature", () => {
  const r = compute({ ...DEFAULTS, t: 20 });
  near(r.pTest, 1.5 * 9930, 1e-9, "P_T");
});

test("schedule follows the size", () => {
  assert.equal(normalize({ ...DEFAULTS, nps: 4, sch: "80" }).sch, "80/XS");
  assert.equal(normalize({ ...DEFAULTS, nps: 12, sch: "80/XS" }).sch, "80");
});

test("default case passes every check", () => {
  const r = compute(DEFAULTS);
  assert.deepEqual(checks(DEFAULTS, r).filter((c) => c.sev !== "ok").map((c) => c.id), []);
});

test("validation and failure modes", () => {
  assert.deepEqual(validate(DEFAULTS), {});
  assert.ok(validate({ ...DEFAULTS, t: 500 }).t);
  assert.ok(compute({ ...DEFAULTS, sch: "40/STD", p: 15000 }).fx.thin);
  assert.ok(compute({ ...DEFAULTS, mat: "A106B" }).fx.cold);
});
