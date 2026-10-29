// Liquid Line Sizing — pure calculation, no DOM.
// Inputs are metric; the method runs in US field units to match the source
// workbook (Crane TP-410, Colebrook friction, Hooper 2-K fittings).
import { pipeID, pipeOD, pipeWall, MATERIALS, flangeRating, mawp, burst, NPS } from "../../lib/pipe.js";
import { colebrook, reynolds, dp100, kLossPsi, FITTINGS, fittingK, equivLengthFt,
  kExpansion, kContraction, waveSpeed } from "../../lib/hydraulics.js";

export const C_EROSIONAL = 100;          // API RP 14E
const KPA_PER_PSI = 6.894757;
const LB_FT3_PER_KG_M3 = 1 / 16.01846;

/** Velocity bands by service, ft/s (API RP 14E §2.3–2.4). */
export const SERVICES = {
  suction:   { label: "Pump suction",   min: 0, max: 3 },
  discharge: { label: "Pump discharge", min: 3, max: 15 },
  general:   { label: "General",        min: 3, max: 15 },
};

export const DEFAULTS = Object.freeze({
  q: 450, p: 103, t: 10, patm: 100.2, len: 15, dh: 0, other: 0,
  rho: 1155, mu: 1.0, pv: 1.2, kb: 2.3, tf: -10,
  service: "suction", nps: 4, sch: "40", red: "none", redNps: 2,
  ell90: 4, ell90lr: 0, mitre: 0, teeRun: 0, teeBr: 0, gate: 1, globe: 0, check: 0, bfly: 0, entry: 1, exit: 0,
  mat: "A106B", cls: "150", dp: 690, mdmt: -29, ca: 1.6,
});

export function validate(s) {
  const e = {};
  const pos = (k) => { if (!(Number.isFinite(s[k]) && s[k] > 0)) e[k] = "> 0"; };
  ["q", "len", "mu", "patm", "kb"].forEach(pos);
  if (!(s.rho >= 300 && s.rho <= 2500)) e.rho = "300 – 2500";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  if (!Number.isFinite(s.p) || s.p + s.patm <= 0) e.p = "> −Patm";
  if (!Number.isFinite(s.pv) || s.pv < 0) e.pv = "≥ 0";
  if (!Number.isFinite(s.dh)) e.dh = "Number";
  if (!Number.isFinite(s.other) || s.other < 0) e.other = "≥ 0";
  if (!Number.isFinite(s.tf)) e.tf = "Number";
  if (!Number.isFinite(s.dp) || s.dp < 0) e.dp = "≥ 0";
  if (!Number.isFinite(s.mdmt) || s.mdmt <= -273.15) e.mdmt = "> −273 °C";
  if (!Number.isFinite(s.ca) || s.ca < 0) e.ca = "≥ 0";
  for (const f of FITTINGS) {
    const n = s[f.id];
    if (!(Number.isInteger(n) && n >= 0 && n <= 99)) e[f.id] = "0 – 99";
  }
  if (s.red !== "none" && !(s.redNps < s.nps)) e.redNps = "< line NPS";
  return e;
}

/** Hydraulics for one pipe ID (inches). Friction only; used for the chart too. */
export function hydraulics(s, dIn) {
  const rho = s.rho * LB_FT3_PER_KG_M3;                  // lb/ft³
  const Qh = (s.q * 35.3147) / 24;                       // ft³/h
  const W = Qh * rho;                                    // lb/h
  const A = (Math.PI / 4) * (dIn / 12) ** 2;
  const V = Qh / 3600 / A;                               // ft/s
  const Re = reynolds(dIn, V, rho, s.mu);
  const f = colebrook(Re, dIn);
  return { rho, Qh, W, A, V, Re, f, dp100: dp100(f, W, dIn, rho), Ve: C_EROSIONAL / Math.sqrt(rho), dIn };
}

export function compute(s) {
  const dIn = pipeID(s.nps, s.sch);
  const h = hydraulics(s, dIn);
  const { rho, V, Re, f } = h;

  // fittings → equivalent length
  const fit = FITTINGS.map((ft) => {
    const n = s[ft.id] || 0, K = fittingK(ft, Re, dIn);
    return { ...ft, n, K, leq: n * equivLengthFt(K, dIn, f) };
  });
  const leqFt = fit.reduce((a, b) => a + b.leq, 0);
  const lenFt = s.len * 3.28084;
  const dpFric = (h.dp100 * (lenFt + leqFt)) / 100;      // psi

  // reducer, referenced to the small-bore velocity
  let dpRed = 0, Kred = 0, dSmall = NaN, Vsmall = NaN;
  if (s.red !== "none") {
    dSmall = pipeID(s.redNps, s.sch);
    const beta = dSmall / dIn;
    Kred = s.red === "exp" ? kExpansion(beta) : kContraction(beta);
    Vsmall = V / (beta * beta);
    dpRed = kLossPsi(Kred, rho, Vsmall);
  }
  const dpStatic = (rho * s.dh * 3.28084) / 144;        // psi, + when outlet is higher
  const dpOther = s.other / KPA_PER_PSI;
  const dpTotal = dpFric + dpRed + dpStatic + dpOther;

  const P1 = (s.p + s.patm) / KPA_PER_PSI;               // psia
  const P2 = P1 - dpTotal;
  const pvPsia = s.pv / KPA_PER_PSI;

  // mechanical
  const mat = MATERIALS[s.mat];
  const od = pipeOD(s.nps), tn = pipeWall(s.nps, s.sch);
  const { tm, P: mawpPsig } = mawp({ od, tn, ca: s.ca / 25.4, S: mat.S });
  const burstPsig = burst({ od, tn, UTS: mat.UTS });
  const flangePsig = flangeRating(s.cls, s.t * 9 / 5 + 32);
  const opPsig = s.p / KPA_PER_PSI, dpPsig = s.dp / KPA_PER_PSI;

  // instantaneous valve closure (Joukowsky)
  const a = waveSpeed(s.kb * 1e9, s.rho, (dIn * 0.0254), (tn * 0.0254));   // m/s
  const surgePsi = (s.rho * a * V * 0.3048) / 1000 / KPA_PER_PSI;        // psi
  const surgeLimit = 1.33 * mawpPsig;                                      // B31.3 302.2.4

  const sv = SERVICES[s.service];
  return {
    ...h, fit, leqFt, lenFt, dpFric, dpRed, Kred, dSmall, Vsmall, dpStatic, dpOther, dpTotal,
    P1, P2, p2g: P2 - s.patm / KPA_PER_PSI, pvPsia,
    od, tn, tm, mat, mawpPsig, burstPsig, flangePsig, opPsig, dpPsig,
    hoop: tm > 0 ? (opPsig * od) / (2 * tm) : Infinity,
    a, surgePsi, surgeLimit, sv,
    fx: {
      rupture: opPsig > burstPsig,
      leak: opPsig > 1.5 * flangePsig,
      overstress: opPsig > mawpPsig,
      surge: opPsig + surgePsi > surgeLimit,
      flash: P2 <= pvPsia,
      stall: P2 <= 0,
      shake: V >= h.Ve,
      freeze: s.t <= s.tf,
      frost: s.t < 0,
    },
  };
}

export function velocityByNps(s) {
  return NPS.map((n) => { const h = hydraulics(s, pipeID(n, s.sch)); return { nps: n, V: h.V, Ve: h.Ve }; });
}

export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, extra = {}) => out.push({ id, label, value, limit, kind, sev, ...extra });
  add("design", "Operating ≤ design", r.opPsig, r.dpPsig, "psig", r.opPsig <= r.dpPsig ? "ok" : "bad");
  add("mawp", "MAWP · B31.3", r.dpPsig, r.mawpPsig, "psig",
    r.tm <= 0 || r.dpPsig > r.mawpPsig ? "bad" : "ok", r.tm <= 0 ? { note: "CA ≥ wall" } : {});
  add("flange", `Class ${s.cls} · B16.5`, r.dpPsig, r.flangePsig, "psig", r.dpPsig <= r.flangePsig ? "ok" : "bad");
  add("surge", "Surge · B31.3 302.2.4", r.opPsig + r.surgePsi, r.surgeLimit, "psig",
    r.opPsig + r.surgePsi > r.surgeLimit ? "bad" : r.opPsig + r.surgePsi > 0.9 * r.surgeLimit ? "warn" : "ok");
  add("erosional", "Erosional · RP 14E", r.V, r.Ve, "velocity", r.V >= r.Ve ? "bad" : r.V >= 0.8 * r.Ve ? "warn" : "ok");
  const { min, max } = r.sv;
  add("velocity", `Velocity · ${r.sv.label.toLowerCase()}`, r.V, max, "velocity",
    r.V > max || r.V < min ? "warn" : "ok", { min });
  add("flash", "P₂ > Pv", r.P2, r.pvPsia, "psia", r.P2 <= r.pvPsia ? "bad" : r.P2 - r.pvPsia < 5 ? "warn" : "ok");
  add("freeze", "T > freeze / pour", s.t, s.tf, "degC", s.t <= s.tf ? "bad" : s.t - s.tf < 3 ? "warn" : "ok");
  add("mdmt", `MDMT · ${r.mat.name}`, s.mdmt, r.mat.mdmtC, "degC", s.mdmt >= r.mat.mdmtC ? "ok" : "bad");
  return out;
}

export function status(r, list) {
  const fx = r.fx;
  if (fx.rupture) return ["bad", "Rupture"];
  if (fx.leak) return ["bad", "Flange leak"];
  if (fx.overstress) return ["bad", "Overstressed"];
  if (fx.stall) return ["bad", "ΔP exceeds P₁"];
  if (fx.flash) return ["bad", "Flashing"];
  if (fx.surge) return ["bad", "Surge exceeds limit"];
  if (fx.freeze) return ["bad", "Freezing"];
  const bad = list.filter((c) => c.sev === "bad"), warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "All checks pass"];
}
