// B31.3 Pipe Stress — internal-pressure design of straight pipe. Pure calculation, no DOM.
// ASME B31.3 304.1.2 wall thickness and MAWP, Table A-1 allowable stress against temperature,
// Table 304.1.1 Y, 345.4.2 hydrotest, B16.5 flange rating, MDMT and corrosion life.
import { OD_MM, WALLS_MM, wallOf } from "../../lib/pipe-schedules.js";

const KPA_PER_KSI = 6894.757;

/** Basic allowable stress S (ksi) at °F, Table A-1. SMYS (ksi); MDMT without impact test (°C). */
const T_F = [100, 200, 300, 400, 500, 600, 650, 700, 750, 800];
export const MATERIALS = {
  "A106B":  { name: "A106 Gr B", form: "ferritic", S: [20.0, 20.0, 20.0, 20.0, 18.9, 17.3, 17.0, 16.5, 13.0, 10.8], smys: 35, mdmt: -29 },
  "A333-6": { name: "A333 Gr 6", form: "ferritic", S: [20.0, 20.0, 20.0, 20.0, 18.9, 17.3, 17.0, 16.5, 13.0, 10.8], smys: 35, mdmt: -46 },
  "TP316":  { name: "A312 TP316", form: "austenitic", S: [20.0, 17.3, 15.6, 14.3, 13.3, 12.6, 12.3, 12.1, 11.9, 11.8], smys: 30, mdmt: -196 },
  "Z359":   { name: "Z245.1 Gr 359 Cat II", form: "ferritic", S: [22.0, 22.0, 22.0, 22.0], smys: 52.1, mdmt: -45, unlisted: true },
};

export function allowable(mat, tC) {
  const tF = tC * 9 / 5 + 32, m = MATERIALS[mat], S = m.S, T = T_F.slice(0, S.length);
  if (tF <= T[0]) return S[0];
  if (tF > T[T.length - 1]) return NaN;
  for (let i = 0; i < T.length - 1; i++) if (tF <= T[i + 1]) return S[i] + ((S[i + 1] - S[i]) * (tF - T[i])) / (T[i + 1] - T[i]);
}
export const maxTempC = (mat) => (T_F[MATERIALS[mat].S.length - 1] - 32) * 5 / 9;

/** Table 304.1.1 Y for t < D/6. */
export function yCoeff(form, tC) {
  const pts = form === "austenitic" ? [[566, 0.4], [593, 0.5], [621, 0.7]] : [[482, 0.4], [510, 0.5], [538, 0.7]];
  if (tC <= pts[0][0]) return 0.4;
  if (tC >= pts[2][0]) return 0.7;
  for (let i = 0; i < 2; i++) if (tC <= pts[i + 1][0]) return pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * (tC - pts[i][0])) / (pts[i + 1][0] - pts[i][0]);
}

/** B16.5 Group 1.1 ratings at 100/200/300/400/500 °F (psig → kPag); 900–2500 scale from Class 600. */
const FL_T = [37.8, 93.3, 148.9, 204.4, 260];
const PSIG = { "150": [285, 260, 230, 200, 170], "300": [740, 680, 655, 635, 605], "600": [1480, 1360, 1310, 1265, 1205] };
// Classes 900–2500: ambient ratings from B16.5, elevated temperatures scaled from Class 600.
for (const [cls, amb] of [["900", 2220], ["1500", 3705], ["2500", 6170]]) PSIG[cls] = PSIG["600"].map((v) => (v * amb) / 1480);
export const FLANGE = Object.fromEntries(Object.entries(PSIG).map(([k, v]) => [k, v.map((x) => x * 6.894757)]));
export function flangeKpa(cls, tC) {
  const r = FLANGE[cls];
  if (tC <= FL_T[0]) return r[0];
  if (tC >= FL_T[4]) return r[4];
  for (let i = 0; i < 4; i++) if (tC <= FL_T[i + 1]) return r[i] + ((r[i + 1] - r[i]) * (tC - FL_T[i])) / (FL_T[i + 1] - FL_T[i]);
}

export const DEFAULTS = Object.freeze({
  mat: "A333-6", nps: 10, sch: "80", p: 9930, t: -45, ca: 3.2, mt: 12.5, E: 1, W: 1, cls: "600", rate: 0.1,
});

/** Keep the schedule valid for the selected size. */
export function normalize(s) {
  if (wallOf(s.nps, s.sch)) return s;
  const list = WALLS_MM[s.nps], tokens = s.sch.split("/");
  let pick;
  for (const tok of tokens) { pick = list.find(([n]) => n.split("/").includes(tok)); if (pick) break; }
  pick ||= list.find(([n]) => n.split("/").includes("STD")) || list[0];
  return { ...s, sch: pick[0] };
}

export function validate(s) {
  const e = {};
  if (!(Number.isFinite(s.p) && s.p > 0)) e.p = "> 0";
  if (!Number.isFinite(s.t) || s.t <= -273.15) e.t = "> −273 °C";
  else if (s.t > maxTempC(s.mat)) e.t = `≤ ${Math.floor(maxTempC(s.mat))} °C`;
  if (!(Number.isFinite(s.ca) && s.ca >= 0)) e.ca = "≥ 0";
  if (!(s.mt >= 0 && s.mt < 50)) e.mt = "0 – 50";
  if (!(s.E > 0 && s.E <= 1)) e.E = "0 – 1";
  if (!(s.W > 0 && s.W <= 1)) e.W = "0 – 1";
  if (!(Number.isFinite(s.rate) && s.rate >= 0)) e.rate = "≥ 0";
  return e;
}

/** MAWP, kPag, for a nominal wall tn (mm). */
export function mawpKpa({ D, tn, c, mt, S, E, W, Y }) {
  const t = tn * (1 - mt / 100) - c;
  return t > 0 ? (2 * S * E * W * t) / (D - 2 * Y * t) : 0;
}

export function compute(s) {
  const m = MATERIALS[s.mat];
  const D = OD_MM[s.nps], tn = wallOf(s.nps, s.sch);
  const Sksi = allowable(s.mat, s.t), S = Sksi * KPA_PER_KSI;
  let Y = yCoeff(m.form, s.t);
  const { p: P, E, W, ca: c } = s;

  // 304.1.2 (3a); for t ≥ D/6 Y = (d + 2c)/(D + d + 2c)
  let t = (P * D) / (2 * (S * E * W + P * Y));
  const thick = t >= D / 6;
  if (thick) { const d = D - 2 * tn; Y = (d + 2 * c) / (D + d + 2 * c); t = (P * D) / (2 * (S * E * W + P * Y)); }
  const tc = t + c, tm = tn * (1 - s.mt / 100);
  const mawp = mawpKpa({ D, tn, c, mt: s.mt, S, E, W, Y });
  const mawpNew = mawpKpa({ D, tn, c: 0, mt: s.mt, S, E, W, Y });

  // corrosion: metal that can be lost before t is reached
  const lossAllow = tm - t;
  const life = s.rate > 0 ? lossAllow / s.rate : Infinity;

  // 345.4.2 hydrotest at ambient (S_T at 38 °C); stress on minimum wall vs SMYS
  const ST = allowable(s.mat, 15) * KPA_PER_KSI;
  const ratio = Math.min(6.5, ST / S);
  const pTest = 1.5 * P * ratio;
  const sigmaTest = (pTest * D) / (2 * tm);              // kPa
  const smys = m.smys * KPA_PER_KSI;

  const flange = flangeKpa(s.cls, s.t);

  // schedule table for the chart
  const scheds = WALLS_MM[s.nps].map(([sch, w]) => ({ sch, w, mawp: mawpKpa({ D, tn: w, c, mt: s.mt, S, E, W, Y: yCoeff(m.form, s.t) }) }));
  const lightest = scheds.find((x) => x.mawp >= P);

  // burst at specified minimum tensile (approx. SMYS / 0.6 for these grades)
  const burst = (2 * (m.smys / 0.6) * KPA_PER_KSI * tm) / D;

  return {
    m, D, tn, d: D - 2 * tn, Sksi, S, Y, thick, t, tc, tm, mawp, mawpNew, lossAllow, life,
    ST, ratio, pTest, sigmaTest, smys, flange, scheds, lightest, util: tc / tm, burst,
    hoop: (P * D) / (2 * tm),
    fx: {
      thin: tc > tm,
      over: P > mawp,
      burst: P > burst,
      yieldTest: sigmaTest > smys,
      cold: s.t < m.mdmt,
    },
  };
}

export function checks(s, r) {
  const out = [];
  const add = (id, label, value, limit, kind, sev, extra = {}) => out.push({ id, label, value, limit, kind, sev, ...extra });
  add("wall", "t + c ≤ t_m · 304.1.2", r.tc, r.tm, "mm", r.tc > r.tm ? "bad" : "ok");
  add("mawp", "Design ≤ MAWP", s.p, r.mawp, "kpa", s.p > r.mawp ? "bad" : "ok");
  add("dsix", "t < D/6 · 304.1.1", r.t, r.D / 6, "mm", r.thick ? "warn" : "ok");
  add("flange", `Class ${s.cls} · B16.5`, s.p, r.flange, "kpa", s.p > r.flange ? "bad" : "ok");
  add("test", "Hydrotest stress ≤ SMYS", r.sigmaTest, r.smys, "stress", r.fx.yieldTest ? "bad" : r.sigmaTest > 0.9 * r.smys ? "warn" : "ok");
  add("mdmt", `MDMT · ${r.m.name}`, s.t, r.m.mdmt, "degC", r.fx.cold ? "bad" : "ok");
  if (s.rate > 0) add("life", "Corrosion life", r.life, 20, "years", r.life < 10 ? "bad" : r.life < 20 ? "warn" : "ok");
  return out;
}

export function status(r, list) {
  if (r.fx.burst) return ["bad", "Burst"];
  if (r.fx.thin) return ["bad", "Wall too thin"];
  const bad = list.filter((c) => c.sev === "bad"), warn = list.filter((c) => c.sev === "warn");
  if (bad.length) return ["bad", `${bad.length} ${bad.length > 1 ? "checks fail" : "check fails"}`];
  if (warn.length) return ["warn", `${warn.length} ${warn.length > 1 ? "warnings" : "warning"}`];
  return ["good", "Schedule OK"];
}
