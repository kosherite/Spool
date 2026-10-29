// Verification against the source workbook "Liquid Line Sizing.xls" (sheet "Pump Line Sizing")
// and published references. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, hydraulics, validate, checks, DEFAULTS } from "../js/calcs/liquid-line-sizing/calc.js";
import { colebrook, kExpansion, kContraction, waveSpeed } from "../js/lib/hydraulics.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);

const KG_M3 = (lbft3) => lbft3 * 16.01846;
const M = (ft) => ft / 3.28084;
const NO_FITTINGS = { ell90: 0, ell90lr: 0, mitre: 0, teeRun: 0, teeBr: 0, gate: 0, globe: 0, check: 0, bfly: 0, entry: 0, exit: 0 };

test("workbook 'Charge Pump Suction' — NPS 3 Sch 40, 450 m³/d, 4 elbows", () => {
  const s = { ...DEFAULTS, ...NO_FITTINGS, q: 450, rho: KG_M3(72.10412960014983), mu: 1, nps: 3, sch: "40", len: M(50), ell90: 4 };
  const r = compute(s);
  near(r.W, 47743.52408933421, 1e-4, "mass flow lb/h");
  near(r.V, 3.582727136121918, 1e-4, "velocity ft/s");
  near(r.Ve, 11.776600175276043, 1e-4, "erosional ft/s");
  near(r.Re, 98287.45652253559, 0.002, "Reynolds");
  near(r.f, 0.0207113366709902, 0.001, "Moody friction factor");
  near(r.dp100, 0.8091148023601563, 0.003, "dP/100 ft");
  near(r.leqFt, 16.76974735981319, 0.002, "fittings equivalent length ft");
  near(r.dpTotal, 0.5402439093867283, 0.003, "total ΔP psi");
});

test("workbook '675 Discharge' — NPS 6 Sch 80, 2668 m³/d", () => {
  const s = { ...DEFAULTS, ...NO_FITTINGS, q: 2667.9586900344275, rho: KG_M3(72.10412960014983), mu: 1, nps: 6, sch: "80", len: 100, ell90: 4 };
  const r = compute(s);
  near(r.V, 6.0241431075277925, 1e-4, "velocity ft/s");
  near(r.f, 0.017000688463018002, 0.001, "friction factor");
  near(r.dp100, 0.9999749053493211, 0.003, "dP/100 ft");
  near(r.leqFt, 33.432005723119744, 0.002, "fittings equivalent length ft");
  near(r.dpTotal, 3.6150692310681705, 0.003, "total ΔP psi");
});

test("workbook 'Recycle Pump Suction' — laminar, μ 4.5 cP", () => {
  const s = { ...DEFAULTS, ...NO_FITTINGS, q: 50, rho: KG_M3(51.0222555170584), mu: 4.5, nps: 3, sch: "40", len: M(100), ell90: 4 };
  const r = compute(s);
  near(r.Re, 1717.2858364783997, 0.002, "Reynolds");
  near(r.f, 0.03726811148180398, 0.002, "laminar friction factor");
  near(r.dp100, 0.012719027310683693, 0.003, "dP/100 ft");
  near(r.leqFt, 21.879581748429857, 0.002, "elbow equivalent length ft");
});

test("Hooper 2-K fittings match the workbook equivalent lengths (NPS 3, Re 98,287)", () => {
  const s = { ...DEFAULTS, ...NO_FITTINGS, q: 450, rho: KG_M3(72.10412960014983), mu: 1, nps: 3, sch: "40" };
  const want = { ell90: 4.192436839953298, ell90lr: 3.374044465320066, mitre: 5.8292215892197605, teeRun: 8.202762802604905,
    teeBr: 13.194752960918844, globe: 32.86128869381319, bfly: 4.192436839953298, gate: 1.6744628618116406,
    check: 24.740161801722834, entry: 6.192238074416313, exit: 12.34428616211777 };
  for (const [id, leq] of Object.entries(want)) {
    const r = compute({ ...s, [id]: 1 });
    near(r.leqFt, leq, 0.003, `${id} Leq`);
  }
});

test("reducer K matches workbook (1.049 → 2.067 in)", () => {
  const beta = 1.049 / 2.067;
  near(kExpansion(beta), 0.5512245447977862, 1e-6, "sudden expansion K");
  near(kContraction(beta), 0.37122248881155695, 1e-6, "sudden contraction K");
});

test("Colebrook reference point (Re 1e5, ε/D 1e-4 → f ≈ 0.0185)", () => {
  near(colebrook(1e5, 1, 1e-4), 0.0185, 0.01, "Colebrook");
});

test("wave speed: water in a rigid pipe ≈ 1483 m/s; steel pipe lower", () => {
  near(waveSpeed(2.2e9, 1000, 0.1, 1), 1483, 0.002, "rigid");
  const r = compute(DEFAULTS);
  assert.ok(r.a > 1150 && r.a < 1400, `steel pipe a = ${r.a}`);
});

test("static head: 10 m of 1000 kg/m³ water ≈ 98.1 kPa", () => {
  const base = compute({ ...DEFAULTS, rho: 1000 });
  const up = compute({ ...DEFAULTS, rho: 1000, dh: 10 });
  near((up.dpTotal - base.dpTotal) * 6.894757, 98.07, 0.002, "static kPa");
});

test("default case passes every check", () => {
  const r = compute(DEFAULTS);
  assert.deepEqual(checks(DEFAULTS, r).filter((c) => c.sev !== "ok"), []);
});

test("validation", () => {
  assert.deepEqual(validate(DEFAULTS), {});
  const e = validate({ ...DEFAULTS, q: 0, rho: 50, ell90: 1.5, red: "exp", redNps: 6 });
  assert.deepEqual(Object.keys(e).sort(), ["ell90", "q", "redNps", "rho"]);
});

test("failure modes trigger", () => {
  assert.ok(compute({ ...DEFAULTS, p: 45000 }).fx.rupture);
  assert.ok(compute({ ...DEFAULTS, t: -15 }).fx.freeze);
  assert.ok(compute({ ...DEFAULTS, service: "discharge", q: 4000, p: 6895, dp: 7500, cls: "600", nps: 6 }).fx.surge);
  const fl = compute({ ...DEFAULTS, rho: 850, mu: 4.5, pv: 95, p: 5, len: 60, nps: 3 });
  assert.ok(fl.fx.flash, `P2 ${fl.P2} psia vs Pv ${fl.pvPsia}`);
});
