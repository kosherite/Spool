// Flowline Sizing — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { GRADES, SERVICES } from "../../lib/csa-z662.js";
import { q, num, fixed } from "../../lib/format.js";
import { toDisplay, unit } from "../../lib/units.js";

const CMP = { design: "≤", z662: "≤", rating: "≤", erosional: "<", velocity: "≤", dp: "≤", hydrate: "<" };

export default {
  id: "flowline-sizing",
  code: "PIP-04",
  name: "Flowline Sizing",
  category: "Piping",
  source: "_Flowline Sizing.xlsx",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  scene,
  alerts: [["rupture", "Rupture"], ["overstress", "Above pipe rating"], ["stall", "ΔP exceeds inlet pressure"],
    ["shake", "Above erosional velocity"], ["hydrate", "Hydrates forming"]],

  inputs: [
    { title: "Rates", fields: [
      { id: "qg", label: "Gas", kind: "stdFlow" },
      { id: "qo", label: "Oil / condensate", kind: "liqFlow" },
      { id: "qw", label: "Water", kind: "liqFlow" },
    ] },
    { title: "Line", fields: [
      { id: "p", label: "P₁", kind: "pressG" },
      { id: "t", label: "Temperature", kind: "tempC" },
      { id: "len", label: "Length", kind: "lengthKm" },
      { id: "dh", label: "Elevation ΔH", kind: "lengthM" },
    ] },
    { title: "Fluids", fields: [
      { id: "sg", label: "Gas SG", kind: "none" },
      { id: "z", label: "z", kind: "none" },
      { id: "mug", label: "μ gas", kind: "none", unit: "cP" },
      { id: "sig", label: "σ", kind: "none", unit: "mN/m" },
      { id: "rhoo", label: "Oil density", kind: "densKg" },
      { id: "rhow", label: "Water density", kind: "densKg" },
      { id: "muo", label: "μ oil", kind: "none", unit: "cP" },
      { id: "muw", label: "μ water", kind: "none", unit: "cP" },
    ] },
    { title: "Pipe", fields: [
      { id: "od", label: "OD", kind: "thickMm" },
      { id: "wt", label: "Wall", kind: "thickMm" },
      { id: "mat", label: "Material", options: Object.entries(calc.MATERIALS).map(([k, m]) => [k, m.name]) },
      { id: "grade", label: "Grade", options: Object.keys(GRADES).map((k) => [k, `Gr ${k}`]) },
      { id: "service", label: "Service", options: Object.entries(SERVICES) },
      { id: "locClass", label: "Class location", options: [1, 2, 3, 4].map((n) => [n, `Class ${n}`]), number: true },
      { id: "rating", label: "Mfr rating", kind: "pressG" },
      { id: "ca", label: "CA", kind: "thickMm" },
    ] },
    { title: "Limits", fields: [
      { id: "dp", label: "Design P", kind: "pressG" },
      { id: "cErosion", label: "C factor", kind: "none" },
      { id: "dpAllow", label: "ΔP allow", kind: "dp100In" },
      { id: "vAllow", label: "V allow", kind: "speedIn" },
      { id: "patm", label: "P atm", kind: "pressA" },
    ] },
  ],

  examples: [
    ["Base case", {}],
    ["Gas only", { qg: 113, qo: 0, qw: 0, p: 750, t: 25, od: 168.3, wt: 5.54, len: 1, dh: 0, dpAllow: 5, vAllow: 10 }],
    ["Emulsion", { qg: 0, qo: 40, qw: 160, muo: 50, od: 88.9, wt: 5.49, p: 1500, len: 3, dh: 20 }],
    ["Slug", { qg: 6, qo: 55, qw: 495, od: 88.9, wt: 5.49, p: 689, t: 20, sg: 0.897, z: 0.98, rhoo: 850, rhow: 1130, muo: 1.41, muw: 1.41, len: 0.5, dh: 0 }],
    ["Long gas line", { qg: 50, qo: 0, qw: 0, p: 1500, len: 10, dh: 30 }],
    ["Composite", { mat: "spool", rating: 10340, dp: 9930 }],
    ["Sour, class 3", { service: "sour", locClass: 3, dp: 20000 }],
    ["Rupture", { p: 80000 }],
  ],

  context(s) {
    return `${fixed(s.od, 1)} × ${fixed(s.wt, 2)} mm · ${calc.MATERIALS[s.mat].name} · ${calc.PHASE_NAMES[calc.phaseOf(s)]}`;
  },

  kpis(r, sys) {
    const v = q("velocity", sys, r.Vmax), dp = q("dp100", sys, r.dpPer100), p2 = q("psig", sys, r.p2g);
    return [
      { label: "Max velocity", v: v.v, u: v.u, tone: r.fx.shake ? "bad" : "" },
      { label: "ΔP", v: dp.v, u: dp.u },
      { label: "P₂", v: r.fx.stall ? "—" : p2.v, u: p2.u, tone: r.fx.stall ? "bad" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      if (c.kind === "text") return { label: c.label, val: c.text, lim: "Not slug", u: "", sev: c.sev };
      const dg = c.kind === "psig" ? (sys === "metric" ? 0 : 1) : undefined;
      const a = q(c.kind, sys, c.value, dg), b = q(c.kind, sys, c.limit, dg);
      const lim = Number.isFinite(c.limit) ? `${CMP[c.id]} ${b.v}` : "Not set";
      return { label: c.label, val: c.note || a.v, lim, u: a.u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    const rows = [
      ["ID", q("inch", sys, r.dIn, sys === "metric" ? 1 : 3)],
      ["Phase", { v: r.phaseName, u: "" }],
    ];
    if (r.phase === "2") rows.push(["Regime", { v: r.patName, u: "" }], ["H_L", { v: fixed(r.HL, 3), u: "", mono: true }]);
    rows.push(
      ["V inlet", q("velocity", sys, r.V1)],
      ["V outlet", r.fx.stall ? { v: "—", u: "" } : q("velocity", sys, r.V2)],
      ["ρ inlet", q("density", sys, r.rho1)],
      ["Vₑ outlet", q("velocity", sys, r.Ve2)],
      ["Line ΔP", q("dpPsi", sys, r.dpLine)],
      ["Re", { v: fixed(r.Re, 0), u: "", mono: true }],
      ["f", { v: fixed(r.f, 4), u: "", mono: true }],
    );
    if (r.phase === "G") rows.push(["Ma outlet", { v: fixed(r.Mach, 3), u: "", mono: true }]);
    if (r.mat.steel) rows.push(["Z662 design", q("psig", sys, r.ratingPsig)], ["Burst", q("psig", sys, (r.burstMpa * 1000) / 6.894757)]);
    return rows;
  },

  /** Pressure along the line. */
  chart(s, r, sys) {
    const kx = sys === "metric" ? 1 / 3280.84 : 1 / 5280, ux = sys === "metric" ? "km" : "mi";
    const pts = r.prof.map((p) => ({ x: p.x * kx, P: toDisplay("psig", sys, p.P - s.patm / 6.894757) }));
    const up = unit("psig", sys);
    const W = 384, H = 160, L = 46, T = 14, B = 24, Rr = 8;
    const pw = W - L - Rr, ph = H - T - B;
    const xMax = (r.lenFt * kx) || 1;
    const pMax = Math.max(...pts.map((p) => p.P)), pLow = Math.min(...pts.map((p) => p.P));
    const pMin = (pMax - pLow) / Math.max(1e-9, Math.abs(pMax)) < 0.3 ? Math.max(0, pLow - (pMax - pLow) * 1.5 - 1e-6) : Math.min(0, pLow);
    const yTop = pMax + (pMax - pMin) * 0.08 || 1;
    const X = (x) => L + (x / xMax) * pw, Y = (v) => T + ph - ((v - pMin) / (yTop - pMin)) * ph;
    const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" ${o}>${t}</text>`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pressure along the line, ${up}" class="bars">`;
    const yt = niceTicks(pMin, yTop), xt = niceTicks(0, xMax);
    for (const t of yt.v) {
      svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      svg += txt(L - 6, Y(t) + 4, fixed(t, yt.d), `class="tick" text-anchor="end"`);
    }
    for (const t of xt.v) svg += txt(X(t), H - 6, fixed(t, xt.d), `class="cat" text-anchor="middle"`);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.P).toFixed(1)}`).join("");
    svg += `<path d="${d}L${X(pts[pts.length - 1].x).toFixed(1)},${Y(pMin)}L${X(0)},${Y(pMin)}Z" class="area"/>`;
    svg += `<path d="${d}" class="pline"/>`;
    const a = pts[0], b = pts[pts.length - 1];
    svg += `<circle cx="${X(a.x)}" cy="${Y(a.P)}" r="3.5" class="pdot"/><circle cx="${X(b.x)}" cy="${Y(b.P)}" r="3.5" class="pdot end"/>`;
    svg += txt(X(b.x) - 4, Y(b.P) - 8, num(b.P), `class="val" text-anchor="end"`);
    return { svg: svg + `</svg>`, caption: `${up} vs ${ux}`, title: "Pressure along line" };
  },

  footnote: "Gas: isothermal equation · liquid: Darcy · two-phase: Beggs & Brill, 40 segments · CSA Z662 cl. 4.3.6 · API RP 14E",

  equations: [
    { label: "Gas, isothermal", tex: String.raw`P_{1}^{2} - P_{2}^{2} = \frac{f\,G^{2}\,Z\,R_{u}\,T\,L}{g_{c}\,D\,M}, \qquad G = \frac{W}{A}` },
    { label: "Liquid, Darcy", tex: String.raw`\Delta P = \frac{f\,L\,\rho\,V^{2}}{2\,g_{c}\,D} + \rho\,\frac{g}{g_{c}}\,\Delta H` },
    { label: "Two-phase, per segment (Beggs & Brill)", tex: String.raw`\Delta P_{i} = \left[\frac{f_{tp}\,\rho_{n}\,v_{m}^{2}}{2\,g_{c}\,D} + \rho_{s}\,\frac{g}{g_{c}}\sin\theta\right]\Delta L_{i}` },
    { label: "Friction factor (Colebrook)", tex: String.raw`\frac{1}{\sqrt{f}} = -2\log\!\left(\frac{\varepsilon}{3.7\,D} + \frac{2.51}{Re\,\sqrt{f}}\right)` },
    { label: "Erosional velocity", tex: String.raw`V_{e} = \frac{C}{\sqrt{\rho_{m}}}` },
    { label: "CSA Z662 design pressure", tex: String.raw`P = \frac{2\,S\,t}{D}\times F \times L \times J \times T, \qquad t = t_{n} - CA` },
    { label: "Burst (Barlow)", tex: String.raw`P_{b} = \frac{2\,S_{u}\,t_{n}}{D}` },
  ],

  symbols: [
    [String.raw`P_{1},\;P_{2}`, "Inlet, outlet pressure", "psia"],
    [String.raw`G,\;W`, "Mass flux, mass flow", "lb/ft²·s, lb/s"],
    [String.raw`Z,\;M,\;T`, "Compressibility, mol. weight, temperature", "—, lb/lbmol, °R"],
    [String.raw`R_{u},\;g_{c}`, "1545.35, 32.174", "—"],
    [String.raw`D,\;L`, "Inside diameter, length", "ft"],
    [String.raw`\varepsilon`, "Roughness by material", "in"],
    [String.raw`S,\;S_{u}`, "SMYS, SMTS", "MPa"],
    [String.raw`F`, "Design factor, 0.8", "—"],
    [String.raw`L`, "Location factor, Table 4.2", "—"],
    [String.raw`J,\;T`, "Joint factor 1.0, temperature factor", "—"],
    [String.raw`C`, "Erosional constant", "—"],
  ],
};

function niceTicks(min, max) {
  const span = max - min || 1, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return { v: out, d: Math.max(0, -Math.floor(Math.log10(step))) };
}
