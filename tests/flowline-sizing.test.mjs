// Verification against the source workbook "_Flowline Sizing.xlsx" and the other Spool calculators.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, validate, checks, phaseOf, DEFAULTS } from "../js/calcs/flowline-sizing/calc.js";
import * as liquid from "../js/calcs/liquid-line-sizing/calc.js";
import * as twoPhase from "../js/calcs/two-phase-line-sizing/calc.js";
import { designPressure, GRADES } from "../js/lib/csa-z662.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);

test("workbook Case #1 — gas only, 168.3 × 5.537 mm, 4 MMscfd, 100 ft", () => {
  // The workbook enters barometric pressure as "14.696 kPaa" (a psia value in a kPa cell);
  // reproduce it here to match P1 = 110.910 psia. Its standard-flow basis is 0.983378 × nominal.
  const s = { ...DEFAULTS, qg: 113.2674 * 0.98337773, qo: 0, qw: 0, p: 750, patm: 14.696, t: 25,
    sg: 21.675 / 28.964, z: 0.95, mug: 0.01, od: 168.3, wt: 5.537, mat: "cs", len: 100 / 3280.84, dh: 0, cErosion: 100 };
  const r = compute(s);
  assert.equal(r.phase, "G");
  near(r.P1, 110.91016448063164, 1e-5, "P1 psia");
  near(r.dIn, 6.19, 0.001, "ID in");
  near(r.rho1, 0.4394402260979014, 0.001, "gas density lb/ft³");
  near(r.V1, 28.314275170366887, 0.002, "velocity ft/s");
  near(r.Re, 955133.96241787868, 0.003, "Reynolds");
  near(r.f, 0.015703165775241942, 0.01, "Darcy friction factor (workbook: Churchill; Spool: Colebrook)");
  near(r.dpPer100, 0.11582600558740808, 0.01, "isothermal ΔP psi/100 ft");
  near(r.P2, 110.79433847504423, 3e-5, "P2 psia");
  near(r.Ve1, 150.85166058104335, 0.002, "erosional ft/s (C = 100)");
  near(r.Mach, 0.022815920193507616, 0.03, "Mach");
});

test("phase is set by the rates", () => {
  assert.equal(phaseOf({ qg: 1, qo: 0, qw: 0 }), "G");
  assert.equal(phaseOf({ qg: 0, qo: 1, qw: 0 }), "L");
  assert.equal(phaseOf({ qg: 1, qo: 0, qw: 1 }), "2");
});

test("liquid only matches Liquid Line Sizing (NPS 4 Sch 40, no fittings)", () => {
  const fl = compute({ ...DEFAULTS, qg: 0, qo: 0, qw: 450, rhow: 1155, muw: 1, od: 114.3, wt: 6.02, len: 0.1, dh: 0 });
  const NO = { ell90: 0, ell90lr: 0, mitre: 0, teeRun: 0, teeBr: 0, gate: 0, globe: 0, check: 0, bfly: 0, entry: 0, exit: 0 };
  const lq = liquid.compute({ ...liquid.DEFAULTS, ...NO, q: 450, rho: 1155, mu: 1, nps: 4, sch: "40", len: 100, dh: 0 });
  near(fl.V1, lq.V, 0.002, "velocity");
  near(fl.dpLine, lq.dpTotal, 0.003, "line ΔP");
});

test("two-phase, short horizontal line matches 2-Phase Line Sizing", () => {
  const s = { ...DEFAULTS, qg: 6, qo: 55, qw: 495, rhoo: 850, rhow: 1130, muo: 1.41, muw: 1.41, sig: 75, p: 689, t: 20,
    sg: 0.897, z: 0.98, od: 88.9, wt: 5.49, len: 0.03, dh: 0 };
  const fl = compute(s);
  const tp = twoPhase.compute({ ...twoPhase.DEFAULTS, len: 30, dh: 0 });
  assert.equal(fl.pat, tp.pat);
  near(fl.V1, tp.Vm, 0.005, "mixture velocity");
  near(fl.dpLine, tp.dpLine, 0.02, "line ΔP");
});

test("long gas line: velocity rises toward the outlet as gas expands", () => {
  const r = compute({ ...DEFAULTS, qo: 0, qw: 0, qg: 50, p: 1500, len: 10, dh: 0 });
  assert.ok(!r.fx.stall);
  assert.ok(r.V2 > r.V1 * 1.05, `V1 ${r.V1}, V2 ${r.V2}`);
  for (let i = 1; i < r.prof.length; i++) assert.ok(r.prof[i].P < r.prof[i - 1].P);
});

test("CSA Z662 design pressure: 114.3 × 6.02 mm Gr 359", () => {
  near(designPressure({ smys: 359, odMm: 114.3, tMm: 6.02, service: "gas", cls: 1, tC: 20 }), 30.251, 0.001, "class 1 gas MPa");
  near(designPressure({ smys: 359, odMm: 114.3, tMm: 6.02, service: "sour", cls: 2, tC: 20 }), 30.251 * 0.75, 0.001, "class 2 sour MPa");
  assert.equal(GRADES["359"].smts, 455);
});

test("non-metallic pipe uses the manufacturer's rating", () => {
  const r = compute({ ...DEFAULTS, mat: "spool", rating: 10340 });
  const c = checks({ ...DEFAULTS, mat: "spool", rating: 10340 }, r).find((x) => x.id === "rating");
  assert.equal(c.sev, "ok");
  const unrated = checks({ ...DEFAULTS, mat: "hdpe", rating: 0 }, compute({ ...DEFAULTS, mat: "hdpe", rating: 0 })).find((x) => x.id === "rating");
  assert.equal(unrated.sev, "na");
});

test("default case passes every check", () => {
  const r = compute(DEFAULTS);
  assert.deepEqual(checks(DEFAULTS, r).filter((c) => c.sev !== "ok" && c.sev !== "na").map((c) => c.id), []);
});

test("validation", () => {
  assert.deepEqual(validate(DEFAULTS), {});
  const e = validate({ ...DEFAULTS, qg: 0, qo: 0, qw: 0, wt: 60, locClass: 5 });
  assert.deepEqual(Object.keys(e).sort(), ["locClass", "qg", "wt"]);
});

test("failure modes trigger", () => {
  assert.ok(compute({ ...DEFAULTS, p: 80000 }).fx.rupture);
  assert.ok(compute({ ...DEFAULTS, qg: 500, qo: 0, qw: 0, p: 300, len: 5 }).fx.stall);
});
