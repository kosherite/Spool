// Reducer + Expansion — canvas scene: half-section of the fitting with flow streaks that
// accelerate or decelerate, recirculation eddies, vena contracta, and the static-pressure line.
import { npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";
import { V_GUIDE } from "./calc.js";

export const bounds = {
  full: { w: 1080, h: 560, cx: 0, cy: -50 },
  compact: { w: 960, h: 560, cx: 0, cy: -50 },
};

const XA = -440, XB = 440, WALL = 10;
let parts = [], bubbles = [], spin = 0;

function tintOf(hex, a) {
  const h = hex.replace("#", ""); if (h.length !== 6) return `rgba(20,33,61,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function draw(c, env) {
  const { now, dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const rad = (d) => Math.min(170, 26 + d * 17);
  const R1 = rad(r.d1), R2 = rad(r.d2), con = s.type === "con";
  const PY = -Math.max(R1, R2) - WALL - 120;
  const th = Math.min(180, Math.max(2, s.theta));
  const Lc = th >= 179 ? 3 : Math.min(320, Math.abs(R1 - R2) / Math.tan((th * Math.PI) / 360));
  const xa = -Lc / 2, xb = Lc / 2;
  const wallR = (x) => (x <= xa ? R1 : x >= xb ? R2 : R1 + ((R2 - R1) * (x - xa)) / (xb - xa));

  // flow core: jet spreading after a square expansion, vena contracta after a square reducer
  const sudden = th >= 90;
  const Rvc = R2 * Math.sqrt(r.Cc);
  const core = (x) => {
    const w = wallR(x);
    if (!con && (sudden || th > 20) && x > xb) { const Lr = (sudden ? 7 : 3) * R1; return x < xb + Lr ? R1 + ((w - R1) * (x - xb)) / Lr : w; }
    if (con && sudden && x > xb) {
      const a = 0.6 * R2, b = 3 * R2;
      if (x < xb + a) return w + ((Rvc - w) * (x - xb)) / a;
      if (x < xb + b) return Rvc + ((w - Rvc) * (x - xb - a)) / (b - a);
    }
    return w;
  };

  const want = 260;
  while (parts.length < want) parts.push({ x: XA + Math.random() * (XB - XA), y: Math.random() * 2 - 1, l: 0.4 + Math.random() * 0.6 });

  // steel half-section
  const outline = (off, sign) => { for (let x = XA; x <= XB; x += 4) c.lineTo(x, sign * (wallR(x) + off)); };
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(XA, -(R1 + WALL)); outline(WALL, -1); c.lineTo(XB, -R2); for (let x = XB; x >= XA; x -= 4) c.lineTo(x, -wallR(x)); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(XA, R1 + WALL); outline(WALL, 1); c.lineTo(XB, R2); for (let x = XB; x >= XA; x -= 4) c.lineTo(x, wallR(x)); c.closePath(); c.fill(); c.stroke();
  // bore
  c.fillStyle = s.phase === "liquid" ? tintOf(tok.particle, 0.14) : tok.card;
  c.beginPath(); c.moveTo(XA, -R1); outline(0, -1); for (let x = XB; x >= XA; x -= 4) c.lineTo(x, wallR(x)); c.closePath(); c.fill();
  // weld lines at the fitting ends
  c.strokeStyle = tok.text; c.lineWidth = 1.5;
  for (const x of [xa - 2, xb + 2]) { const w = wallR(x); c.beginPath(); c.moveTo(x, -w - WALL); c.lineTo(x, -w); c.moveTo(x, w); c.lineTo(x, w + WALL); c.stroke(); }

  // streaks
  const V1 = r.V1, vis = (v) => 30 + 70 * Math.log10(1 + v);
  const col = r.Vs >= r.Ve ? tok.bad : r.Vs > V_GUIDE[s.phase] ? tok.amber : tok.particle;
  if (layers.flow) {
    c.save(); c.beginPath(); c.moveTo(XA, -R1); outline(0, -1); for (let x = XB; x >= XA; x -= 4) c.lineTo(x, wallR(x)); c.closePath(); c.clip();
    c.strokeStyle = col; c.lineCap = "round";
    for (const p of parts) {
      const cr = core(p.x), local = V1 * (R1 / cr) ** 2;
      if (playing) p.x += vis(local) * dt * (0.85 + 0.3 * (1 - Math.abs(p.y)));
      if (p.x > XB) { p.x = XA; p.y = Math.random() * 2 - 1; }
      const y = p.y * (cr - 3), len = 3 + Math.min(26, vis(local) * 0.13) * p.l;
      c.globalAlpha = 0.3 + 0.55 * p.l; c.lineWidth = 1.3 + p.l;
      c.beginPath(); c.moveTo(p.x - len, y); c.lineTo(p.x, y); c.stroke();
    }
    c.globalAlpha = 1;
    // eddies between the core and the wall
    if (playing) spin += dt * (1 + Math.log10(1 + V1));
    const eddy = (x, y, rr, dir) => {
      if (rr < 4) return;
      c.strokeStyle = tok.muted; c.lineWidth = 1.6;
      c.beginPath(); c.arc(x, y, rr, spin * dir, spin * dir + Math.PI * 1.5); c.stroke();
      const a = spin * dir + Math.PI * 1.5, ax = x + Math.cos(a) * rr, ay = y + Math.sin(a) * rr;
      c.fillStyle = tok.muted; c.beginPath(); c.arc(ax, ay, 2.5, 0, Math.PI * 2); c.fill();
    };
    if (!con && (sudden || th > 20)) {
      const gap = (R2 - R1) / 2, n = sudden ? 3 : 2;
      for (let i = 0; i < n; i++) { const ex = xb + (i + 0.6) * gap * 2.2; if (ex > XB - 20) break; const g = (wallR(ex) - core(ex)) / 2; eddy(ex, -(core(ex) + g), g * 0.8, -1); eddy(ex, core(ex) + g, g * 0.8, 1); }
    }
    if (con && sudden) {
      const ex = xb + 0.9 * R2, g = (R2 - core(ex)) / 2; eddy(ex, -(core(ex) + g), g * 0.9, -1); eddy(ex, core(ex) + g, g * 0.9, 1);
      const ux = xa - 0.25 * (R1 - R2), ug = (R1 - R2) / 2.6; eddy(ux, -(R1 - ug), ug * 0.7, -1); eddy(ux, R1 - ug, ug * 0.7, 1);
    }
    c.restore();
  }

  // cavitation: bubbles born at the vena contracta, collapsing downstream
  if (r.fx.cavitate) {
    const vx = xb + 0.6 * R2;
    if (playing) for (let i = 0; i < 4; i++) bubbles.push({ x: vx + Math.random() * 10, y: (Math.random() * 2 - 1) * Rvc * 0.9, r: 2 + Math.random() * 4, age: 0 });
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (playing) { b.age += dt; b.x += vis(r.V2) * dt; }
      const life = 0.6, k = 1 - b.age / life;
      if (k <= 0 || b.x > XB) { bubbles.splice(i, 1); continue; }
      c.strokeStyle = tok.text; c.fillStyle = tok.card; c.lineWidth = 1;
      c.beginPath(); c.arc(b.x, b.y, b.r * (k < 0.25 ? k * 4 : 1), 0, Math.PI * 2); c.fill(); c.stroke();
    }
  } else bubbles.length = 0;

  // choke: shock cells at the small-end exit
  if (r.fx.choke) {
    const [x0, Rs] = con ? [XB - 200, R2] : [XA + 40, R1];
    c.strokeStyle = tok.amber; c.lineWidth = 2.4;
    for (let k = 0; k < 4; k++) { const cx = x0 + k * 44, h = Rs * 0.8 * (1 - k * 0.15); c.globalAlpha = 1 - k * 0.2; c.beginPath(); c.moveTo(cx - 18, 0); c.lineTo(cx, -h); c.lineTo(cx + 18, 0); c.lineTo(cx, h); c.closePath(); c.stroke(); }
    c.globalAlpha = 1;
  }
  if (r.fx.shake) {
    c.strokeStyle = tok.bad; c.lineWidth = 2; c.globalAlpha = 0.7;
    const sx = con ? xb + 120 : xa - 120, sr = con ? R2 : R1;
    for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(sx, sg * (sr + WALL + 6), 8 + k * 7, sg < 0 ? Math.PI * 1.2 : Math.PI * 0.2, sg < 0 ? Math.PI * 1.8 : Math.PI * 0.8); c.stroke(); }
    c.globalAlpha = 1;
  }

  // labels
  const v1 = q("velocity", sys, r.V1), v2 = q("velocity", sys, r.V2);
  const big = (x, y, v, u, colr) => {
    c.textAlign = "center"; c.font = F(800, 30); c.fillStyle = colr; c.fillText(v, x - 14, y);
    const w = c.measureText(v).width; c.font = F(600, 14); c.fillStyle = tok.muted; c.textAlign = "left"; c.fillText(u, x - 14 + w / 2 + 5, y);
  };
  const vtone = (v) => (v >= r.Ve ? tok.bad : v > V_GUIDE[s.phase] ? tok.amberText : tok.text);
  big((XA + xa) / 2, R1 + WALL + 54 + 8 * TS, v1.v, v1.u, vtone(r.V1));
  big((xb + XB) / 2, Math.max(R1, R2) + WALL + 54 + 8 * TS, v2.v, v2.u, vtone(r.V2));
  c.textAlign = "center"; c.font = F(500, 13, "m"); c.fillStyle = tok.muted;
  const [n1, n2] = con ? [s.npsL, s.npsS] : [s.npsS, s.npsL];
  c.fillText(`${npsLabel(n1)}" S${s.sch}`, (XA + xa) / 2, R1 + WALL + 76 + 12 * TS);
  c.fillText(`${npsLabel(n2)}" S${s.sch}`, (xb + XB) / 2, Math.max(R1, R2) + WALL + 76 + 12 * TS);
  c.font = F(700, 14); c.fillStyle = tok.text;
  c.fillText(`K ${fixed(r.K, 3)}${th < 180 ? ` · θ ${fixed(th, 0)}°` : ""}`, 0, Math.max(R1, R2) + WALL + 30);
  c.font = F(700, 13); c.fillStyle = tok.bad;
  if (r.fx.cavitate) c.fillText("Cavitation", xb + 0.6 * R2 + 40, -Math.max(R1, R2) - WALL - 16);
  if (r.fx.choke) c.fillText("Choked · Ma 1", con ? XB - 140 : XA + 110, -Math.max(R1, R2) - WALL - 16);

  if (!layers.dims) return;
  // static-pressure line (to scale between its own extremes)
  const pts = [[XA + 20, r.P1], [xa, r.P1 - (r.hv1 * 0.02)]];
  if (con) { const xv = xb + 0.6 * R2; pts.push([xv, r.Pvc], [xb + 3 * R2, r.P2], [XB - 20, r.P2]); }
  else { pts.push([xb + (sudden ? 0.5 : 0.2) * R1, r.P1 - r.hv1 * 0.05], [xb + (sudden ? 7 : 3) * R1, r.P2], [XB - 20, r.P2]); }
  const ps = pts.map((p) => p[1]), hi = Math.max(...ps), lo = Math.min(...ps), span = hi - lo || 1;
  const Yp = (p) => PY + 30 - ((p - lo) / span) * 60;
  c.strokeStyle = tok.primary || tok.text; c.lineWidth = 2.2; c.beginPath();
  pts.forEach(([x, p], i) => (i ? c.lineTo(x, Yp(p)) : c.moveTo(x, Yp(p)))); c.stroke();
  c.strokeStyle = tok.line; c.setLineDash([3, 4]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(XA + 20, Yp(r.P1)); c.lineTo(XB - 20, Yp(r.P1)); c.stroke(); c.setLineDash([]);
  const g = (p) => q("psig", sys, p - s.patm / 6.894757);
  const lab = (x, p, name, align) => {
    const v = g(p); c.textAlign = align; c.font = F(800, 15); c.fillStyle = tok.text; c.fillText(name, x, Yp(p) - 12 - 12 * TS);
    c.font = F(500, 12, "m"); c.fillStyle = tok.muted; c.fillText(`${v.v} ${v.u}`, x, Yp(p) - 10);
  };
  lab(XA + 20, r.P1, "P₁", "left"); lab(XB - 20, r.P2, "P₂", "right");
  if (con) { const v = q("psia", sys, r.Pvc); c.textAlign = "center"; c.font = F(500, 12, "m"); c.fillStyle = r.fx.cavitate ? tok.bad : tok.muted; c.fillText(r.fx.cavitate || r.Pvc <= 0 ? "vc ≤ Pv" : `vc ${v.v} ${v.u}`, xb + 0.6 * R2, Yp(r.Pvc) + 18 + 4 * TS); }
}
