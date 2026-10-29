// 2-Phase Line Sizing — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { NPS, SCHEDULES, MATERIALS, FLANGE, npsLabel } from "../../lib/pipe.js";
import { q, num, fixed } from "../../lib/format.js";
import { toDisplay, unit } from "../../lib/units.js";

const CMP = { design: "≤", mawp: "≤", flange: "≤", erosional: "<", velocity: "≤", dp: "≤", hydrate: "<", mdmt: "≥" };

export default {
  id: "two-phase-line-sizing",
  code: "PIP-03",
  name: "2-Phase Line Sizing",
  category: "Piping",
  source: "2-Phase Line Sizing.xlsx",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  scene,
  alerts: [["rupture", "Rupture"], ["leak", "Flange leak"], ["overstress", "Overstressed"], ["stall", "ΔP exceeds inlet pressure"],
    ["shake", "Above erosional velocity"], ["hydrate", "Hydrates forming"]],

  inputs: [
    { title: "Rates", fields: [
      { id: "qg", label: "Gas", kind: "stdFlow" },
      { id: "qo", label: "Oil / condensate", kind: "liqFlow" },
      { id: "qw", label: "Water", kind: "liqFlow" },
    ] },
    { title: "Process", fields: [
      { id: "p", label: "P₁", kind: "pressG" },
      { id: "t", label: "Temperature", kind: "tempC" },
      { id: "len", label: "Length", kind: "lengthM" },
      { id: "dh", label: "Elevation ΔH", kind: "lengthM" },
    ] },
    { title: "Fluids", fields: [
      { id: "sg", label: "Gas SG", kind: "none" },
      { id: "z", label: "z", kind: "none" },
      { id: "rhoo", label: "Oil density", kind: "densKg" },
      { id: "rhow", label: "Water density", kind: "densKg" },
      { id: "mul", label: "μ liquid", kind: "none", unit: "cP" },
      { id: "mug", label: "μ gas", kind: "none", unit: "cP" },
      { id: "sig", label: "σ", kind: "none", unit: "mN/m" },
    ] },
    { title: "Pipe", fields: [
      { id: "nps", label: "NPS", options: NPS.map((n) => [n, `${npsLabel(n)}"`]), number: true },
      { id: "sch", label: "Schedule", options: Object.entries(SCHEDULES) },
      { id: "eps", label: "Roughness", kind: "thickMm" },
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
    ["Stratified", { qg: 1.5, qo: 5, qw: 25, nps: 4 }],
    ["Dispersed", { qg: 3, qo: 100, qw: 900 }],
    ["Uphill", { qg: 1.5, qo: 5, qw: 25, nps: 4, dh: 15 }],
    ["Erosional", { qg: 12, nps: 2, len: 30 }],
    ["Hydrates", { t: 2 }],
    ["Rupture", { p: 45000, t: 40 }],
  ],

  context(s, sys, r) {
    return `NPS ${npsLabel(s.nps)} Sch ${s.sch} · water cut ${fixed((s.qw / (s.qo + s.qw)) * 100, 0)}%`;
  },

  kpis(r, sys) {
    const v = q("velocity", sys, r.Vm), dp = q("dp100", sys, r.dp);
    return [
      { label: "Mixture velocity", v: v.v, u: v.u, tone: r.Vm >= r.Ve ? "bad" : r.Vm < calc.V_MIN_FTS || r.Vm > calc.V_MAX_FTS ? "warn" : "" },
      { label: "ΔP", v: dp.v, u: dp.u },
      { label: "Holdup", v: fixed(r.HL * 100, 0), u: `% · ${r.patName.toLowerCase()}`, tone: r.fx.slug ? "warn" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      if (c.kind === "text") return { label: c.label, val: c.text, lim: "Not slug", u: "", sev: c.sev };
      if (c.kind === "pct") return { label: c.label, val: fixed(c.value * 100, 1), lim: `≤ ${fixed(c.limit * 100, 0)}`, u: "%", sev: c.sev };
      const dg = c.kind === "psig" ? (sys === "metric" ? 0 : 1) : undefined;
      const a = q(c.kind, sys, c.value, dg), b = q(c.kind, sys, c.limit, dg);
      let lim = `${CMP[c.id]} ${b.v}`;
      if (c.id === "velocity") lim = `${q("velocity", sys, c.min, 1).v} – ${q("velocity", sys, c.limit, 0).v}`;
      return { label: c.label, val: c.note || a.v, lim, u: a.u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    return [
      ["ID", q("inch", sys, r.dIn, sys === "metric" ? 1 : 3)],
      ["Regime", { v: r.patName, u: "" }],
      ["v_SL", q("velocity", sys, r.VSL)],
      ["v_SG", q("velocity", sys, r.VSG)],
      ["λ_L", { v: fixed(r.lam, 3), u: "", mono: true }],
      ["H_L", { v: fixed(r.HL, 3), u: "", mono: true }],
      ["ρ no-slip", q("density", sys, r.rhoN)],
      ["ρ slip", q("density", sys, r.rhoS)],
      ["ρ gas", q("density", sys, r.rhoG)],
      ["ρ liquid", q("density", sys, r.rhoL)],
      ["Friction ΔP", q("dpPsi", sys, r.dpFricLine)],
      ["Elevation ΔP", q("dpPsi", sys, r.dpElevLine)],
      ["P₂", r.P2 > 0 ? q("psig", sys, r.p2g) : { v: "—", u: "" }],
      ["Vₑ", q("velocity", sys, r.Ve)],
      ["GLR", { v: fixed(r.glr, 0), u: "m³/m³" }],
      ["N_Fr", { v: fixed(r.NFr, 2), u: "", mono: true }],
      ["Re_n", { v: fixed(r.ReN, 0), u: "", mono: true }],
      ["f_tp", { v: fixed(r.ftp, 4), u: "", mono: true }],
      ["MAWP", q("psig", sys, r.mawpPsig)],
      ["Burst", q("psig", sys, r.burstPsig)],
    ];
  },

  chart(s, r, sys) {
    const k = toDisplay("velocity", sys, 1), uv = unit("velocity", sys);
    const rows = calc.velocityByNps(s).map((d) => ({ n: d.nps, v: d.V * k, ve: d.Ve * k, slug: d.pat === "int" || d.pat === "tr" }));
    const ve = rows[0].ve, lo = calc.V_MIN_FTS * k;
    const top = Math.max(ve, lo * 1.5) * 1.15;
    const W = 384, H = 160, L = 34, T = 12, B = 24, Rr = 4;
    const pw = W - L - Rr, ph = H - T - B, bw = pw / rows.length;
    const y = (v) => T + ph - (Math.min(v, top) / top) * ph;
    const txt = (x, yy, t, o = "") => `<text x="${x}" y="${yy}" ${o}>${t}</text>`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mixture velocity by pipe size, ${uv}" class="bars">`;
    for (const t of niceTicks(top)) {
      svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}"/>`;
      svg += txt(L - 6, y(t) + 4, t, `class="tick" text-anchor="end"`);
    }
    rows.forEach((d, i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6, sel = d.n === s.nps, h = T + ph - y(d.v);
      svg += `<g class="bar${sel ? " sel" : ""}" data-nps="${d.n}" tabindex="0" role="button" aria-label="NPS ${npsLabel(d.n)}: ${num(d.v)} ${uv}${d.slug ? ", slug" : ""}">`;
      svg += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}"/>`;
      svg += `<rect class="b" x="${x}" y="${y(d.v)}" width="${w}" height="${Math.max(h, 1)}" rx="2"/>`;
      if (d.slug) svg += `<circle class="slugdot" cx="${x + w / 2}" cy="${H - 20}" r="2.2"/>`;
      if (sel) svg += txt(x + w / 2, Math.max(y(d.v) - 5, 9), (d.v > top ? ">" : "") + num(Math.min(d.v, top)), `class="val" text-anchor="middle"`);
      svg += txt(x + w / 2, H - 6, `${npsLabel(d.n)}"`, `class="cat" text-anchor="middle"`);
      svg += `</g>`;
    });
    svg += `<line class="lim" x1="${L}" x2="${W - Rr}" y1="${y(lo)}" y2="${y(lo)}"/>`;
    svg += txt(W - Rr, y(lo) - 4, fixed(lo, 1), `class="lim-t" text-anchor="end"`);
    svg += `<line class="ero" x1="${L}" x2="${W - Rr}" y1="${y(ve)}" y2="${y(ve)}"/>`;
    svg += txt(W - Rr, y(ve) - 4, `Vₑ ${fixed(ve, 1)}`, `class="ero-t" text-anchor="end"`);
    return { svg: svg + `</svg>`, caption: `${uv} · • slug` };
  },

  footnote: "Beggs & Brill (1973) · API RP 14E · ASME B36.10M, B31.3, B16.5",

  equations: [
    { label: "Superficial velocities", tex: String.raw`v_{SL} = \frac{Q_{L}}{A}, \qquad v_{SG} = \frac{Q_{G}}{A}, \qquad v_{m} = v_{SL} + v_{SG}` },
    { label: "No-slip liquid fraction", tex: String.raw`\lambda_{L} = \frac{v_{SL}}{v_{m}}, \qquad \rho_{n} = \rho_{L}\lambda_{L} + \rho_{G}\left(1-\lambda_{L}\right)` },
    { label: "Froude and liquid velocity numbers", tex: String.raw`N_{Fr} = \frac{v_{m}^{2}}{g\,D}, \qquad N_{LV} = 1.938\,v_{SL}\left(\frac{\rho_{L}}{\sigma}\right)^{1/4}` },
    { label: "Pattern boundaries", tex: String.raw`L_{1} = 316\,\lambda_{L}^{0.302}, \quad L_{2} = 9.252\times10^{-4}\,\lambda_{L}^{-2.468}` },
    { label: "", tex: String.raw`L_{3} = 0.10\,\lambda_{L}^{-1.452}, \quad L_{4} = 0.5\,\lambda_{L}^{-6.738}` },
    { label: "Horizontal holdup", tex: String.raw`H_{L}(0) = \frac{a\,\lambda_{L}^{\,b}}{N_{Fr}^{\,c}} \ge \lambda_{L}` },
    { label: "Inclination correction", tex: String.raw`H_{L}(\theta) = H_{L}(0)\left[1 + C\left(\sin 1.8\theta - 0.333\sin^{3} 1.8\theta\right)\right]` },
    { label: "", tex: String.raw`C = \left(1-\lambda_{L}\right)\ln\!\left(e\,\lambda_{L}^{\,f}\,N_{LV}^{\,g}\,N_{Fr}^{\,h}\right) \ge 0` },
    { label: "Two-phase friction factor", tex: String.raw`f_{tp} = f_{n}\,e^{S}, \qquad y = \frac{\lambda_{L}}{H_{L}^{2}}` },
    { label: "", tex: String.raw`S = \frac{\ln y}{-0.0523 + 3.182\ln y - 0.8725\left(\ln y\right)^{2} + 0.01853\left(\ln y\right)^{4}}` },
    { label: "Pressure gradient", tex: String.raw`\frac{dP}{dL} = \frac{f_{tp}\,\rho_{n}\,v_{m}^{2}}{2\,g_{c}\,D} + \rho_{s}\,\frac{g}{g_{c}}\sin\theta, \qquad \rho_{s} = \rho_{L}H_{L} + \rho_{G}\left(1-H_{L}\right)` },
    { label: "Erosional velocity", tex: String.raw`V_{e} = \frac{C}{\sqrt{\rho_{n}}}` },
  ],

  symbols: [
    [String.raw`Q_{L},\;Q_{G}`, "Actual liquid, gas flow", "ft³/s"],
    [String.raw`D,\;A`, "Inside diameter, area", "ft, ft²"],
    [String.raw`\rho_{L},\;\rho_{G}`, "Liquid, gas density", "lb/ft³"],
    [String.raw`\sigma`, "Surface tension", "dyn/cm"],
    [String.raw`H_{L}`, "Liquid holdup", "—"],
    [String.raw`\theta`, "Inclination from horizontal", "rad"],
    [String.raw`a,b,c`, "Holdup constants by pattern", "—"],
    [String.raw`e,f,g,h`, "Inclination constants", "—"],
    [String.raw`f_{n}`, "No-slip friction factor (Colebrook)", "—"],
    [String.raw`C`, "Erosional constant, 100", "—"],
  ],
};

function niceTicks(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
