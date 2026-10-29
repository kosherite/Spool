// 2-Phase Line Sizing — pure calculation, no DOM.
// Beggs & Brill (1973) holdup and pressure gradient; API RP 14E erosional velocity.
import { pipeID, pipeOD, pipeWall, MATERIALS, flangeRating, mawp, burst, NPS } from "../../lib/pipe.js";
import { beggsBrill, PATTERNS } from "../../lib/multiphase.js";

export const C_EROSIONAL = 100;
export const V_MIN_FTS = 10;              // API RP 14E §2.5: minimise slugging
export const V_MAX_FTS = 15 / 0.3048;     // 15 m/s, source workbook limit
const KPA_PER_PSI = 6.894757;
const R_GAS = 10.7316;

export const DEFAULTS = Object.freeze({
  qg: 6, qo: 55, qw: 495, p: 689, t: 20, patm: 100.2, len: 80, dh: 0,
  sg: 0.897, z: 0.98, mug: 0.01, rhoo: 850, rhow: 1130, mul: 1.41, sig: 75, eps: 0.046,
  nps: 3, sch: "40", mat: "A106B", cls: "300", dp: 1900, mdmt: -29, ca: 1.6,
});

export function validate(s) {
  const e = {};
  const pos = (k) => { if (!(Number.isFinite(s[k]) && s[k] > 0)) e[k] = "> 0"; };
  ["len", "mug", "mul", "sig", "patm", "rhoo", "rhow"].forEach(pos);
  const nn = (k) => { if (!(Number.isFinite(s[k]) && s[k] >= 0)) e[k] = "≥ 0"; };
  ["qg", "qo", "qw", "eps", "ca", "dp"].forEach(nn);
  if (s.qg + s.qo + s.qw <= 0 && !e.qg) e.qg = "Need flow";
  if (s.qo + s.qw <= 0 && !e.qo) e.qo = "Need liquid";
  if (s.qg <= 0 && !e.qg) e.qg = "> 0";
  if (!(s.sg >= 0.55 && s.sg <= 1.8)) e.sg = "0.55 – 1.8";
  if (!(s.z > 0 && s.z <= 2)) e.z = "0 – 2";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  if (!Number.isFinite(s.p) || s.p + s.patm <= 0) e.p = "> −Patm";
  if (!Number.isFinite(s.dh) || Math.abs(s.dh) > s.len) e.dh = "|ΔH| ≤ L";
  if (!Number.isFinite(s.mdmt) || s.mdmt <= -273.15) e.mdmt = "> −273 °C";
  return e;
}

/** Phase flows and properties (US field units). */
export function phases(s) {
  const P = (s.p + s.patm) / KPA_PER_PSI;                 // psia
  const T = s.t * 9 / 5 + 32 + 459.67;                     // °R
  const MW = 28.964 * s.sg;
  const rhoG = (P * MW) / (s.z * R_GAS * T);               // lb/ft³
  const Wg = ((s.qg * 1000 * 35.3147) / 24) * MW / 379.5;  // lb/h
  const QG = Wg / 3600 / rhoG;                             // ft³/s actual
  const qL = s.qo + s.qw;                                  // m³/d
  const rhoLkg = (s.qo * s.rhoo + s.qw * s.rhow) / qL;
  const rhoL = rhoLkg / 16.01846;
  const QL = (qL * 35.3147) / 86400;                       // ft³/s
  return { P, T, MW, rhoG, Wg, QG, qL, rhoL, rhoLkg, QL, WL: QL * 3600 * rhoL, wc: s.qw / qL, glr: (s.qg * 1000) / qL };
}

export function flowIn(s, ph, dIn) {
  const A = (Math.PI / 4) * (dIn / 12) ** 2;
  const theta = Math.asin(Math.max(-1, Math.min(1, s.dh / s.len)));
  const bb = beggsBrill({ VSL: ph.QL / A, VSG: ph.QG / A, rhoL: ph.rhoL, rhoG: ph.rhoG, muL: s.mul, muG: s.mug,
    sigma: s.sig, dIn, epsIn: s.eps / 25.4, theta });
  return { ...bb, A, theta, VSL: ph.QL / A, VSG: ph.QG / A, Ve: C_EROSIONAL / Math.sqrt(bb.rhoN) };
}

export function compute(s) {
  const dIn = pipeID(s.nps, s.sch);
  const ph = phases(s);
  const f = flowIn(s, ph, dIn);
  const lenFt = s.len * 3.28084;
  const dpFricLine = (f.dpFric * lenFt) / 100, dpElevLine = (f.dpElev * lenFt) / 100;
  const dpLine = dpFricLine + dpElevLine;
  const P2 = ph.P - dpLine;

  const mat = MATERIALS[s.mat];
  const od = pipeOD(s.nps), tn = pipeWall(s.nps, s.sch);
  const { tm, P: mawpPsig } = mawp({ od, tn, ca: s.ca / 25.4, S: mat.S });
  const burstPsig = burst({ od, tn, UTS: mat.UTS });
  const flangePsig = flangeRating(s.cls, s.t * 9 / 5 + 32);
  const opPsig = s.p / KPA_PER_PSI, dpPsig = s.dp / KPA_PER_PSI;

  const L = Math.log10(ph.P);
  const hydF = -238.24469 + 78.99667 * L - 5.352544 * L * L + 349.473877 * s.sg - 150.854675 * s.sg ** 2 - 27.604065 * L * s.sg;
  const hydOk = s.qw > 0 && s.sg <= 1;
  const hydC = hydOk ? (hydF - 32) * 5 / 9 : NaN;

  return {
    ...ph, ...f, dIn, lenFt, dpFricLine, dpElevLine, dpLine, P2, p2g: P2 - s.patm / KPA_PER_PSI,
    od, tn, tm, mat, mawpPsig, burstPsig, flangePsig, opPsig, dpPsig, hydC,
    hoop: tm > 0 ? (opPsig * od) / (2 * tm) : Infinity,
    patName: PATTERNS[f.pat],
    fx: {
      rupture: opPsig > burstPsig,
      leak: opPsig > 1.5 * flangePsig,
      overstress: opPsig > mawpPsig,
      stall: P2 <= 0,
      shake: f.Vm >= f.Ve,
      slug: f.pat === "int" || f.pat === "tr",
      hydrate: hydOk && s.t < hydC,
      frost: s.t < 0,
    },
  };
}

export function velocityByNps(s) {
  const ph = phases(s);
  return NPS.map((n) => { const f = flowIn(s, ph, pipeID(n, s.sch)); return { nps: n, V: f.Vm, Ve: f.Ve, pat: f.pat }; });
}

export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, extra = {}) => out.push({ id, label, value, limit, kind, sev, ...extra });
  add("design", "Operating ≤ design", r.opPsig, r.dpPsig, "psig", r.opPsig <= r.dpPsig ? "ok" : "bad");
  add("mawp", "MAWP · B31.3", r.dpPsig, r.mawpPsig, "psig", r.tm <= 0 || r.dpPsig > r.mawpPsig ? "bad" : "ok", r.tm <= 0 ? { note: "CA ≥ wall" } : {});
  add("flange", `Class ${s.cls} · B16.5`, r.dpPsig, r.flangePsig, "psig", r.dpPsig <= r.flangePsig ? "ok" : "bad");
  add("erosional", "Erosional · RP 14E", r.Vm, r.Ve, "velocity", r.Vm >= r.Ve ? "bad" : r.Vm >= 0.8 * r.Ve ? "warn" : "ok");
  add("velocity", "Mixture velocity", r.Vm, V_MAX_FTS, "velocity", r.Vm > V_MAX_FTS || r.Vm < V_MIN_FTS ? "warn" : "ok", { min: V_MIN_FTS });
  add("regime", "Flow regime", 0, 0, "text", r.fx.slug ? "warn" : "ok", { text: r.patName });
  add("dp", "ΔP / P₁", r.dpLine / r.P, 0.1, "pct", r.P2 <= 0 ? "bad" : r.dpLine / r.P > 0.1 ? "warn" : "ok");
  const hm = s.t - r.hydC;
  add("hydrate", "Hydrate T", r.hydC, s.t, "degC", !Number.isFinite(r.hydC) ? "na" : hm < 0 ? "bad" : hm < 3 ? "warn" : "ok");
  add("mdmt", `MDMT · ${r.mat.name}`, s.mdmt, r.mat.mdmtC, "degC", s.mdmt >= r.mat.mdmtC ? "ok" : "bad");
  return out;
}

export function status(r, list) {
  const fx = r.fx;
  if (fx.rupture) return ["bad", "Rupture"];
  if (fx.leak) return ["bad", "Flange leak"];
  if (fx.overstress) return ["bad", "Overstressed"];
  if (fx.stall) return ["bad", "ΔP exceeds P₁"];
  const bad = list.filter((c) => c.sev === "bad"), warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length === 1 && fx.slug) return ["warn", "Slug flow"];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "All checks pass"];
}
