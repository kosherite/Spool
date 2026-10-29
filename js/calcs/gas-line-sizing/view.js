// Gas Line Sizing — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { NPS, SCHEDULES, MATERIALS, FLANGE, npsLabel } from "../../lib/pipe.js";
import { q, num, fixed } from "../../lib/format.js";
import { toDisplay, unit } from "../../lib/units.js";

const CMP = { design: "≤", mawp: "≤", flange: "≤", erosional: "<", velocity: "≤", mach: "<", dp: "≤", hydrate: "<", mdmt: "≥" };

export default {
  id: "gas-line-sizing",
  code: "PIP-01",
  name: "Gas Line Sizing",
  category: "Piping",
  source: "Gas Line Sizing.xls",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  scene,

  inputs: [
    { title: "Process", fields: [
      { id: "q", label: "Flow", kind: "stdFlow" },
      { id: "p", label: "Pressure", kind: "pressG" },
      { id: "t", label: "Temperature", kind: "tempC" },
      { id: "len", label: "Length", kind: "lengthM" },
    ] },
    { title: "Gas", fields: [
      { id: "mw", label: "MW", kind: "none", unit: "g/mol" },
      { id: "z", label: "z", kind: "none" },
      { id: "k", label: "k", kind: "none" },
      { id: "mu", label: "μ", kind: "none", unit: "cP" },
    ] },
    { title: "Pipe", fields: [
      { id: "nps", label: "NPS", options: NPS.map((n) => [n, `${npsLabel(n)}"`]), number: true },
      { id: "sch", label: "Schedule", options: Object.entries(SCHEDULES) },
      { id: "mat", label: "Material", options: Object.entries(MATERIALS).map(([k, m]) => [k, m.name]) },
      { id: "cls", label: "Flange", options: Object.keys(FLANGE).map((k) => [k, `Class ${k}`]) },
    ] },
    { title: "Design", fields: [
      { id: "dp", label: "Design P", kind: "pressG" },
      { id: "mdmt", label: "MDMT", kind: "tempC" },
      { id: "ca", label: "CA", kind: "thickMm" },
      { id: "patm", label: "P atm", kind: "pressA" },
    ] },
  ],

  examples: [
    ["Base case", {}],
    ["High velocity", { nps: 1.5, sch: "80" }],
    ["Choked", { q: 30, nps: 1, sch: "80" }],
    ["Hydrates", { q: 150, p: 6900, t: 5, dp: 9930, cls: "600", sch: "80" }],
    ["Flange leak", { p: 3500, t: 30 }],
    ["Rupture", { p: 45000, t: 40 }],
    ["Cold service", { mdmt: -45 }],
  ],

  context(s, sys) {
    const f = q("stdFlow", sys, s.q);
    return `NPS ${npsLabel(s.nps)} Sch ${s.sch} · ${f.v} ${f.u}`;
  },

  kpis(r, sys) {
    const v = q("velocity", sys, r.V), dp = q("dp100", sys, r.dp100);
    const pct = (r.V / r.Ve) * 100;
    return [
      { label: "Velocity", v: v.v, u: v.u, tone: r.V >= r.Ve ? "bad" : r.V > calc.V_LIMIT_FTS ? "warn" : "" },
      { label: "ΔP", v: dp.v, u: dp.u },
      { label: "V / Vₑ", v: fixed(pct, 0), u: "%", tone: pct >= 100 ? "bad" : pct >= 80 ? "warn" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      let val, lim, u = "";
      if (c.kind === "pct") { val = fixed(c.value * 100, 1); lim = fixed(c.limit * 100, 0); u = "%"; }
      else if (c.kind === "none") { val = fixed(c.value, 2); lim = fixed(c.limit, 1); }
      else {
        const dg = c.kind === "psig" ? 0 : undefined;
        const a = q(c.kind, sys, c.value, dg), b = q(c.kind, sys, c.limit, dg);
        val = a.v; lim = b.v; u = a.u;
      }
      if (c.note) val = c.note;
      return { label: c.label, val, lim: `${CMP[c.id]} ${lim}`, u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    const rows = [
      ["ID", q("inch", sys, r.dIn, sys === "metric" ? 1 : 3)],
      ["Wall", q("inch", sys, r.tn, sys === "metric" ? 2 : 3)],
      ["Density", q("density", sys, r.rho)],
      ["Mass flow", q("massFlow", sys, r.W)],
      ["Actual flow", q("actFlow", sys, r.acfs * 3600)],
      ["Line ΔP", q("dpPsi", sys, r.dpLine)],
      ["P₂", r.p2abs > 0 ? q("psig", sys, r.p2g) : { v: "—", u: "" }],
      ["Vₑ", q("velocity", sys, r.Ve)],
      ["Sonic", q("velocity", sys, r.c)],
      ["MAWP", q("psig", sys, r.mawpPsig)],
      ["Burst", q("psig", sys, r.burstPsig)],
      ["Re", { v: fixed(r.Re, 0), u: "", mono: true }],
      ["f", { v: fixed(r.f, 4), u: "", mono: true }],
      ["Ma", { v: fixed(r.Ma, 3), u: "", mono: true }],
    ];
    return rows;
  },

  /** Velocity for each NPS in the selected schedule, as an SVG string. */
  chart(s, r, sys) {
    const k = toDisplay("velocity", sys, 1), uv = unit("velocity", sys);
    const rows = calc.velocityByNps(s).map((d) => ({ n: d.nps, v: d.V * k, ve: d.Ve * k }));
    const ve = rows[0].ve, lim = calc.V_LIMIT_FTS * k;
    const top = Math.max(lim, ve) * 1.15;
    const W = 384, H = 160, L = 34, B = 24, T = 12, Rr = 4;
    const pw = W - L - Rr, ph = H - T - B, bw = pw / rows.length;
    const y = (v) => T + ph - (Math.min(v, top) / top) * ph;
    const ticks = niceTicks(top);
    const txt = (x, yy, t, o = "") => `<text x="${x}" y="${yy}" ${o}>${t}</text>`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocity by pipe size, ${uv}" class="bars">`;
    for (const t of ticks) {
      svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}"/>`;
      svg += txt(L - 6, y(t) + 4, t, `class="tick" text-anchor="end"`);
    }
    rows.forEach((d, i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6, sel = d.n === s.nps, h = T + ph - y(d.v);
      svg += `<g class="bar${sel ? " sel" : ""}" data-nps="${d.n}" tabindex="0" role="button" aria-label="NPS ${npsLabel(d.n)}: ${num(d.v)} ${uv}">`;
      svg += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}"/>`;
      svg += `<rect class="b${d.v >= d.ve ? " over" : ""}" x="${x}" y="${y(d.v)}" width="${w}" height="${Math.max(h, 1)}" rx="2"/>`;
      if (sel) svg += txt(x + w / 2, Math.max(y(d.v) - 5, 9), (d.v > top ? ">" : "") + num(Math.min(d.v, top)), `class="val" text-anchor="middle"`);
      svg += txt(x + w / 2, H - 6, `${npsLabel(d.n)}"`, `class="cat" text-anchor="middle"`);
      svg += `</g>`;
    });
    const yl = y(lim), ye = y(ve), close = Math.abs(yl - ye) < 13;
    svg += `<line class="lim" x1="${L}" x2="${W - Rr}" y1="${yl}" y2="${yl}"/>`;
    svg += txt(W - Rr, yl - 4, fixed(lim, 0), `class="lim-t" text-anchor="end"`);
    svg += `<line class="ero" x1="${L}" x2="${W - Rr}" y1="${ye}" y2="${ye}"/>`;
    svg += txt(close ? L + 4 : W - Rr, ye - 4, `Vₑ ${fixed(ve, 0)}`, `class="ero-t" text-anchor="${close ? "start" : "end"}"`);
    return { svg: svg + `</svg>`, caption: uv };
  },

  footnote: "Std. 15 °C, 101.325 kPa · ε = 0.046 mm · ASME B36.10M, B31.3, B16.5 · API RP 14E",

  equations: [
    { label: "Density", tex: String.raw`\rho = \frac{P\,M}{z\,R\,T}` },
    { label: "Mass flow", tex: String.raw`W = \frac{Q_{s}\,M}{379.5}` },
    { label: "Velocity", tex: String.raw`V = \frac{W}{3600\,\rho\,A}, \qquad A = \frac{\pi}{4}\left(\frac{d}{12}\right)^{2}` },
    { label: "Reynolds number", tex: String.raw`Re = \frac{123.9\,d\,V\,\rho}{\mu}` },
    { label: "Friction factor, turbulent", tex: String.raw`f = 0.0055\left[1 + \left(2\times10^{4}\,\frac{\varepsilon}{d} + \frac{10^{6}}{Re}\right)^{1/3}\right]` },
    { label: "Friction factor, laminar", tex: String.raw`f = \frac{64}{Re}, \qquad Re < 2000` },
    { label: "Pressure drop", tex: String.raw`\Delta P_{100} = \frac{3.36\times10^{-4}\,f\,W^{2}}{d^{5}\,\rho}` },
    { label: "Erosional velocity", tex: String.raw`V_{e} = \frac{C}{\sqrt{\rho}}` },
    { label: "Sonic velocity", tex: String.raw`c = \sqrt{\frac{k\,g_{c}\,R_{u}\,T}{M}}, \qquad Ma = \frac{V}{c}` },
    { label: "Pipe MAWP", tex: String.raw`P_{a} = \frac{2\,S\,E\,W_{j}\,t_{m}}{D - 2\,Y\,t_{m}}` },
    { label: "Minimum wall", tex: String.raw`t_{m} = 0.875\,t_{n} - CA` },
    { label: "Burst", tex: String.raw`P_{b} = \frac{2\,S_{u}\,(0.875\,t_{n})}{D}` },
    { label: "Hydrate temperature (Motiee)", tex: String.raw`\begin{aligned} T_{h} = {}& -238.24 + 79.00\,\log P - 5.353\,(\log P)^{2} \\ & + 349.47\,\gamma - 150.85\,\gamma^{2} - 27.60\,\gamma\log P \end{aligned}` },
  ],

  symbols: [
    [String.raw`P`, "Pressure", "psia"],
    [String.raw`T,\;T_{h}`, "Temperature", "°R, °F"],
    [String.raw`M`, "Molecular weight", "lb/lbmol"],
    [String.raw`z`, "Compressibility", "—"],
    [String.raw`R`, "10.73", "psia·ft³/lbmol·°R"],
    [String.raw`Q_{s}`, "Standard flow", "scf/h"],
    [String.raw`d`, "Inside diameter", "in"],
    [String.raw`D`, "Outside diameter", "in"],
    [String.raw`\mu`, "Viscosity", "cP"],
    [String.raw`\varepsilon`, "Roughness, 0.0018", "in"],
    [String.raw`C`, "Erosional constant, 100", "—"],
    [String.raw`S,\;S_{u}`, "Allowable, tensile", "psi"],
    [String.raw`E,\;W_{j},\;Y`, "1.0, 1.0, 0.4", "—"],
    [String.raw`\gamma`, "Gas gravity", "—"],
  ],
};

function niceTicks(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
