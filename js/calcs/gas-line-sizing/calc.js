// Gas Line Sizing — pure calculation, no DOM.
// Inputs are metric (as entered in Alberta practice); the method runs in US
// field units to match the source workbook (Crane TP-410 form).
import { pipeID, pipeOD, pipeWall, MATERIALS, flangeRating, mawp, burst, NPS } from "../../lib/pipe.js";

export const EPS_IN = 0.0018;      // commercial steel roughness, in
export const C_EROSIONAL = 100;    // API RP 14E, continuous service
export const V_LIMIT_FTS = 60;     // ≈ 18 m/s continuous-service guideline
const R_GAS = 10.7316;             // psia·ft³/(lbmol·°R)
const R_U = 1545.35;               // ft·lbf/(lbmol·°R)
const G_C = 32.174;
const SCF_PER_LBMOL = 379.5;       // 60 °F, 14.696 psia
const KPA_PER_PSI = 6.894757;

export const DEFAULTS = Object.freeze({
  q: 17.4, p: 69, t: 10, patm: 100.2, len: 30,
  mw: 23, k: 1.25, z: 0.99, mu: 0.01,
  nps: 4, sch: "40", mat: "A106B", cls: "150", dp: 690, mdmt: -29, ca: 1.6,
});

/** Returns { field: message } for invalid inputs; empty object when valid. */
export function validate(s) {
  const e = {};
  const pos = (k) => { if (!(Number.isFinite(s[k]) && s[k] > 0)) e[k] = "> 0"; };
  ["q", "len", "mw", "mu", "patm"].forEach(pos);
  if (!(s.z > 0 && s.z <= 2)) e.z = "0 – 2";
  if (!(s.k > 1 && s.k < 2)) e.k = "1 – 2";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  if (!Number.isFinite(s.p) || s.p + s.patm <= 0) e.p = "> −Patm";
  if (!Number.isFinite(s.dp) || s.dp < 0) e.dp = "≥ 0";
  if (!Number.isFinite(s.mdmt) || s.mdmt <= -273.15) e.mdmt = "> −273 °C";
  if (!Number.isFinite(s.ca) || s.ca < 0) e.ca = "≥ 0";
  return e;
}

/** Darcy friction factor: laminar below Re 2000, Moody's explicit form above. */
export function frictionFactor(Re, dIn) {
  if (Re < 2000) return 64 / Re;
  return 0.0055 * (1 + Math.cbrt((20000 * EPS_IN) / dIn + 1e6 / Re));
}

/** Hydrate formation temperature, °F. Motiee (1991), sweet gas, P in psia. */
export function hydrateTempF(Ppsia, sg) {
  const L = Math.log10(Ppsia);
  return -238.24469 + 78.99667 * L - 5.352544 * L * L + 349.473877 * sg
    - 150.854675 * sg * sg - 27.604065 * L * sg;
}

/** Core hydraulics for one pipe ID (inches). All outputs in US field units. */
export function hydraulics(s, dIn) {
  const P = (s.p + s.patm) / KPA_PER_PSI;               // psia
  const T = s.t * 9 / 5 + 32 + 459.67;                   // °R
  const scfh = (s.q * 1000 * 35.3147) / 24;
  const W = (scfh * s.mw) / SCF_PER_LBMOL;               // lb/h
  const rho = (P * s.mw) / (s.z * R_GAS * T);            // lb/ft³
  const A = (Math.PI / 4) * (dIn / 12) ** 2;             // ft²
  const acfs = W / 3600 / rho;
  const V = acfs / A;                                    // ft/s
  const Re = (123.9 * dIn * V * rho) / s.mu;
  const f = frictionFactor(Re, dIn);
  const dp100 = (0.000336 * f * W * W) / (dIn ** 5 * rho); // psi/100 ft
  const lenFt = s.len * 3.28084;
  const dpLine = (dp100 * lenFt) / 100;
  const Ve = C_EROSIONAL / Math.sqrt(rho);
  const c = Math.sqrt((s.k * G_C * R_U * T) / s.mw);
  return { P, T, W, rho, A, acfs, V, Re, f, dp100, lenFt, dpLine, Ve, c, Ma: V / c, dIn };
}

export function compute(s) {
  const dIn = pipeID(s.nps, s.sch);
  const h = hydraulics(s, dIn);
  const mat = MATERIALS[s.mat];
  const od = pipeOD(s.nps), tn = pipeWall(s.nps, s.sch);
  const { tm, P: mawpPsig } = mawp({ od, tn, ca: s.ca / 25.4, S: mat.S });
  const burstPsig = burst({ od, tn, UTS: mat.UTS });
  const tF = s.t * 9 / 5 + 32;
  const flangePsig = flangeRating(s.cls, tF);
  const opPsig = s.p / KPA_PER_PSI, dpPsig = s.dp / KPA_PER_PSI;
  const sg = s.mw / 28.964;
  const hydOk = sg >= 0.55 && sg <= 1.0;
  const hydF = hydOk ? hydrateTempF(h.P, sg) : NaN;
  const p2abs = h.P - h.dpLine;
  return {
    ...h, od, tn, tm, mat, mawpPsig, burstPsig, flangePsig, opPsig, dpPsig,
    hoop: tm > 0 ? (opPsig * od) / (2 * tm) : Infinity,
    hydC: (hydF - 32) * 5 / 9, p2abs, p2g: p2abs - s.patm / KPA_PER_PSI,
    fx: {
      rupture: opPsig > burstPsig,
      leak: opPsig > 1.5 * flangePsig,
      overstress: opPsig > mawpPsig,
      choke: h.V >= h.c,
      stall: p2abs <= 0,
      shake: h.V >= h.Ve,
      hydrate: hydOk && s.t < (hydF - 32) * 5 / 9,
      frost: s.t < 0,
    },
  };
}

/** Velocity for every NPS in the selected schedule (chart). */
export function velocityByNps(s) {
  return NPS.map((n) => {
    const h = hydraulics(s, pipeID(n, s.sch));
    return { nps: n, V: h.V, Ve: h.Ve };
  });
}

/** Design checks. sev: "ok" | "warn" | "bad" | "na". Values in base units for the view. */
export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, note) => out.push({ id, label, value, limit, kind, sev, note });
  add("design", "Operating ≤ design", r.opPsig, r.dpPsig, "psig", r.opPsig <= r.dpPsig ? "ok" : "bad");
  add("mawp", "MAWP · B31.3", r.dpPsig, r.mawpPsig, "psig",
    r.tm <= 0 ? "bad" : r.dpPsig <= r.mawpPsig ? "ok" : "bad", r.tm <= 0 ? "CA ≥ wall" : undefined);
  add("flange", `Class ${s.cls} · B16.5`, r.dpPsig, r.flangePsig, "psig", r.dpPsig <= r.flangePsig ? "ok" : "bad");
  add("erosional", "Erosional · RP 14E", r.V, r.Ve, "velocity", r.V >= r.Ve ? "bad" : r.V >= 0.8 * r.Ve ? "warn" : "ok");
  add("velocity", "Velocity", r.V, V_LIMIT_FTS, "velocity", r.V > V_LIMIT_FTS ? "warn" : "ok");
  add("mach", "Mach", r.Ma, r.Ma >= 1 ? 1 : 0.3, "none", r.Ma >= 1 ? "bad" : r.Ma > 0.3 ? "warn" : "ok");
  add("dp", "ΔP / P₁", r.dpLine / r.P, 0.1, "pct", r.p2abs <= 0 ? "bad" : r.dpLine / r.P > 0.1 ? "warn" : "ok");
  const hm = s.t - r.hydC;
  add("hydrate", "Hydrate T", r.hydC, s.t, "degC",
    !Number.isFinite(r.hydC) ? "na" : hm < 0 ? "bad" : hm < 3 ? "warn" : "ok");
  add("mdmt", `MDMT · ${r.mat.name}`, s.mdmt, r.mat.mdmtC, "degC", s.mdmt >= r.mat.mdmtC ? "ok" : "bad");
  return out;
}

/** Single headline status, worst first. */
export function status(r, list) {
  const fx = r.fx;
  if (fx.rupture) return ["bad", "Rupture"];
  if (fx.leak) return ["bad", "Flange leak"];
  if (fx.overstress) return ["bad", "Overstressed"];
  if (fx.choke) return ["bad", "Choked"];
  if (fx.stall) return ["bad", "ΔP exceeds P₁"];
  const bad = list.filter((c) => c.sev === "bad");
  const warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "All checks pass"];
}
