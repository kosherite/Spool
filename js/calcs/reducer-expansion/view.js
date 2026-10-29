// Reducer + Expansion — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { NPS, SCHEDULES, npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";

const CMP = { erosional: "<", velocity: "≤", mach: "<", dpp: "≤", cav: ">", sep: "≤" };
const gas = (s) => s.phase === "gas", liq = (s) => s.phase !== "gas";
const NPS_OPTS = NPS.map((n) => [n, `${npsLabel(n)}"`]);

export default {
  id: "reducer-expansion",
  code: "PIP-05",
  name: "Reducer and Expansion",
  category: "Piping",
  source: "Reducer + Expansion Calc.xls",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  scene,
  alerts: [["stall", "ΔP exceeds inlet pressure"], ["choke", "Choked at the small end"], ["cavitate", "Cavitation at the vena contracta"], ["shake", "Above erosional velocity"]],

  inputs: [
    { title: "Fitting", fields: [
      { id: "type", label: "Type", options: [["con", "Reducer"], ["exp", "Expander"]] },
      { id: "theta", label: "Cone angle θ", kind: "none", unit: "°" },
      { id: "npsL", label: "Large end", options: NPS_OPTS, number: true },
      { id: "npsS", label: "Small end", options: NPS_OPTS, number: true },
      { id: "sch", label: "Schedule", options: Object.entries(SCHEDULES) },
      { id: "phase", label: "Fluid", options: [["gas", "Gas"], ["liquid", "Liquid"]] },
    ] },
    { title: "Gas", fields: [
      { id: "qg", label: "Flow", kind: "stdFlow", show: gas },
      { id: "sg", label: "Gas SG", kind: "none", show: gas },
      { id: "z", label: "z", kind: "none", show: gas },
      { id: "k", label: "k", kind: "none", show: gas },
      { id: "mug", label: "μ", kind: "none", unit: "cP", show: gas },
    ] },
    { title: "Liquid", fields: [
      { id: "ql", label: "Flow", kind: "liqFlow", show: liq },
      { id: "rho", label: "Density", kind: "densKg", show: liq },
      { id: "mul", label: "μ", kind: "none", unit: "cP", show: liq },
      { id: "pv", label: "Pv", kind: "pressA", show: liq },
    ] },
    { title: "Conditions", fields: [
      { id: "p", label: "P₁", kind: "pressG" },
      { id: "t", label: "Temperature", kind: "tempC" },
      { id: "patm", label: "P atm", kind: "pressA" },
    ] },
  ],

  examples: [
    ["Base case", {}],
    ["Expander", { type: "exp" }],
    ["15° diffuser", { type: "exp", theta: 15 }],
    ["Liquid reducer", { phase: "liquid", ql: 300 }],
    ["Cavitation", { phase: "liquid", ql: 900, npsS: 1.5, p: 60, pv: 90 }],
    ["Choked", { qg: 36, npsL: 2, npsS: 1, p: 100 }],
  ],

  context(s) {
    const kind = s.type === "con" ? "Reducer" : "Expander";
    const [a, b] = s.type === "con" ? [s.npsL, s.npsS] : [s.npsS, s.npsL];
    return `${kind} ${npsLabel(a)}" → ${npsLabel(b)}" · ${s.theta >= 180 ? "square" : `${fixed(s.theta, 0)}° cone`} · ${s.phase}`;
  },

  kpis(r, sys) {
    const dl = q("dpPsi", sys, r.dpLoss), ds = q("dpPsi", sys, -r.dpStatic);
    return [
      { label: "K", v: fixed(r.K, 3), u: "upstream V" },
      { label: "Loss", v: dl.v, u: dl.u },
      { label: "P₂ − P₁", v: (ds.raw > 0 ? "+" : "") + ds.v, u: ds.u, tone: r.fx.stall ? "bad" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      if (c.kind === "pct") return { label: c.label, val: fixed(c.value * 100, 2), lim: `≤ ${fixed(c.limit * 100, 0)}`, u: "%", sev: c.sev };
      if (c.kind === "none") return { label: c.label, val: fixed(c.value, 3), lim: `${CMP[c.id]} ${fixed(c.limit, 1)}`, u: "", sev: c.sev };
      if (c.kind === "deg") return { label: c.label, val: fixed(c.value, 0), lim: `≤ ${c.limit}`, u: "°", sev: c.sev };
      const a = q(c.kind, sys, c.value), b = q(c.kind, sys, c.limit);
      if (c.id === "cav" && c.sev === "bad") return { label: c.label, val: "≤ Pv", lim: `${CMP[c.id]} ${b.v}`, u: "", sev: c.sev };
      return { label: c.label, val: a.v, lim: `${CMP[c.id]} ${b.v}`, u: a.u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    const rows = [
      ["β", { v: fixed(r.beta, 3), u: "", mono: true }],
      ["ID large", q("inch", sys, r.dL, sys === "metric" ? 1 : 3)],
      ["ID small", q("inch", sys, r.dS, sys === "metric" ? 1 : 3)],
      ["V upstream", q("velocity", sys, r.V1)],
      ["V downstream", q("velocity", sys, r.V2)],
      ["Velocity head", q("dpPsi", sys, r.hv1)],
      ["Density", q("density", sys, r.rho)],
      ["Re upstream", { v: fixed(r.Re1, 0), u: "", mono: true }],
      ["f upstream", { v: fixed(r.f1, 4), u: "", mono: true }],
      ["K, large-end V", { v: fixed(r.Kpipe, 3), u: "", mono: true }],
      ["P₂", r.P2 > 0 ? q("psig", sys, r.p2g) : { v: "—", u: "" }],
    ];
    if (s.type === "con") rows.push(["C_c", { v: fixed(r.Cc, 3), u: "", mono: true }],
      ["P vena contracta", r.fx.cavitate || r.Pvc <= 0 ? { v: "≤ Pv", u: "" } : q("psia", sys, r.Pvc)]);
    if (s.phase === "gas") rows.push(["Ma small end", { v: fixed(r.MaS, 3), u: "", mono: true }]);
    return rows;
  },

  /** K against cone angle for this size pair and Reynolds number. */
  chart(s, r) {
    const pts = calc.kByAngle(s, r);
    const W = 384, H = 160, L = 40, T = 14, B = 24, Rr = 8, pw = W - L - Rr, ph = H - T - B;
    const kMax = Math.max(...pts.map((p) => p.K)) * 1.15 || 1;
    const X = (th) => L + (th / 180) * pw, Y = (k) => T + ph - (k / kMax) * ph;
    const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" ${o}>${t}</text>`;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Loss coefficient against cone angle" class="bars">`;
    const raw = kMax / 4, mag = 10 ** Math.floor(Math.log10(raw)), nn = raw / mag;
    const step = (nn < 1.5 ? 1 : nn < 3 ? 2 : nn < 7 ? 5 : 10) * mag;
    for (let k = 0; k <= kMax + 1e-9; k += step) {
      svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${Y(k)}" y2="${Y(k)}"/>`;
      svg += txt(L - 6, Y(k) + 4, fixed(k, Math.max(0, -Math.floor(Math.log10(step)))), `class="tick" text-anchor="end"`);
    }
    for (const th of [0, 45, 90, 135, 180]) svg += txt(X(th), H - 6, `${th}°`, `class="cat" text-anchor="middle"`);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.th).toFixed(1)},${Y(p.K).toFixed(1)}`).join("");
    svg += `<path d="${d}" class="pline"/>`;
    const th = Math.min(180, Math.max(5, s.theta));
    svg += `<line class="lim" x1="${X(th)}" x2="${X(th)}" y1="${T}" y2="${T + ph}"/>`;
    svg += `<circle cx="${X(th)}" cy="${Y(r.K)}" r="4" class="pdot end"/>`;
    svg += txt(Math.min(X(th) + 6, W - Rr - 30), Math.max(Y(r.K) - 8, 12), fixed(r.K, 3), `class="val"`);
    return { svg: svg + `</svg>`, caption: "K vs θ", title: "Loss coefficient" };
  },

  footnote: "Hooper (1988) 2-K, upstream velocity · Weisbach C_c · incompressible · API RP 14E",

  equations: [
    { label: "Reducer, Re ≥ 2500", tex: String.raw`K_{1} = \left(0.6 + 0.48\,f_{1}\right)\left(\frac{D_{1}}{D_{2}}\right)^{2}\left[\left(\frac{D_{1}}{D_{2}}\right)^{2} - 1\right]` },
    { label: "Reducer, Re < 2500", tex: String.raw`K_{1} = \left(1.2 + \frac{160}{Re_{1}}\right)\left[\left(\frac{D_{1}}{D_{2}}\right)^{4} - 1\right]` },
    { label: "Reducer taper", tex: String.raw`\theta < 45^{\circ}:\ \times\,1.6\sin\frac{\theta}{2}, \qquad 45^{\circ} \le \theta < 180^{\circ}:\ \times\sqrt{\sin\frac{\theta}{2}}` },
    { label: "Expander, Re ≥ 4000", tex: String.raw`K_{1} = \left(1 + 0.8\,f_{1}\right)\left[1 - \left(\frac{D_{1}}{D_{2}}\right)^{2}\right]^{2}` },
    { label: "Expander, Re < 4000", tex: String.raw`K_{1} = 2\left[1 - \left(\frac{D_{1}}{D_{2}}\right)^{4}\right]` },
    { label: "Expander taper", tex: String.raw`\theta < 45^{\circ}:\ \times\,2.6\sin\frac{\theta}{2}` },
    { label: "Irrecoverable loss", tex: String.raw`\Delta P_{loss} = K_{1}\,\frac{\rho\,V_{1}^{2}}{2\,g_{c}}` },
    { label: "Static pressure change", tex: String.raw`P_{1} - P_{2} = \Delta P_{loss} + \frac{\rho\left(V_{2}^{2} - V_{1}^{2}\right)}{2\,g_{c}}` },
    { label: "Vena contracta", tex: String.raw`C_{c} = 0.62 + 0.38\left(\frac{A_{2}}{A_{1}}\right)^{3}, \qquad P_{vc} = P_{1} - \frac{\rho}{2\,g_{c}}\left[\left(\frac{V_{2}}{C_{c}}\right)^{2} - V_{1}^{2}\right]` },
  ],

  symbols: [
    [String.raw`D_{1},\;D_{2}`, "Upstream, downstream ID", "in"],
    [String.raw`V_{1},\;V_{2}`, "Upstream, downstream velocity", "ft/s"],
    [String.raw`f_{1}`, "Upstream Darcy friction factor", "—"],
    [String.raw`Re_{1}`, "Upstream Reynolds number", "—"],
    [String.raw`\theta`, "Included cone angle, 180° = square", "°"],
    [String.raw`\rho`, "Density", "lb/ft³"],
    [String.raw`C_{c}`, "Contraction coefficient", "—"],
  ],
};
