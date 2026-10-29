// Gooseneck Vent — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { NPS, SCHEDULES, npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";
import { toDisplay, unit } from "../../lib/units.js";

const CMP = { cap: "≥", pt: "≤", mach: "<", design: "≤" };

export default {
  id: "gooseneck-vent",
  code: "PIP-06",
  name: "Gooseneck Flow",
  category: "Piping",
  source: "Gooseneck Flow Calculations.xlsx",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  scene,
  alerts: [["seam", "Over 2× design: roof seam at risk"], ["over", "Tank overpressured at the required rate"], ["choke", "Vent outlet choked"]],

  inputs: [
    { title: "Relief", fields: [
      { id: "qreq", label: "Required rate, air", kind: "airStd" },
      { id: "pd", label: "Tank design P", kind: "tankP" },
    ] },
    { title: "Vent", fields: [
      { id: "nps", label: "NPS", options: NPS.map((n) => [n, `${npsLabel(n)}"`]), number: true },
      { id: "sch", label: "Schedule", options: Object.entries(SCHEDULES) },
      { id: "len", label: "Straight length", kind: "lengthM" },
      { id: "ells", label: "90° elbows", kind: "count" },
      { id: "kx", label: "Extra K", kind: "none" },
    ] },
    { title: "Vapour", fields: [
      { id: "sg", label: "SG", kind: "none" },
      { id: "t", label: "Temperature", kind: "tempC" },
      { id: "mu", label: "μ", kind: "none", unit: "cP" },
      { id: "k", label: "k", kind: "none" },
      { id: "patm", label: "P atm", kind: "pressA" },
    ] },
  ],

  examples: [
    ["Base case", {}],
    ["Workbook rate", { qreq: 17563, sg: 0.7239 }],
    ["Flame arrestor", { kx: 3 }],
    ["16 oz/in² tank", { pd: 6.89, qreq: 17563 }],
    ["Heavy vapour", { sg: 1.6, qreq: 6000 }],
    ["Roof seam", { nps: 8, qreq: 14000 }],
  ],

  context(s) {
    return `NPS ${npsLabel(s.nps)} gooseneck · ${s.ells} elbows${s.kx ? ` · K +${fixed(s.kx, 1)}` : ""}`;
  },

  kpis(r, sys) {
    const cap = q("scfh", sys, r.qCap), pt = q("psiTank", sys, r.ptReq);
    return [
      { label: "Capacity", v: cap.v, u: `${cap.u} gas`, tone: r.qCap < r.qReq ? "bad" : "" },
      { label: "Tank P", v: pt.v, u: `${pt.u} at required`, tone: r.fx.over ? "bad" : "" },
      { label: "Utilization", v: fixed(r.util * 100, 0), u: "%", tone: r.util > 1 ? "bad" : r.util > 0.9 ? "warn" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      if (c.kind === "none") return { label: c.label, val: fixed(c.value, 3), lim: `${CMP[c.id]} ${fixed(c.limit, 1)}`, u: "", sev: c.sev };
      const dg = c.kind === "psiTank" ? 2 : undefined;
      const a = q(c.kind, sys, c.value, dg), b = q(c.kind, sys, c.limit, dg);
      return { label: c.label, val: a.v, lim: `${CMP[c.id]} ${b.v}`, u: a.u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    return [
      ["ID", q("inch", sys, r.dIn, sys === "metric" ? 1 : 3)],
      ["Required, gas", q("scfh", sys, r.qReq)],
      ["Spitzglass cap.", q("scfh", sys, r.qSpitz)],
      ["V in vent", q("velocity", sys, r.Vreq)],
      ["Density", q("density", sys, r.rho)],
      ["K total", { v: fixed(r.K, 2), u: "", mono: true }],
      ["L equivalent", q("lengthFt", sys, r.Leq)],
      ["Re", { v: fixed(r.Re, 0), u: "", mono: true }],
      ["f", { v: fixed(r.f, 4), u: "", mono: true }],
      ["Ma outlet", { v: fixed(r.Ma, 3), u: "", mono: true }],
    ];
  },

  /** Tank back-pressure against vent rate. */
  chart(s, r, sys) {
    const pts = calc.curve(s, r);
    const kq = toDisplay("scfh", sys, 1), kp = toDisplay("psiTank", sys, 1);
    const W = 384, H = 160, L = 44, T = 14, B = 24, Rr = 8, pw = W - L - Rr, ph = H - T - B;
    const qMax = pts[pts.length - 1].q * kq, pMax = Math.max(r.pdPsi * 1.6, ...pts.map((p) => p.p)) * kp;
    const X = (v) => L + (v / qMax) * pw, Y = (v) => T + ph - (Math.min(v, pMax) / pMax) * ph;
    const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" ${o}>${t}</text>`;
    const ticks = (max) => { const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag; const st = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; const o = []; for (let v = 0; v <= max + 1e-9; v += st) o.push(v); return { o, d: Math.max(0, -Math.floor(Math.log10(st))) }; };
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tank pressure against vent rate" class="bars">`;
    const yt = ticks(pMax), xt = ticks(qMax);
    for (const t of yt.o) { svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${Y(t)}" y2="${Y(t)}"/>`; svg += txt(L - 6, Y(t) + 4, fixed(t, yt.d), `class="tick" text-anchor="end"`); }
    for (const t of xt.o) svg += txt(X(t), H - 6, fixed(t, xt.d), `class="cat" text-anchor="middle"`);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.q * kq).toFixed(1)},${Y(p.p * kp).toFixed(1)}`).join("");
    svg += `<path d="${d}" class="pline"/>`;
    svg += `<line class="ero" x1="${L}" x2="${W - Rr}" y1="${Y(r.pdPsi * kp)}" y2="${Y(r.pdPsi * kp)}"/>`;
    svg += txt(L + 4, Y(r.pdPsi * kp) - 4, "design", `class="ero-t"`);
    svg += `<line class="lim" x1="${X(r.qReq * kq)}" x2="${X(r.qReq * kq)}" y1="${T}" y2="${T + ph}"/>`;
    svg += `<circle cx="${X(r.qReq * kq)}" cy="${Y(r.ptReq * kp)}" r="4" class="pdot end"/>`;
    svg += txt(X(r.qReq * kq) - 6, T + 10, "required", `class="lim-t" text-anchor="end"`);
    return { svg: svg + `</svg>`, caption: `${unit("psiTank", sys)} vs ${unit("scfh", sys)} gas`, title: "Back-pressure curve" };
  },

  footnote: "Darcy–Weisbach with Hooper 2-K fittings, incompressible · GPSA Eq. 17-28 cross-check · API 12F · roof-seam drawing above 2× design is illustrative",

  equations: [
    { label: "Gas equivalent of the air rate", tex: String.raw`Q_{g} = \frac{Q_{air}}{\sqrt{SG}}` },
    { label: "Back-pressure", tex: String.raw`\Delta P = \left(\frac{f\,L}{D} + K_{in} + n\,K_{90} + K_{out} + K_{x}\right)\frac{\rho\,V^{2}}{2\,g_{c}}` },
    { label: "Fittings (Hooper 2-K)", tex: String.raw`K_{90} = \frac{800}{Re} + 0.25\left(1 + \frac{1}{d}\right), \qquad K_{in} = \frac{160}{Re} + 0.5, \qquad K_{out} = 1` },
    { label: "Friction factor (Colebrook)", tex: String.raw`\frac{1}{\sqrt{f}} = -2\log\!\left(\frac{\varepsilon}{3.7\,D} + \frac{2.51}{Re\,\sqrt{f}}\right)` },
    { label: "Capacity", tex: String.raw`Q_{cap}:\ \Delta P\!\left(Q_{cap}\right) = P_{design}` },
    { label: "Spitzglass, low pressure (GPSA 17-28)", tex: String.raw`Q_{h} = 3550\,K\sqrt{\frac{h_{w}}{S\,L}}, \qquad K = \sqrt{\frac{d^{5}}{1 + \dfrac{3.6}{d} + 0.03\,d}}` },
  ],

  symbols: [
    [String.raw`Q_{air},\;Q_{g}`, "Air, gas-equivalent rate", "scfh"],
    [String.raw`SG,\;S`, "Vapour specific gravity", "—"],
    [String.raw`D,\;d`, "Inside diameter", "ft, in"],
    [String.raw`L`, "Straight length", "ft"],
    [String.raw`n`, "Number of 90° elbows", "—"],
    [String.raw`K_{x}`, "Screen, arrestor, other", "—"],
    [String.raw`h_{w}`, "Pressure drop", "in H₂O"],
  ],
};
