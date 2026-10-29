// Flowline Sizing — pure calculation, no DOM.
// Phase is set by the rates: gas only (isothermal compressible equation), liquid only
// (Darcy), or two-phase (Beggs & Brill, marched along the line). Pipe by OD × wall;
// steel checked to CSA Z662, non-metallic against the manufacturer's rating.
import { colebrook, reynolds, dp100 } from "../../lib/hydraulics.js";
import { beggsBrill, PATTERNS } from "../../lib/multiphase.js";
import { GRADES, designPressure, burstPressure } from "../../lib/csa-z662.js";

const KPA_PER_PSI = 6.894757;
const R_GAS = 10.7316, R_U = 1545.35, G_C = 32.174;
export const SEGMENTS = 40;

/** Roughness (mm) and whether CSA Z662 steel design applies. */
export const MATERIALS = {
  cs:    { name: "Carbon steel", eps: 0.0457, steel: true },
  ss:    { name: "Stainless steel", eps: 0.015, steel: true },
  rtr:   { name: "Fiberglass (RTR)", eps: 0.00533, steel: false },
  spool: { name: "Spoolable composite", eps: 0.0015, steel: false },
  hdpe:  { name: "HDPE", eps: 0.0015, steel: false },
};

export const DEFAULTS = Object.freeze({
  qg: 50, qo: 5, qw: 10, p: 2000, t: 15, patm: 100.2, len: 2, dh: 10,
  sg: 0.75, z: 0.95, mug: 0.01, rhoo: 830, rhow: 1100, muo: 5, muw: 1, sig: 72,
  od: 114.3, wt: 6.02, mat: "cs", grade: "359", service: "gas", locClass: 1, rating: 0, dp: 9930, ca: 1.0,
  cErosion: 100, dpAllow: 25, vAllow: 15,
});

export function validate(s) {
  const e = {};
  const pos = (k, m = "> 0") => { if (!(Number.isFinite(s[k]) && s[k] > 0)) e[k] = m; };
  ["len", "od", "wt", "patm", "mug", "muo", "muw", "sig", "rhoo", "rhow", "cErosion", "dpAllow", "vAllow"].forEach((k) => pos(k));
  const nn = (k) => { if (!(Number.isFinite(s[k]) && s[k] >= 0)) e[k] = "≥ 0"; };
  ["qg", "qo", "qw", "ca", "dp", "rating"].forEach(nn);
  if (!e.qg && !e.qo && !e.qw && s.qg + s.qo + s.qw <= 0) e.qg = "Need flow";
  if (!(s.sg >= 0.55 && s.sg <= 1.8)) e.sg = "0.55 – 1.8";
  if (!(s.z > 0 && s.z <= 2)) e.z = "0 – 2";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  if (!Number.isFinite(s.p) || s.p + s.patm <= 0) e.p = "> −Patm";
  if (!e.wt && !e.od && s.wt * 2 >= s.od) e.wt = "< OD/2";
  if (!Number.isFinite(s.dh) || Math.abs(s.dh) > s.len * 1000) e.dh = "|ΔH| ≤ L";
  if (!(Number.isInteger(s.locClass) && s.locClass >= 1 && s.locClass <= 4)) e.locClass = "1 – 4";
  return e;
}

export const phaseOf = (s) => (s.qg > 0 && s.qo + s.qw > 0 ? "2" : s.qg > 0 ? "G" : "L");
export const PHASE_NAMES = { G: "Gas", L: "Liquid", 2: "Two-phase" };

/** Fixed properties and the gas density at pressure P (psia). */
function props(s) {
  const T = s.t * 9 / 5 + 32 + 459.67;
  const MW = 28.964 * s.sg;
  const Wg = ((s.qg * 1000 * 35.3147) / 24) * MW / 379.5;          // lb/h
  const qL = s.qo + s.qw;
  const rhoL = qL > 0 ? (s.qo * s.rhoo + s.qw * s.rhow) / qL / 16.01846 : 0;
  const muL = qL > 0 ? (s.qo * s.muo + s.qw * s.muw) / qL : 0;   // volume-weighted
  const QL = (qL * 35.3147) / 86400;                                 // ft³/s
  const dIn = (s.od - 2 * s.wt) / 25.4;
  const A = (Math.PI / 4) * (dIn / 12) ** 2;
  return { T, MW, Wg, qL, rhoL, muL, QL, WL: QL * 3600 * rhoL, dIn, A, epsIn: s.eps ?? MATERIALS[s.mat].eps / 25.4,
    rhoG: (P) => (P * MW) / (s.z * R_GAS * T) };
}

/** Local state at pressure P (psia): velocities, densities, gradient (psi/ft, + = loss). */
function local(s, pr, P, theta) {
  const ph = phaseOf(s);
  if (ph === "G") {
    const rho = pr.rhoG(P), V = pr.Wg / 3600 / rho / pr.A;
    const Re = reynolds(pr.dIn, V, rho, s.mug), f = colebrook(Re, pr.dIn, pr.epsIn);
    const grad = (f * rho * V * V) / (2 * G_C * (pr.dIn / 12)) / 144 + (rho * Math.sin(theta)) / 144;
    return { V, rhoM: rho, Re, f, grad, gradF: (f * rho * V * V) / (2 * G_C * (pr.dIn / 12)) / 144 };
  }
  if (ph === "L") {
    const V = pr.QL / pr.A, Re = reynolds(pr.dIn, V, pr.rhoL, pr.muL), f = colebrook(Re, pr.dIn, pr.epsIn);
    const gradF = dp100(f, pr.WL, pr.dIn, pr.rhoL) / 100;
    return { V, rhoM: pr.rhoL, Re, f, gradF, grad: gradF + (pr.rhoL * Math.sin(theta)) / 144 };
  }
  const rhoG = pr.rhoG(P);
  const bb = beggsBrill({ VSL: pr.QL / pr.A, VSG: pr.Wg / 3600 / rhoG / pr.A, rhoL: pr.rhoL, rhoG, muL: pr.muL, muG: s.mug,
    sigma: s.sig, dIn: pr.dIn, epsIn: pr.epsIn, theta });
  return { V: bb.Vm, rhoM: bb.rhoN, Re: bb.ReN, f: bb.ftp, grad: bb.dp / 100, gradF: bb.dpFric / 100, bb };
}

export function compute(s) {
  const pr = props(s), ph = phaseOf(s);
  const lenFt = s.len * 3280.84, theta = Math.asin(Math.max(-1, Math.min(1, s.dh / (s.len * 1000))));
  const P1 = (s.p + s.patm) / KPA_PER_PSI;

  // march along the line (gas: closed-form isothermal equation for friction)
  const prof = [];
  let P = P1, stalled = false;
  const dx = lenFt / SEGMENTS;
  const first = local(s, pr, P1, theta);
  if (ph === "G") {
    const G = pr.Wg / 3600 / pr.A, D = pr.dIn / 12, f = first.f;
    const k = (f * G * G * s.z * R_U * pr.T) / (G_C * D * pr.MW) / (144 * 144);   // psi²/ft
    for (let i = 0; i <= SEGMENTS; i++) {
      const x = i * dx, P2sq = P1 * P1 - k * x;
      P = P2sq > 0 ? Math.sqrt(P2sq) : 0;
      if (P > 0) P -= (0.5 * (pr.rhoG(P1) + pr.rhoG(P)) * Math.sin(theta) * x) / 144;
      if (P <= 0) { stalled = true; prof.push({ x, P: 0, V: NaN }); break; }
      prof.push({ x, P, V: G / pr.rhoG(P) });
    }
  } else {
    prof.push({ x: 0, P: P1, V: first.V });
    for (let i = 1; i <= SEGMENTS; i++) {
      const mid = local(s, pr, Math.max(P - 0.5 * local(s, pr, P, theta).grad * dx, 0.1), theta);
      P -= mid.grad * dx;
      if (P <= 0) { stalled = true; prof.push({ x: i * dx, P: 0, V: NaN }); break; }
      prof.push({ x: i * dx, P, V: local(s, pr, P, theta).V });
    }
  }
  const P2 = stalled ? 0 : prof[prof.length - 1].P;
  const last = stalled ? first : local(s, pr, P2, theta);
  const dpLine = P1 - P2;

  // erosional at the worst point (outlet for compressible flow)
  const Ve1 = (s.cErosion / Math.sqrt(first.rhoM)), Ve2 = s.cErosion / Math.sqrt(last.rhoM);

  // mechanical
  const m = MATERIALS[s.mat];
  const tMm = s.wt - s.ca;
  const g = GRADES[s.grade];
  const designMpa = m.steel ? designPressure({ smys: g.smys, odMm: s.od, tMm, service: s.service, cls: s.locClass, tC: s.t }) : NaN;
  const burstMpa = m.steel ? burstPressure({ smts: g.smts, odMm: s.od, tMm: s.wt }) : NaN;
  const ratingPsig = m.steel ? (designMpa * 1000) / KPA_PER_PSI : s.rating > 0 ? s.rating / KPA_PER_PSI : NaN;
  const opPsig = s.p / KPA_PER_PSI, dpPsig = s.dp / KPA_PER_PSI;

  const L = Math.log10(P1);
  const hydF = -238.24469 + 78.99667 * L - 5.352544 * L * L + 349.473877 * s.sg - 150.854675 * s.sg ** 2 - 27.604065 * L * s.sg;
  const hydOk = s.qg > 0 && s.sg <= 1;
  const hydC = hydOk ? (hydF - 32) * 5 / 9 : NaN;

  const dpPer100 = (dpLine / lenFt) * 100;                       // psi/100 ft average
  const bb = first.bb;
  return {
    ...pr, phase: ph, phaseName: PHASE_NAMES[ph], theta, lenFt, P1, P2, p2g: P2 - s.patm / KPA_PER_PSI, dpLine, dpPer100,
    prof, V1: first.V, V2: last.V, Vmax: Math.max(first.V, last.V), rho1: first.rhoM, rho2: last.rhoM, Ve1, Ve2,
    Re: first.Re, f: first.f, bb, pat: bb ? bb.pat : null, patName: bb ? PATTERNS[bb.pat] : null, HL: bb ? bb.HL : ph === "L" ? 1 : 0,
    mat: m, tMm, designMpa, burstMpa, ratingPsig, opPsig, dpPsig, hydC,
    Mach: ph === "G" ? last.V / Math.sqrt((1.25 * G_C * R_U * pr.T) / pr.MW) : NaN,
    fx: {
      rupture: m.steel && s.p / 1000 > burstMpa,
      overstress: Number.isFinite(ratingPsig) && opPsig > ratingPsig,
      stall: stalled,
      shake: last.V >= Ve2 || first.V >= Ve1,
      slug: !!bb && (bb.pat === "int" || bb.pat === "tr"),
      hydrate: hydOk && s.t < hydC,
      frost: s.t < 0,
    },
  };
}

export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, extra = {}) => out.push({ id, label, value, limit, kind, sev, ...extra });
  add("design", "MOP ≤ design", r.opPsig, r.dpPsig, "psig", r.opPsig <= r.dpPsig ? "ok" : "bad");
  if (r.mat.steel) add("z662", `Z662 · Gr ${s.grade} · class ${s.locClass}`, r.dpPsig, r.ratingPsig, "psig", r.tMm <= 0 || r.dpPsig > r.ratingPsig ? "bad" : "ok", r.tMm <= 0 ? { note: "CA ≥ wall" } : {});
  else add("rating", "Manufacturer rating", r.dpPsig, r.ratingPsig, "psig", !Number.isFinite(r.ratingPsig) ? "na" : r.dpPsig > r.ratingPsig ? "bad" : "ok");
  const ve = Math.min(r.Ve1, r.Ve2), vw = r.V2 / r.Ve2 > r.V1 / r.Ve1 ? r.V2 : r.V1;
  add("erosional", `Erosional · C ${s.cErosion}`, vw, vw === r.V2 ? r.Ve2 : r.Ve1, "velocity", r.fx.shake ? "bad" : vw >= 0.8 * ve ? "warn" : "ok");
  const vLim = s.vAllow / 0.3048;
  add("velocity", "Velocity ≤ allowable", r.Vmax, vLim, "velocity", r.Vmax > vLim ? "warn" : "ok");
  const dLim = s.dpAllow * 0.0442075;
  add("dp", "ΔP ≤ allowable", r.dpPer100, dLim, "dp100", r.fx.stall ? "bad" : r.dpPer100 > dLim ? "warn" : "ok");
  if (r.phase === "2") add("regime", "Flow regime", 0, 0, "text", r.fx.slug ? "warn" : "ok", { text: r.patName });
  const hm = s.t - r.hydC;
  if (s.qg > 0) add("hydrate", "Hydrate T", r.hydC, s.t, "degC", !Number.isFinite(r.hydC) ? "na" : hm < 0 ? "bad" : hm < 3 ? "warn" : "ok");
  return out;
}

export function status(r, list) {
  const fx = r.fx;
  if (fx.rupture) return ["bad", "Rupture"];
  if (fx.overstress) return ["bad", "Above pipe rating"];
  if (fx.stall) return ["bad", "ΔP exceeds P₁"];
  const bad = list.filter((c) => c.sev === "bad"), warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length === 1 && fx.slug) return ["warn", "Slug flow"];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "All checks pass"];
}
