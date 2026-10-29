// Gooseneck Vent — pure calculation, no DOM.
// Atmospheric-tank gooseneck: back-pressure at the required relief rate and the vent's capacity
// at the tank design pressure, by Darcy–Weisbach with Hooper 2-K fittings (incompressible,
// density at mean pressure). GPSA Eq. 17-28 (Spitzglass, < 1 psig) as a cross-check.
import { pipeID, NPS } from "../../lib/pipe.js";
import { colebrook, reynolds, FITTINGS, fittingK } from "../../lib/hydraulics.js";

const KPA_PER_PSI = 6.894757, G_C = 32.174, R_GAS = 10.7316, R_U = 1545.35;
const INH2O_PER_PSI = 27.707;
const ELL = FITTINGS.find((f) => f.id === "ell90"), ENTRY = FITTINGS.find((f) => f.id === "entry");
export const API12F_MAX_PSIG = 1.0;   // 16 oz/in²

export const DEFAULTS = Object.freeze({
  nps: 12, sch: "40", len: 3, ells: 2, kx: 0,
  sg: 0.72, t: 5, mu: 0.01, k: 1.3,
  pd: 3.45, patm: 94.4, qreq: 10000,
});

export function validate(s) {
  const e = {};
  const pos = (k) => { if (!(Number.isFinite(s[k]) && s[k] > 0)) e[k] = "> 0"; };
  ["len", "mu", "patm", "pd", "qreq"].forEach(pos);
  if (!(Number.isInteger(s.ells) && s.ells >= 0 && s.ells <= 10)) e.ells = "0 – 10";
  if (!(Number.isFinite(s.kx) && s.kx >= 0)) e.kx = "≥ 0";
  if (!(s.sg >= 0.3 && s.sg <= 3)) e.sg = "0.3 – 3";
  if (!(s.k > 1 && s.k < 2)) e.k = "1 – 2";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  return e;
}

/** Spitzglass, low pressure (GPSA Eq. 17-28): Q scfh, h_w in H₂O, L ft, d in. */
export function spitzglass({ hw, sg, L, d }) {
  const K = Math.sqrt(d ** 5 / (1 + 3.6 / d + 0.03 * d));
  return 3550 * K * Math.sqrt(hw / (sg * L));
}

/** Gas equivalent of an air vent rate (equal pressure drop): Q_gas = Q_air / √SG. */
export const airToGas = (qAir, sg) => qAir / Math.sqrt(sg);

function model(s) {
  const dIn = pipeID(s.nps, s.sch), D = dIn / 12, A = (Math.PI / 4) * D * D;
  const T = s.t * 9 / 5 + 32 + 459.67, MW = 28.964 * s.sg, Patm = s.patm / KPA_PER_PSI;
  const Lft = s.len * 3.28084;
  /** Tank back-pressure (psig) for a standard gas rate (scfh). */
  const dpAt = (scfh) => {
    if (scfh <= 0) return { dp: 0, V: 0, Re: 0, f: NaN, K: 0, rho: (Patm * MW) / (R_GAS * T) };
    const W = (scfh * MW) / 379.5;                    // lb/h
    let dp = 0, out;
    for (let i = 0; i < 4; i++) {                      // density at mean pressure
      const rho = ((Patm + dp / 2) * MW) / (R_GAS * T);
      const V = W / 3600 / rho / A;
      const Re = reynolds(dIn, V, rho, s.mu), f = colebrook(Re, dIn);
      const K = (f * Lft) / D + fittingK(ENTRY, Re, dIn) + s.ells * fittingK(ELL, Re, dIn) + 1.0 + s.kx;
      dp = (K * rho * V * V) / (2 * G_C) / 144;
      out = { dp, V, Re, f, K, rho, Vexit: W / 3600 / ((Patm * MW) / (R_GAS * T)) / A };
    }
    return out;
  };
  return { dIn, D, A, T, MW, Patm, Lft, dpAt };
}

export function compute(s) {
  const m = model(s);
  const pdPsi = s.pd / KPA_PER_PSI;
  const qAir = (s.qreq * 35.3147);                        // Sm³/h air → scfh air
  const qReq = airToGas(qAir, s.sg);                      // scfh gas
  const req = m.dpAt(qReq);

  // capacity at design pressure (monotonic in Q → bisection)
  let lo = 0, hi = 1e9;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; (m.dpAt(mid).dp < pdPsi ? (lo = mid) : (hi = mid)); }
  const qCap = lo;
  const cap = m.dpAt(qCap);

  // Spitzglass cross-check over the equivalent length at the same design pressure
  const Leq = m.Lft + ((cap.K - (cap.f * m.Lft) / m.D) * m.D) / cap.f;
  const qSpitz = spitzglass({ hw: pdPsi * INH2O_PER_PSI, sg: s.sg, L: Leq, d: m.dIn });

  const c = Math.sqrt((s.k * G_C * R_U * m.T) / m.MW);
  return {
    ...m, pdPsi, qAir, qReq, qCap, qSpitz, Leq,
    ptReq: req.dp, Vreq: req.V, VexitReq: req.Vexit, Re: req.Re, f: req.f, K: req.K, rho: req.rho,
    util: qReq / qCap, Ma: req.Vexit / c, c,
    fx: {
      over: req.dp > pdPsi,
      seam: req.dp > 2 * pdPsi,          // drawing only: illustrative, not a code limit
      choke: req.Vexit >= c,
    },
  };
}

/** Back-pressure curve for the chart: tank pressure against vent rate. */
export function curve(s, r) {
  const qMax = Math.max(r.qReq, r.qCap) * 1.35;
  const out = [];
  for (let i = 0; i <= 40; i++) { const qq = (qMax * i) / 40; out.push({ q: qq, p: r.dpAt(qq).dp }); }
  return out;
}

export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, extra = {}) => out.push({ id, label, value, limit, kind, sev, ...extra });
  add("cap", "Capacity ≥ required", r.qCap, r.qReq, "scfh", r.qCap >= r.qReq ? (r.util > 0.9 ? "warn" : "ok") : "bad");
  add("pt", "Tank P at required ≤ design", r.ptReq, r.pdPsi, "psiTank", r.fx.over ? "bad" : "ok");
  add("mach", "Mach · outlet", r.Ma, r.Ma >= 1 ? 1 : 0.3, "none", r.Ma >= 1 ? "bad" : r.Ma > 0.3 ? "warn" : "ok");
  add("design", "Design ≤ API 12F max", r.pdPsi, API12F_MAX_PSIG, "psiTank", r.pdPsi > API12F_MAX_PSIG ? "warn" : "ok");
  return out;
}

export function status(r, list) {
  if (r.fx.seam) return ["bad", "Overpressure · roof seam at risk"];
  if (r.fx.over) return ["bad", "Tank overpressured"];
  const bad = list.filter((c) => c.sev === "bad"), warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "All checks pass"];
}

export { NPS };
