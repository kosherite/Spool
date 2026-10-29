// Verification against the source workbook "Reducer + Expansion Calc.xls" and Hooper (1988).
// Run: node --test
//
// The workbook evaluates Hooper's 2-K equations with f = 0.0018 (the roughness, in) instead of the
// Darcy friction factor, uses g = 32.4 ft/s², and applies the large-pipe velocity to the expansion.
// The K tests below reproduce its numbers with f = 0.0018 to confirm the equations; Spool uses the
// upstream Darcy friction factor, g_c = 32.174 and the upstream velocity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kHooperReducer, contractionCc, colebrook } from "../js/lib/hydraulics.js";
import { compute, validate, checks, DEFAULTS } from "../js/calcs/reducer-expansion/calc.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tol,
    `${label}: got ${actual}, expected ${expected} (±${tol * 100}%)`);

test("workbook 'Expansion' K (2\" → 3\", Re 90,733) with its f = 0.0018", () => {
  assert.equal(kHooperReducer({ type: "exp", Re: 90733.0381110776, f: 0.0018, d1: 2.067, d2: 3.068 }), 0.2986431542455385);
});

test("workbook 'Reducer' K (3\" → 2\", Re 90,733) with its f = 0.0018", () => {
  assert.equal(kHooperReducer({ type: "con", Re: 90733.0381110776, f: 0.0018, d1: 3.068, d2: 2.067 }), 1.5925736068745588);
});

test("workbook 'Reducer' ΔP with the friction factor corrected", () => {
  // V = 12.4543 ft/s in 3.068 in, ρ = 0.1915 lb/ft³
  const f = colebrook(90733.0381110776, 3.068);
  const K = kHooperReducer({ type: "con", Re: 90733.0381110776, f, d1: 3.068, d2: 2.067 });
  const dp = (K * 0.1915 * 12.454308806231396 ** 2) / (2 * 32.174) / 144;
  near(K, 1.5925736068745588, 0.02, "K within 2% of workbook");
  near(dp, 0.005069557510806411, 0.04, "ΔP psi within 4% (K and g corrected)");
});

test("Hooper limits: square expansion → Borda–Carnot, β → 1 → zero loss", () => {
  near(kHooperReducer({ type: "exp", Re: 1e6, f: 0, d1: 2, d2: 4 }), (1 - 0.25) ** 2, 1e-12, "Borda–Carnot");
  assert.ok(kHooperReducer({ type: "con", Re: 1e6, f: 0.02, d1: 4, d2: 3.999 }) < 1e-3);
});

test("taper reduces loss; 15° expander far below sudden", () => {
  const base = { type: "exp", Re: 1e5, f: 0.02, d1: 2.067, d2: 4.026 };
  const sudden = kHooperReducer({ ...base, theta: 180 }), taper = kHooperReducer({ ...base, theta: 15 });
  assert.ok(taper < 0.4 * sudden, `${taper} vs ${sudden}`);
});

test("Weisbach contraction coefficient: 0.62 → 1.0", () => {
  near(contractionCc(0), 0.62, 1e-12, "Cc(0)");
  near(contractionCc(1), 1.0, 1e-12, "Cc(1)");
});

test("expansion recovers static pressure; contraction loses it", () => {
  const exp = compute({ ...DEFAULTS, phase: "liquid", type: "exp" });
  const con = compute({ ...DEFAULTS, phase: "liquid", type: "con" });
  assert.ok(exp.dpStatic < 0, "static pressure rises across an expansion");
  assert.ok(con.dpStatic > con.dpLoss, "contraction drop exceeds the irrecoverable loss");
  near(exp.dpLoss + (exp.rho * (exp.V2 ** 2 - exp.V1 ** 2)) / (2 * 32.174 * 144), exp.dpStatic, 1e-9, "energy balance");
});

test("default case passes every check", () => {
  const r = compute(DEFAULTS);
  assert.deepEqual(checks(DEFAULTS, r).filter((c) => c.sev !== "ok").map((c) => c.id), []);
});

test("validation", () => {
  assert.deepEqual(validate(DEFAULTS), {});
  assert.deepEqual(Object.keys(validate({ ...DEFAULTS, npsS: 4, theta: 0 })).sort(), ["npsS", "theta"]);
});

test("cavitation at the vena contracta", () => {
  const r = compute({ ...DEFAULTS, phase: "liquid", type: "con", ql: 1500, npsL: 3, npsS: 1.5, p: 30, pv: 90 });
  assert.ok(r.fx.cavitate, `Pvc ${r.Pvc} vs Pv ${r.pvPsia}`);
});
