// Liquid Line Sizing — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { NPS, SCHEDULES, MATERIALS, FLANGE, npsLabel } from "../../lib/pipe.js";
import { FITTINGS } from "../../lib/hydraulics.js";
import { q, num, fixed } from "../../lib/format.js";
import { toDisplay, unit } from "../../lib/units.js";

const CMP = { design: "≤", mawp: "≤", flange: "≤", surge: "≤", erosional: "<", velocity: "≤", flash: ">", freeze: ">", mdmt: "≥" };

export default {
  id: "liquid-line-sizing",
  code: "PIP-02",
  name: "Liquid Line Sizing",
  category: "Piping",
  source: "Liquid Line Sizing.xls",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  scene,
  alerts: [["rupture", "Rupture"], ["leak", "Flange leak"], ["overstress", "Overstressed"], ["stall", "ΔP exceeds inlet pressure"],
    ["flash", "Flashing: P₂ below vapour pressure"], ["surge", "Surge exceeds B31.3 occasional limit"], ["freeze", "Freezing"],
    ["shake", "Above erosional velocity"]],

  inputs: [
    { title: "Process", fields: [
      { id: "q", label: "Flow", kind: "liqFlow" },
      { id: "p", label: "P₁", kind: "pressG" },
      { id: "t", label: "Temperature", kind: "tempC" },
      { id: "len", label: "Length", kind: "lengthM" },
      { id: "dh", label: "Elevation ΔH", kind: "lengthM" },
      { id: "other", label: "Other ΔP", kind: "dpKpa" },
    ] },
    { title: "Fluid", fields: [
      { id: "rho", label: "Density", kind: "densKg" },
      { id: "mu", label: "μ", kind: "none", unit: "cP" },
      { id: "pv", label: "Pv", kind: "pressA" },
      { id: "kb", label: "Bulk modulus", kind: "modGpa" },
      { id: "tf", label: "Freeze / pour", kind: "tempC" },
    ] },
    { title: "Pipe", fields: [
      { id: "service", label: "Service", options: Object.entries(calc.SERVICES).map(([k, v]) => [k, v.label]) },
      { id: "nps", label: "NPS", options: NPS.map((n) => [n, `${npsLabel(n)}"`]), number: true },
      { id: "sch", label: "Schedule", options: Object.entries(SCHEDULES) },
      { id: "red", label: "Reducer", options: [["none", "None"], ["exp", "Expansion"], ["con", "Contraction"]] },
      { id: "redNps", label: "Small end", options: NPS.map((n) => [n, `${npsLabel(n)}"`]), number: true },
      { id: "mat", label: "Material", options: Object.entries(MATERIALS).map(([k, m]) => [k, m.name]) },
      { id: "cls", label: "Flange", options: Object.keys(FLANGE).map((k) => [k, `Class ${k}`]) },
    ] },
    { title: "Fittings", fields: FITTINGS.map((f) => ({ id: f.id, label: f.label, kind: "count", int: true })) },
    { title: "Design", fields: [
      { id: "dp", label: "Design P", kind: "pressG" },
      { id: "mdmt", label: "MDMT", kind: "tempC" },
      { id: "ca", label: "CA", kind: "thickMm" },
      { id: "patm", label: "P atm", kind: "pressA" },
    ] },
  ],

  examples: [
    ["Base case", {}],
    ["Pump discharge", { service: "discharge", q: 2668, p: 6895, dp: 9930, cls: "600", nps: 6, sch: "80", len: 100, entry: 0, gate: 2, check: 1 }],
    ["High velocity", { nps: 1.5, sch: "80" }],
    ["Water hammer", { service: "discharge", q: 4000, p: 6895, dp: 7500, cls: "600", nps: 6 }],
    ["Flashing", { rho: 850, mu: 4.5, pv: 95, p: 5, len: 60, nps: 3 }],
    ["Freezing", { t: -15 }],
    ["Rupture", { p: 45000 }],
  ],

  context(s, sys) {
    const f = q("liqFlow", sys, s.q, 0);
    return `NPS ${npsLabel(s.nps)} Sch ${s.sch} · ${f.v} ${f.u} · ${calc.SERVICES[s.service].label}`;
  },

  kpis(r, sys) {
    const v = q("velocity", sys, r.V), dp = q("dp100", sys, r.dp100), tot = q("dpPsi", sys, r.dpTotal);
    const vt = r.V >= r.Ve ? "bad" : r.V > r.sv.max || r.V < r.sv.min ? "warn" : "";
    return [
      { label: "Velocity", v: v.v, u: v.u, tone: vt },
      { label: "ΔP", v: dp.v, u: dp.u },
      { label: "Total ΔP", v: tot.v, u: tot.u, tone: r.fx.flash ? "bad" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      const dg = c.kind === "psig" || c.kind === "psia" ? (sys === "metric" ? 0 : 1) : undefined;
      const a = q(c.kind, sys, c.value, dg), b = q(c.kind, sys, c.limit, dg);
      let lim = `${CMP[c.id]} ${b.v}`;
      if (c.id === "velocity" && c.min > 0) lim = `${q("velocity", sys, c.min, 1).v} – ${q("velocity", sys, c.limit, 1).v}`;
      return { label: c.label, val: c.note || a.v, lim, u: a.u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    const rows = [
      ["ID", q("inch", sys, r.dIn, sys === "metric" ? 1 : 3)],
      ["Wall", q("inch", sys, r.tn, sys === "metric" ? 2 : 3)],
      ["Mass flow", q("massFlow", sys, r.W)],
      ["Fittings Leq", q("lengthFt", sys, r.leqFt)],
      ["Friction ΔP", q("dpPsi", sys, r.dpFric)],
      ["Static ΔP", q("dpPsi", sys, r.dpStatic)],
    ];
    if (s.red !== "none") rows.push(["Reducer ΔP", q("dpPsi", sys, r.dpRed)], ["Reducer K", { v: fixed(r.Kred, 3), u: "", mono: true }]);
    rows.push(
      ["P₂", r.P2 > 0 ? q("psig", sys, r.p2g) : { v: "—", u: "" }],
      ["Vₑ", q("velocity", sys, r.Ve)],
      ["Wave speed", q("speedMs", sys, r.a)],
      ["Surge ΔP", q("dpPsi", sys, r.surgePsi)],
      ["MAWP", q("psig", sys, r.mawpPsig)],
      ["Burst", q("psig", sys, r.burstPsig)],
      ["Re", { v: fixed(r.Re, 0), u: "", mono: true }],
      ["f", { v: fixed(r.f, 4), u: "", mono: true }],
    );
    return rows;
  },

  chart(s, r, sys) {
    const k = toDisplay("velocity", sys, 1), uv = unit("velocity", sys);
    const rows = calc.velocityByNps(s).map((d) => ({ n: d.nps, v: d.V * k, ve: d.Ve * k }));
    const ve = rows[0].ve, lim = r.sv.max * k, lo = r.sv.min * k;
    const top = Math.max(lim, ve) * 1.15;
    const W = 384, H = 160, L = 34, T = 12, B = 24, Rr = 4;
    const pw = W - L - Rr, ph = H - T - B, bw = pw / rows.length;
    const y = (v) => T + ph - (Math.min(v, top) / top) * ph;
    const txt = (x, yy, t, o = "") => `<text x="${x}" y="${yy}" ${o}>${t}</text>`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocity by pipe size, ${uv}" class="bars">`;
    for (const t of niceTicks(top)) {
      svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}"/>`;
      svg += txt(L - 6, y(t) + 4, t, `class="tick" text-anchor="end"`);
    }
    rows.forEach((d, i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6, sel = d.n === s.nps, h = T + ph - y(d.v);
      svg += `<g class="bar${sel ? " sel" : ""}" data-nps="${d.n}" tabindex="0" role="button" aria-label="NPS ${npsLabel(d.n)}: ${num(d.v)} ${uv}">`;
      svg += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}"/>`;
      svg += `<rect class="b" x="${x}" y="${y(d.v)}" width="${w}" height="${Math.max(h, 1)}" rx="2"/>`;
      if (sel) svg += txt(x + w / 2, Math.max(y(d.v) - 5, 9), (d.v > top ? ">" : "") + num(Math.min(d.v, top)), `class="val" text-anchor="middle"`);
      svg += txt(x + w / 2, H - 6, `${npsLabel(d.n)}"`, `class="cat" text-anchor="middle"`);
      svg += `</g>`;
    });
    const yl = y(lim), ye = y(ve), close = Math.abs(yl - ye) < 13;
    svg += `<line class="lim" x1="${L}" x2="${W - Rr}" y1="${yl}" y2="${yl}"/>`;
    svg += txt(W - Rr, yl - 4, fixed(lim, 1), `class="lim-t" text-anchor="end"`);
    if (lo > 0) {
      svg += `<line class="lim" x1="${L}" x2="${W - Rr}" y1="${y(lo)}" y2="${y(lo)}"/>`;
      svg += txt(W - Rr, y(lo) - 4, fixed(lo, 1), `class="lim-t" text-anchor="end"`);
    }
    svg += `<line class="ero" x1="${L}" x2="${W - Rr}" y1="${ye}" y2="${ye}"/>`;
    svg += txt(close ? L + 4 : W - Rr, ye - 4, `Vₑ ${fixed(ve, 1)}`, `class="ero-t" text-anchor="${close ? "start" : "end"}"`);
    return { svg: svg + `</svg>`, caption: uv };
  },

  footnote: "ε = 0.046 mm · Hooper 2-K · ASME B36.10M, B31.3, B16.5 · API RP 14E",

  equations: [
    { label: "Velocity", tex: String.raw`V = \frac{Q}{3600\,A}, \qquad A = \frac{\pi}{4}\left(\frac{d}{12}\right)^{2}, \qquad W = Q\,\rho` },
    { label: "Reynolds number", tex: String.raw`Re = \frac{123.9\,d\,V\,\rho}{\mu}` },
    { label: "Friction factor (Colebrook)", tex: String.raw`\frac{1}{\sqrt{f}} = -2\log\!\left(\frac{\varepsilon}{3.7\,d} + \frac{2.51}{Re\,\sqrt{f}}\right), \qquad f_{lam} = \frac{64}{Re}` },
    { label: "Pressure drop", tex: String.raw`\Delta P_{100} = \frac{3.36\times10^{-4}\,f\,W^{2}}{d^{5}\,\rho}` },
    { label: "Fittings (Hooper 2-K)", tex: String.raw`K = \frac{K_{1}}{Re} + K_{\infty}\left(1 + \frac{1}{d}\right), \qquad L_{eq} = \frac{K\,d}{12\,f}` },
    { label: "Reducer", tex: String.raw`K_{exp} = \left(1-\beta^{2}\right)^{2}, \qquad K_{con} = 0.5\left(1-\beta^{2}\right)` },
    { label: "Reducer loss", tex: String.raw`\Delta P_{r} = \frac{K\,\rho\,V_{s}^{2}}{2\,g_{c}\,144}, \qquad \beta = \frac{d_{s}}{d_{l}}` },
    { label: "Static head", tex: String.raw`\Delta P_{s} = \frac{\rho\,\Delta H}{144}` },
    { label: "Total", tex: String.raw`\Delta P = \Delta P_{100}\,\frac{L + L_{eq}}{100} + \Delta P_{r} + \Delta P_{s} + \Delta P_{o}` },
    { label: "Erosional velocity", tex: String.raw`V_{e} = \frac{C}{\sqrt{\rho}}` },
    { label: "Wave speed", tex: String.raw`a = \sqrt{\frac{K_{b}/\rho}{1 + \dfrac{K_{b}\,D}{E\,e}}}` },
    { label: "Surge (Joukowsky)", tex: String.raw`\Delta P_{j} = \rho\,a\,V, \qquad P + \Delta P_{j} \le 1.33\,P_{a}` },
    { label: "Pipe MAWP", tex: String.raw`P_{a} = \frac{2\,S\,E\,W_{j}\,t_{m}}{D - 2\,Y\,t_{m}}, \qquad t_{m} = 0.875\,t_{n} - CA` },
  ],

  symbols: [
    [String.raw`Q`, "Actual flow", "ft³/h"],
    [String.raw`W`, "Mass flow", "lb/h"],
    [String.raw`\rho`, "Density", "lb/ft³"],
    [String.raw`\mu`, "Viscosity", "cP"],
    [String.raw`d,\;D`, "Inside, outside diameter", "in"],
    [String.raw`\varepsilon`, "Roughness, 0.0018", "in"],
    [String.raw`L,\;\Delta H`, "Length, elevation rise", "ft"],
    [String.raw`K_{1},\;K_{\infty}`, "Hooper constants", "—"],
    [String.raw`K_{b}`, "Liquid bulk modulus", "Pa"],
    [String.raw`E,\;e`, "Steel modulus 200 GPa, wall", "Pa, m"],
    [String.raw`a`, "Pressure-wave speed", "m/s"],
    [String.raw`C`, "Erosional constant, 100", "—"],
    [String.raw`S,\;Y`, "Allowable stress, 0.4", "psi, —"],
  ],
};

function niceTicks(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
