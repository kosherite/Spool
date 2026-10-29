// Reducer + Expansion — pure calculation, no DOM.
// Hooper (1988) 2-K loss for concentric reducers and expanders, square or tapered,
// referenced to the upstream velocity. Incompressible; gas is checked for Mach and ΔP/P.
import { pipeID, NPS } from "../../lib/pipe.js";
import { colebrook, reynolds, kHooperReducer, contractionCc } from "../../lib/hydraulics.js";

const KPA_PER_PSI = 6.894757, G_C = 32.174, R_GAS = 10.7316, R_U = 1545.35;
export const V_GUIDE = { gas: 60, liquid: 15 };   // ft/s: 18 m/s gas, 4.6 m/s liquid (RP 14E)

export const DEFAULTS = Object.freeze({
  phase: "gas", type: "con", npsL: 3, npsS: 2, sch: "40", theta: 180,
  qg: 10, p: 276, t: 15, patm: 100.2, sg: 0.82, z: 0.98, mug: 0.01, k: 1.27,
  ql: 300, rho: 1000, mul: 1, pv: 2,
});

export function validate(s) {
  const e = {};
  const pos = (k) => { if (!(Number.isFinite(s[k]) && s[k] > 0)) e[k] = "> 0"; };
  if (s.phase === "gas") { ["qg", "mug"].forEach(pos); if (!(s.sg >= 0.55 && s.sg <= 1.8)) e.sg = "0.55 – 1.8"; if (!(s.z > 0 && s.z <= 2)) e.z = "0 – 2"; if (!(s.k > 1 && s.k < 2)) e.k = "1 – 2"; }
  else { ["ql", "mul"].forEach(pos); if (!(s.rho >= 300 && s.rho <= 2500)) e.rho = "300 – 2500"; if (!(Number.isFinite(s.pv) && s.pv >= 0)) e.pv = "≥ 0"; }
  pos("patm");
  if (!Number.isFinite(s.p) || s.p + s.patm <= 0) e.p = "> −Patm";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  if (!(s.theta > 0 && s.theta <= 180)) e.theta = "1 – 180°";
  if (!(s.npsS < s.npsL)) e.npsS = "< large end";
  return e;
}

export function compute(s) {
  const dL = pipeID(s.npsL, s.sch), dS = pipeID(s.npsS, s.sch);
  const [d1, d2] = s.type === "con" ? [dL, dS] : [dS, dL];          // upstream, downstream
  const A = (d) => (Math.PI / 4) * (d / 12) ** 2;
  const P1 = (s.p + s.patm) / KPA_PER_PSI;
  const T = s.t * 9 / 5 + 32 + 459.67;
  let rho, Q, mu, c = NaN;
  if (s.phase === "gas") {
    const MW = 28.964 * s.sg;
    rho = (P1 * MW) / (s.z * R_GAS * T);
    Q = (((s.qg * 1000 * 35.3147) / 24) * MW / 379.5) / 3600 / rho;   // ft³/s actual
    mu = s.mug; c = Math.sqrt((s.k * G_C * R_U * T) / MW);
  } else {
    rho = s.rho / 16.01846; Q = (s.ql * 35.3147) / 86400; mu = s.mul;
  }
  const V1 = Q / A(d1), V2 = Q / A(d2), Vs = Q / A(dS), VL = Q / A(dL);
  const Re1 = reynolds(d1, V1, rho, mu), f1 = colebrook(Re1, d1);
  const K = kHooperReducer({ type: s.type, Re: Re1, f: f1, d1, d2, theta: s.theta });
  const hv1 = (rho * V1 * V1) / (2 * G_C) / 144;                      // velocity head, psi
  const dpLoss = K * hv1;                                             // irrecoverable
  const dpStatic = dpLoss + (rho * (V2 * V2 - V1 * V1)) / (2 * G_C) / 144;   // P1 − P2 (static)
  const P2 = P1 - dpStatic;

  // vena contracta (contraction only)
  const aRatio = (dS / dL) ** 2;
  const Cc = contractionCc(aRatio);
  const Vvc = s.type === "con" ? Vs / Cc : NaN;
  const Pvc = s.type === "con" ? P1 - (rho * (Vvc * Vvc - V1 * V1)) / (2 * G_C) / 144 : NaN;
  const pvPsia = s.phase === "liquid" ? s.pv / KPA_PER_PSI : NaN;

  const Ve = 100 / Math.sqrt(rho);
  const MaS = s.phase === "gas" ? Vs / c : NaN;
  return {
    dL, dS, d1, d2, beta: dS / dL, rho, Q, V1, V2, Vs, VL, Re1, f1, K, hv1, dpLoss, dpStatic, P1, P2,
    p2g: P2 - s.patm / KPA_PER_PSI, Cc, Vvc, Pvc, pvPsia, Ve, MaS, c,
    Kpipe: K * (A(dL) / A(d1)) ** 2,       // referenced to the large-end velocity, for comparison
    fx: {
      shake: Vs >= Ve,
      choke: s.phase === "gas" && MaS >= 1,
      cavitate: s.phase === "liquid" && s.type === "con" && Pvc <= pvPsia,
      separate: s.type === "exp" && s.theta > 20,
      stall: P2 <= 0,
    },
  };
}

/** K across cone angles for the chart. */
export function kByAngle(s, r) {
  const out = [];
  for (let th = 5; th <= 180; th += 5) out.push({ th, K: kHooperReducer({ type: s.type, Re: r.Re1, f: r.f1, d1: r.d1, d2: r.d2, theta: th }) });
  return out;
}

export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, extra = {}) => out.push({ id, label, value, limit, kind, sev, ...extra });
  add("erosional", "Erosional · small end", r.Vs, r.Ve, "velocity", r.Vs >= r.Ve ? "bad" : r.Vs >= 0.8 * r.Ve ? "warn" : "ok");
  const vg = V_GUIDE[s.phase];
  add("velocity", "Velocity · small end", r.Vs, vg, "velocity", r.Vs > vg ? "warn" : "ok");
  if (s.phase === "gas") {
    add("mach", "Mach · small end", r.MaS, r.MaS >= 1 ? 1 : 0.3, "none", r.MaS >= 1 ? "bad" : r.MaS > 0.3 ? "warn" : "ok");
    add("dpp", "ΔP / P₁", r.dpLoss / r.P1, 0.05, "pct", r.dpLoss / r.P1 > 0.05 ? "warn" : "ok");
  } else if (s.type === "con") {
    add("cav", "Vena contracta > Pv", r.Pvc, r.pvPsia, "psia", r.Pvc <= r.pvPsia ? "bad" : r.Pvc - r.pvPsia < 5 ? "warn" : "ok");
  }
  if (s.type === "exp") add("sep", "Diffuser angle", s.theta, 20, "deg", r.fx.separate ? "warn" : "ok");
  return out;
}

export function status(r, list) {
  if (r.fx.stall) return ["bad", "ΔP exceeds P₁"];
  if (r.fx.choke) return ["bad", "Choked"];
  if (r.fx.cavitate) return ["bad", "Cavitation"];
  const bad = list.filter((c) => c.sev === "bad"), warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length === 1 && r.fx.separate) return ["warn", "Flow separation"];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "All checks pass"];
}

export { NPS };
