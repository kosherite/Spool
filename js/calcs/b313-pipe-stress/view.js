// B31.3 Pipe Stress — what the panel shows. Pure presentation; no DOM access.
import * as calc from "./calc.js";
import * as scene from "./scene.js";
import { NPS_LIST, WALLS_MM, npsText } from "../../lib/pipe-schedules.js";
import { q, fixed } from "../../lib/format.js";
import { toDisplay, unit } from "../../lib/units.js";

const CMP = { wall: "≤", mawp: "≤", dsix: "<", flange: "≤", test: "≤", mdmt: "≥", life: "≥" };
const KIND = { mm: "thickMm", kpa: "pressG", stress: "stressKpa", degC: "degC", years: "years" };

export default {
  id: "b313-pipe-stress",
  code: "PIP-07",
  name: "B31.3 Pipe Stress",
  category: "Piping",
  source: "ASME B31.3 Piping Stress Calculations - Preferred.xlsx",
  defaults: calc.DEFAULTS,
  validate: calc.validate,
  compute: calc.compute,
  checks: calc.checks,
  status: calc.status,
  normalize: calc.normalize,
  scene,
  alerts: [["burst", "Above burst pressure"], ["thin", "Wall too thin for design pressure"], ["yieldTest", "Hydrotest would yield the pipe"], ["cold", "Below material MDMT"]],

  inputs: [
    { title: "Pipe", fields: [
      { id: "mat", label: "Material", options: Object.entries(calc.MATERIALS).map(([k, m]) => [k, m.name]) },
      { id: "nps", label: "NPS", options: NPS_LIST.map((n) => [n, `${npsText(n)}"`]), number: true },
      { id: "sch", label: "Schedule", options: (s) => WALLS_MM[s.nps].map(([n, w]) => [n, `${n} · ${fixed(w, 2)} mm`]) },
      { id: "E", label: "Quality factor E", options: [[1, "1.00 seamless"], [0.95, "0.95 EFW, 100% RT"], [0.85, "0.85 ERW"]], number: true },
    ] },
    { title: "Design", fields: [
      { id: "p", label: "Design P", kind: "pressG" },
      { id: "t", label: "Design T", kind: "tempC" },
      { id: "ca", label: "Corrosion allow.", kind: "thickMm" },
      { id: "mt", label: "Mill tolerance", kind: "pct" },
      { id: "W", label: "Weld factor W", kind: "none" },
      { id: "cls", label: "Flange", options: Object.keys(calc.FLANGE).map((k) => [k, `Class ${k}`]) },
      { id: "rate", label: "Corrosion rate", kind: "rateMm" },
    ] },
  ],

  examples: [
    ["Base case", {}],
    ["Sweet, Class 150", { mat: "A106B", nps: 6, sch: "40/STD", p: 1900, t: 38, ca: 1.5, cls: "150", rate: 0.05 }],
    ["316 SS hot", { mat: "TP316", nps: 3, sch: "80/XS", p: 9930, t: 200, ca: 0, cls: "600", rate: 0 }],
    ["Too thin", { sch: "40/STD", p: 15000, cls: "900" }],
    ["Below MDMT", { mat: "A106B" }],
    ["High corrosion", { rate: 0.5 }],
  ],

  context(s) {
    return `NPS ${npsText(s.nps)} Sch ${s.sch} · ${calc.MATERIALS[s.mat].name}`;
  },

  kpis(r, sys) {
    const m = q("pressG", sys, r.mawp, sys === "metric" ? 0 : 0);
    return [
      { label: "MAWP", v: m.v, u: m.u, tone: r.fx.over ? "bad" : "" },
      { label: "Wall used", v: fixed(r.util * 100, 0), u: "% of t_m", tone: r.fx.thin ? "bad" : "" },
      { label: "Corrosion life", v: Number.isFinite(r.life) ? fixed(Math.max(0, r.life), 0) : "∞", u: "yr", tone: r.life < 10 ? "bad" : r.life < 20 ? "warn" : "" },
    ];
  },

  checkRows(s, r, list, sys) {
    return list.map((c) => {
      const kind = KIND[c.kind];
      if (c.kind === "years") return { label: c.label, val: fixed(Math.max(0, c.value), 0), lim: `≥ ${c.limit}`, u: "yr", sev: c.sev };
      const dg = c.kind === "mm" ? (sys === "metric" ? 2 : 3) : c.kind === "kpa" ? 0 : undefined;
      const a = q(kind, sys, c.value, dg), b = q(kind, sys, c.limit, dg);
      return { label: c.label, val: a.v, lim: `${CMP[c.id]} ${b.v}`, u: a.u, sev: c.sev };
    });
  },

  details(s, r, sys) {
    const mm = (v, d = 2) => q("thickMm", sys, v, sys === "metric" ? d : 3);
    return [
      ["OD", mm(r.D, 1)],
      ["t_n nominal", mm(r.tn)],
      ["t_m minimum", mm(r.tm)],
      ["t pressure", mm(r.t)],
      ["t + c", mm(r.tc)],
      ["Metal-loss allowance", mm(r.lossAllow)],
      ["S at design T", q("stressKpa", sys, r.S)],
      ["Y", { v: fixed(r.Y, 3), u: "", mono: true }],
      ["MAWP, new", q("pressG", sys, r.mawpNew, 0)],
      ["Hydrotest P_T", q("pressG", sys, r.pTest, 0)],
      ["Test hoop stress", q("stressKpa", sys, r.sigmaTest)],
      ["Flange rating", q("pressG", sys, r.flange, 0)],
      ["Hoop stress, design", q("stressKpa", sys, r.hoop)],
      ["Lightest OK", { v: r.lightest ? `Sch ${r.lightest.sch}` : "None", u: "" }],
    ];
  },

  /** MAWP for every schedule of this size; tap a bar to select it. */
  chart(s, r, sys) {
    const k = toDisplay("pressG", sys, 1), up = unit("pressG", sys);
    const rows = r.scheds.map((x) => ({ ...x, v: x.mawp * k }));
    const dp = s.p * k, top = Math.max(dp * 1.3, ...rows.map((x) => x.v)) * 1.08;
    const W = 384, H = 160, L = 46, T = 12, B = 26, Rr = 4, pw = W - L - Rr, ph = H - T - B, bw = pw / rows.length;
    const y = (v) => T + ph - (Math.min(v, top) / top) * ph;
    const txt = (x, yy, t, o = "") => `<text x="${x}" y="${yy}" ${o}>${t}</text>`;
    const raw = top / 4, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag, step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="MAWP by schedule, ${up}" class="bars">`;
    for (let t = 0; t <= top; t += step) { svg += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}"/>`; svg += txt(L - 6, y(t) + 4, fixed(t, 0), `class="tick" text-anchor="end"`); }
    rows.forEach((d, i) => {
      const x = L + i * bw + bw * 0.18, w = bw * 0.64, sel = d.sch === s.sch, h = T + ph - y(d.v);
      svg += `<g class="bar${sel ? " sel" : ""}" data-key="sch" data-val="${d.sch}" tabindex="0" role="button" aria-label="Schedule ${d.sch}: ${fixed(d.v, 0)} ${up}">`;
      svg += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}"/>`;
      svg += `<rect class="b${d.v < dp ? " short" : ""}" x="${x}" y="${y(d.v)}" width="${w}" height="${Math.max(h, 1)}" rx="2"/>`;
      if (sel) svg += txt(x + w / 2, Math.max(y(d.v) - 5, 9), fixed(d.v, 0), `class="val" text-anchor="middle"`);
      svg += txt(x + w / 2, H - 8, d.sch.split("/")[0], `class="cat" text-anchor="middle"`);
      svg += `</g>`;
    });
    svg += `<line class="ero" x1="${L}" x2="${W - Rr}" y1="${y(dp)}" y2="${y(dp)}"/>`;
    svg += txt(L + 4, y(dp) - 4, "design", `class="ero-t"`);
    return { svg: svg + `</svg>`, caption: up, title: "MAWP by schedule" };
  },

  footnote: "ASME B31.3 304.1.2, Table A-1, Table 304.1.1, 345.4.2 · B16.5 Gr 1.1 (Class 900+ above ambient scaled from Class 600) · Z245.1 is unlisted: S = SMTS/3",

  equations: [
    { label: "Pressure design thickness", tex: String.raw`t = \frac{P\,D}{2\left(S\,E\,W + P\,Y\right)}` },
    { label: "Required vs supplied wall", tex: String.raw`t + c \le t_{m} = t_{n}\left(1 - \frac{m_{t}}{100}\right)` },
    { label: "Maximum allowable working pressure", tex: String.raw`P_{a} = \frac{2\,S\,E\,W\left(t_{m} - c\right)}{D - 2\,Y\left(t_{m} - c\right)}` },
    { label: "Y when t ≥ D/6", tex: String.raw`Y = \frac{d + 2c}{D + d + 2c}` },
    { label: "Hydrostatic test, 345.4.2", tex: String.raw`P_{T} = 1.5\,P\,\frac{S_{T}}{S}, \qquad \frac{S_{T}}{S} \le 6.5` },
    { label: "Test hoop stress", tex: String.raw`\sigma_{T} = \frac{P_{T}\,D}{2\,t_{m}} \le S_{y}` },
    { label: "Corrosion life", tex: String.raw`L = \frac{t_{m} - t}{r}` },
  ],

  symbols: [
    [String.raw`P,\;P_{T}`, "Design, test pressure", "kPa"],
    [String.raw`D,\;d`, "Outside, inside diameter", "mm"],
    [String.raw`t_{n},\;t_{m}`, "Nominal, minimum wall", "mm"],
    [String.raw`c`, "Corrosion and mechanical allowance", "mm"],
    [String.raw`m_{t}`, "Mill tolerance", "%"],
    [String.raw`S,\;S_{T}`, "Allowable at design, test temperature", "kPa"],
    [String.raw`E,\;W,\;Y`, "Quality, weld strength, Y coefficient", "—"],
    [String.raw`S_{y}`, "Specified minimum yield", "kPa"],
    [String.raw`r`, "Corrosion rate", "mm/yr"],
  ],
};
