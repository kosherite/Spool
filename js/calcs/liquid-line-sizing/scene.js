// Liquid Line Sizing — canvas scene: source → offset pipe run with cutaway → destination.
import { npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";

export const bounds = {
  full: { w: 1440, h: 640, cx: 0, cy: 50 },
  compact: { w: 1120, h: 600, cx: 0, cy: 40 },
};

// route: lower-left run → riser → top run (cutaway) → drop → lower-right run
const YT = -20, YB = 130, XL0 = -470, XL1 = -340, XR0 = 380, XR1 = 470;
const CUT0 = -230, CUT1 = 270, GROUND = 262;
const ROUTE = [[XL0, YB], [XL1, YB], [XL1, YT], [XR0, YT], [XR0, YB], [XR1, YB]];

const seeded = (n, seed) => {
  let x = seed; const out = [];
  const nx = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) out.push([nx(), nx(), nx()]);
  return out;
};
const FROST = seeded(300, 11), XTAL = seeded(34, 5), BUB = seeded(70, 17);

let parts = [], drops = [], puddle = 0, iceG = 0, pulse = 0;

const pipeR = (r) => 12 + r.dIn * 4.2;

export function draw(c, env) {
  const { now, dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const R = pipeR(r), fx = r.fx;
  const want = Math.round(50 + R * 2);
  while (parts.length < want) parts.push({ x: Math.random(), y: Math.random() * 2 - 1, l: 0.4 + Math.random() * 0.6 });
  if (parts.length > want) parts.length = want;
  const liquid = tintOf(tok.particle, 0.1);

  // ground line
  c.strokeStyle = tok.line; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-700, GROUND); c.lineTo(700, GROUND); c.stroke();

  // equipment
  if (s.service === "discharge") pump(c, -560, YB, tok, "out");
  else tank(c, -560, tok, liquid);
  if (s.service === "suction") pump(c, 540, YB, tok, "in");
  else if (s.service === "discharge") vessel(c, 560, tok);

  // pipe (vibrates above erosional)
  c.save();
  if (fx.shake && playing) { const a = Math.min(4, 1.4 * (r.V / r.Ve)); c.translate(Math.sin(now * 0.071) * a, Math.cos(now * 0.093) * a * 0.6); }
  c.lineJoin = "round"; c.lineCap = "butt";
  path(c, ROUTE); c.strokeStyle = tok.steelEdge; c.lineWidth = 2 * R + 4; c.stroke();
  path(c, ROUTE); c.strokeStyle = tok.steel; c.lineWidth = 2 * R; c.stroke();

  // outer-wall treatments on the visible steel
  const runs = [[XL0, YB, XL1, YB], [CUT1 + R * 0.28, YT, XR0, YT], [XL1, YT, CUT0 - R * 0.28, YT], [XR0, YB, XR1, YB]];
  if (fx.frost) {
    c.fillStyle = "#ffffff";
    for (const [a, b, k] of FROST) {
      const [x0, y0, x1] = runs[Math.floor(k * runs.length) % runs.length];
      c.globalAlpha = 0.35 + 0.5 * k;
      c.fillRect(x0 + a * (x1 - x0), y0 - R + 3 + b * (2 * R - 6), 1.5 + k * 2.5, 1.5 + k * 2.5);
    }
    c.globalAlpha = 1;
  }
  if (fx.overstress) {
    c.save(); c.beginPath(); runs.forEach(([x0, y0, x1]) => c.rect(Math.min(x0, x1), y0 - R, Math.abs(x1 - x0), 2 * R)); c.clip();
    c.strokeStyle = tok.bad; c.globalAlpha = 0.45; c.lineWidth = 2;
    for (let x = -700; x < 700; x += 12) { c.beginPath(); c.moveTo(x, YB + R); c.lineTo(x + 2 * R + 150, YT - R); c.stroke(); }
    c.restore();
  }

  // flanges
  const FL = [[XL0 + 14, YB], [-300, YT], [CUT1 + 50, YT], [XR1 - 14, YB]];
  for (const [x, y] of FL) flange(c, x, y, R, tok);

  // valves
  const valves = s.gate + s.globe + s.bfly;
  if (valves > 0) valve(c, (XL0 + XL1) / 2 + 6, YB, R, tok, false);
  if (s.check > 0) valve(c, (XR0 + XR1) / 2 + 4, YB, R, tok, true);
  if (s.red !== "none") reducer(c, -275, YT, R, s.red, tok);

  // cutaway
  c.fillStyle = tok.card; c.fillRect(CUT0, YT - R + 5, CUT1 - CUT0, 2 * R - 10);
  c.fillStyle = liquid; c.fillRect(CUT0, YT - R + 5, CUT1 - CUT0, 2 * R - 10);
  c.strokeStyle = tok.steelEdge; c.lineWidth = 1.5;
  ellipse(c, CUT0, YT, R * 0.28, R - 2); ellipse(c, CUT1, YT, R * 0.28, R - 2);

  c.save(); c.beginPath(); c.rect(CUT0 + 2, YT - R + 6, CUT1 - CUT0 - 4, 2 * R - 12); c.clip();
  const span = CUT1 - CUT0;
  if (layers.flow) {
    const sp = 30 + 70 * Math.log10(1 + r.V * 3);
    c.strokeStyle = r.V >= r.Ve ? tok.bad : r.V > r.sv.max ? tok.amber : tok.particle; c.lineCap = "round";
    for (const p of parts) {
      const prof = r.Re < 2000 ? Math.max(0.05, 1 - p.y * p.y) : Math.pow(Math.max(0.02, 1 - Math.abs(p.y)), 1 / 7);
      const stall = fx.stall ? Math.max(0.06, 1 - p.x * 0.94) : 1;
      if (playing) p.x += (sp * prof * stall * dt) / span;
      if (p.x > 1) { p.x -= 1; p.y = Math.random() * 2 - 1; }
      const px = CUT0 + p.x * span, py = YT + p.y * (R - 10);
      const len = 3 + Math.min(18, sp * prof * stall * 0.1) * p.l;
      c.globalAlpha = 0.3 + 0.5 * p.l; c.lineWidth = 1.4 + p.l;
      c.beginPath(); c.moveTo(px - len, py); c.lineTo(px, py); c.stroke();
    }
    c.globalAlpha = 1;
  }
  if (layers.profile) {
    const xm = CUT1 - 70; c.strokeStyle = tok.text; c.fillStyle = tok.text; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(xm, YT - R + 8); c.lineTo(xm, YT + R - 8); c.stroke();
    for (let i = -4; i <= 4; i++) {
      const yy = i / 4.6, L = 56 * (r.Re < 2000 ? 1 - yy * yy : Math.pow(1 - Math.abs(yy), 1 / 7)), py = YT + yy * (R - 10);
      c.beginPath(); c.moveTo(xm, py); c.lineTo(xm + L, py); c.stroke();
      c.beginPath(); c.moveTo(xm + L, py); c.lineTo(xm + L - 6, py - 3.5); c.lineTo(xm + L - 6, py + 3.5); c.closePath(); c.fill();
    }
  }
  // flashing: vapour bubbles, denser toward the outlet
  if (fx.flash) {
    c.strokeStyle = tok.text; c.fillStyle = tok.card; c.lineWidth = 1.2;
    const t = playing ? now / 1000 : 0;
    for (const [a, b, k] of BUB) {
      const xf = (a + t * (0.15 + 0.2 * k)) % 1;
      if (Math.random() > xf * 1.4 && playing) continue;
      if (!playing && k > xf) continue;
      const bx = CUT0 + xf * span, by = YT + (b * 2 - 1) * (R - 12) - Math.sin(t * 3 + k * 9) * 3;
      c.beginPath(); c.arc(bx, by, 2 + k * 5 * xf, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
  // freezing: ice grows from the wall
  iceG = fx.freeze && !playing ? 0.8 : Math.max(0, Math.min(1, iceG + ((fx.freeze ? 1 : -2) * dt) / 5));
  if (iceG > 0.01) {
    c.fillStyle = tok.card; c.strokeStyle = tok.steelEdge; c.lineWidth = 1.2;
    for (const [a, b, k] of XTAL) {
      const xx = CUT0 + 16 + a * (span - 32), yy = b < 0.5 ? YT - R + 6 : YT + R - 6;
      const sz = (6 + k * R * 0.6 * (0.5 + 0.5 * Math.sin(Math.PI * a))) * iceG;
      c.beginPath();
      for (let j = 0; j < 6; j++) { const ang = (j / 6) * Math.PI * 2 + k, rr = sz * (j % 2 ? 1 : 0.7); c.lineTo(xx + Math.cos(ang) * rr * 0.8, yy + Math.sin(ang) * rr); }
      c.closePath(); c.fill(); c.stroke();
    }
  }
  c.restore();

  // water hammer: pressure pulse running back from the closing valve
  if (fx.surge) {
    if (playing) pulse = (pulse + dt * 0.55) % 1;
    const px = XR0 - pulse * (XR0 - XL1), bulge = 6 * Math.sin(Math.PI * pulse) + 3;
    c.save(); c.globalAlpha = 0.5 * (1 - pulse * 0.6);
    c.fillStyle = tok.bad; c.fillRect(px - 14, YT - R - bulge, 28, 2 * R + 2 * bulge);
    c.restore();
    c.strokeStyle = tok.bad; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px - 14, YT - R - bulge); c.lineTo(px + 14, YT - R - bulge); c.moveTo(px - 14, YT + R + bulge); c.lineTo(px + 14, YT + R + bulge); c.stroke();
  }
  if (fx.rupture) {
    const mid = (CUT0 + CUT1) / 2;
    c.beginPath(); c.moveTo(mid - 70, YT - R - 2);
    for (let i = 0; i <= 14; i++) c.lineTo(mid - 70 + i * 10, YT - R - 2 - (i % 2 ? 9 : 0) - (i % 3 === 0 ? 5 : 0));
    for (let i = 14; i >= 0; i--) c.lineTo(mid - 70 + i * 10, YT - R + 14 + (i % 2 ? 6 : 0));
    c.closePath(); c.fillStyle = tok.page; c.fill(); c.strokeStyle = tok.bad; c.lineWidth = 2; c.stroke();
  }
  if (fx.shake) {
    c.strokeStyle = tok.bad; c.lineWidth = 2; c.globalAlpha = 0.7;
    for (const xx of [CUT0 - 40, CUT1 + 80]) for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) {
      c.beginPath(); c.arc(xx, YT + sgn * (R + 8), 8 + k * 7, sgn < 0 ? Math.PI * 1.2 : Math.PI * 0.2, sgn < 0 ? Math.PI * 1.8 : Math.PI * 0.8); c.stroke();
    }
    c.globalAlpha = 1;
  }
  c.restore();

  // escaping liquid: drips at flanges, a fountain at a rupture, a puddle below
  if (fx.leak || fx.rupture) {
    const n = playing ? ((fx.rupture ? 90 : 0) + (fx.leak ? 26 : 0)) * dt : 0;
    for (let i = 0; i < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i++) {
      if (fx.rupture && (!fx.leak || Math.random() < 0.7)) {
        drops.push({ x: (CUT0 + CUT1) / 2 + (Math.random() - 0.5) * 120, y: YT - R - 4, vx: (Math.random() - 0.5) * 220, vy: -(260 + Math.random() * 260), big: true });
      } else {
        const [fxp, fy] = FL[Math.floor(Math.random() * FL.length)];
        drops.push({ x: fxp + (Math.random() - 0.5) * 8, y: fy + R + 12, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 40 });
      }
    }
    puddle = Math.min(1, puddle + (playing ? dt * (fx.rupture ? 0.25 : 0.06) : 0));
    if (!playing) puddle = Math.max(puddle, 0.6);
  } else { puddle = Math.max(0, puddle - dt * 0.5); }
  if (puddle > 0.01) {
    c.fillStyle = tintOf(tok.particle, 0.18);
    c.beginPath(); c.ellipse(0, GROUND + 4, 80 + puddle * 420, 6 + puddle * 8, 0, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = tok.particle;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (playing) { d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    if (d.y > GROUND || drops.length > 600) { drops.splice(i, 1); continue; }
    c.globalAlpha = d.big ? 0.55 : 0.7;
    c.beginPath(); c.ellipse(d.x, d.y, d.big ? 2.6 : 2, d.big ? 3.6 : 3.2, Math.atan2(d.vy, d.vx) - Math.PI / 2, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  if (!fx.leak && !fx.rupture) drops.length = 0;

  // labels
  const mid = (CUT0 + CUT1) / 2;
  c.font = F(700, 13); c.fillStyle = tok.bad; c.textAlign = "center";
  const under = YT + R + 18 + 6 * TS;
  if (fx.rupture) c.fillText("Rupture", mid, YT - R - 120);
  if (fx.leak) c.fillText("Leak", FL[3][0], YB - R - 22);
  if (fx.flash) c.fillText("Flashing", mid, under);
  else if (fx.freeze) c.fillText("Ice", mid, under);
  else if (fx.frost) { c.fillStyle = tok.muted; c.fillText("Frost", mid, under); }
  if (fx.surge && !fx.rupture) { c.fillStyle = tok.bad; c.fillText(`Surge +${q("dpPsi", sys, r.surgePsi, 0).v} ${q("dpPsi", sys, 0).u}`, (XL1 + XR0) / 2, YT - R - 16); }
  if (fx.overstress) { c.textAlign = "left"; c.fillText(`σh ${fixed((r.hoop / r.mat.S) * 100, 0)}% S`, XR0 + R + 12, YB + R + 20 + 6 * TS); }

  if (!layers.dims) return;
  const P1 = q("pressG", sys, s.p), P2 = q("psig", sys, r.p2g);
  gauge(c, -250, YT - R, "P₁", `${P1.v} ${P1.u}`, 0.5, tok, F, TS);
  gauge(c, 320, YT - R, "P₂", r.P2 > 0 ? `${P2.v} ${P2.u}` : "—", r.P2 > 0 ? Math.max(0, Math.min(1, P2.raw / (P1.raw || 1))) * 0.5 : 0, tok, F, TS);

  const vq = q("velocity", sys, r.V), ly = YT - R - 30 - 16 * TS;
  if (!fx.surge) {
    c.textAlign = "center"; c.font = F(800, 34);
    c.fillStyle = r.V >= r.Ve ? tok.bad : r.V > r.sv.max || r.V < r.sv.min ? tok.amberText : tok.text;
    c.fillText(vq.v, mid - 16, ly);
    const vw = c.measureText(vq.v).width;
    c.fillStyle = tok.muted; c.font = F(600, 15); c.textAlign = "left"; c.fillText(vq.u, mid - 16 + vw / 2 + 6, ly);
  }

  const idq = q("inch", sys, r.dIn, sys === "metric" ? 1 : 3);
  c.font = F(500, 13, "m"); c.textAlign = "left"; c.fillStyle = tok.text;
  c.fillText(`${idq.v} ${idq.u}`, XR0 + R + 12, YT + 46);
  c.fillStyle = tok.muted; c.fillText(`${npsLabel(s.nps)}" S${s.sch}`, XR0 + R + 12, YT + 50 + 14 * TS);
  if (s.dh) { const dh = q("lengthM", sys, s.dh, 1); c.fillText(`ΔH ${s.dh > 0 ? "+" : ""}${dh.v} ${dh.u}`, XL1 + R + 10, YT + 60); }

  const L = q("lengthM", sys, s.len, 0), Le = q("lengthFt", sys, r.leqFt, 0), dP = q("dpPsi", sys, r.dpTotal);
  const lt = `L ${L.v} + ${Le.v} ${L.u}  ·  ΔP ${dP.v} ${dP.u}`;
  c.font = F(500, 13, "m"); c.fillStyle = tok.text; c.textAlign = "center";
  c.fillText(lt, 0, GROUND + 30 + 6 * TS);
}

function path(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); }
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.stroke(); }
function tintOf(hex, a) {
  const h = hex.replace("#", ""); if (h.length !== 6) return `rgba(20,33,61,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
function flange(c, x, y, R, tok) {
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.roundRect ? c.roundRect(x - 7, y - R - 12, 14, 2 * R + 24, 3) : c.rect(x - 7, y - R - 12, 14, 2 * R + 24); c.fill(); c.stroke();
}
function valve(c, x, y, R, tok, isCheck) {
  const h = R + 10, w = Math.min(R * 0.75 + 8, 36);
  c.fillStyle = tok.card; c.strokeStyle = tok.text; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - w, y - h); c.lineTo(x + w, y + h); c.lineTo(x + w, y - h); c.lineTo(x - w, y + h); c.closePath(); c.fill(); c.stroke();
  if (isCheck) { c.beginPath(); c.moveTo(x - 8, y - h - 16); c.lineTo(x + 10, y - h - 16); c.stroke(); c.beginPath(); c.moveTo(x + 14, y - h - 16); c.lineTo(x + 6, y - h - 21); c.lineTo(x + 6, y - h - 11); c.closePath(); c.fillStyle = tok.text; c.fill(); }
  else { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h - 18); c.stroke(); c.beginPath(); c.moveTo(x - 16, y - h - 18); c.lineTo(x + 16, y - h - 18); c.stroke(); }
}
function reducer(c, x, y, R, kind, tok) {
  const r2 = R * 0.6, w = 34;
  const [a, b] = kind === "exp" ? [r2, R + 4] : [R + 4, r2];
  c.fillStyle = tok.card; c.strokeStyle = tok.text; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - w / 2, y - a); c.lineTo(x + w / 2, y - b); c.lineTo(x + w / 2, y + b); c.lineTo(x - w / 2, y + a); c.closePath(); c.fill(); c.stroke();
}
function tank(c, cx, tok, liquid) {
  const x = cx - 90, w = 180, top = -210, bot = 210, level = -60;
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, top + 20); c.lineTo(cx, top - 10); c.lineTo(x + w, top + 20); c.lineTo(x + w, bot); c.lineTo(x, bot); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = liquid; c.fillRect(x + 3, level, w - 6, bot - level - 3);
  c.strokeStyle = tok.steelEdge; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(x + 6, level); c.lineTo(x + w - 6, level); c.stroke(); c.setLineDash([]);
  c.strokeStyle = tok.line; c.beginPath(); c.moveTo(x - 10, bot + 2); c.lineTo(x + w + 10, bot + 2); c.stroke();
}
function vessel(c, cx, tok) {
  const w = 150, x = cx - w / 2, top = -200, bot = 200, rr = w / 2;
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, top + rr * 0.5); c.ellipse(cx, top + rr * 0.5, rr, rr * 0.5, 0, Math.PI, 0); c.lineTo(x + w, bot - rr * 0.5);
  c.ellipse(cx, bot - rr * 0.5, rr, rr * 0.5, 0, 0, Math.PI); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(cx - 50, bot + 22); c.lineTo(cx - 50, 262); c.moveTo(cx + 50, bot + 22); c.lineTo(cx + 50, 262); c.stroke();
}
function pump(c, cx, cy, tok, side) {
  const r = 50, dir = side === "in" ? 1 : -1;
  c.lineWidth = 2; c.strokeStyle = tok.steelEdge; c.fillStyle = tok.steel;
  // motor behind the casing
  c.beginPath(); c.roundRect ? c.roundRect(cx + dir * 40 - (dir > 0 ? 0 : 110), cy - 34, 110, 68, 8) : c.rect(cx + dir * 40 - (dir > 0 ? 0 : 110), cy - 34, 110, 68); c.fill(); c.stroke();
  // discharge nozzle (up) and casing
  c.fillRect(cx - 16, cy - r - 46, 32, 46); c.strokeRect(cx - 16, cy - r - 46, 32, 46);
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = tok.card; c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.fill(); c.stroke();
  // skid
  const m0 = dir > 0 ? cx + 40 : cx - 150, m1 = m0 + 110, k0 = Math.min(cx - 70, m0 - 10), k1 = Math.max(cx + 70, m1 + 10);
  c.strokeStyle = tok.steelEdge; c.beginPath(); c.moveTo(k0, 262); c.lineTo(k0, cy + r + 10); c.lineTo(k1, cy + r + 10); c.lineTo(k1, 262); c.stroke();
}
function gauge(c, x, ytop, label, val, frac, tok, F, TS) {
  const R0 = 26, cy = ytop - 46 - R0;
  c.strokeStyle = tok.steelEdge; c.lineWidth = 3; c.beginPath(); c.moveTo(x, ytop); c.lineTo(x, cy + R0); c.stroke();
  c.fillStyle = tok.card; c.lineWidth = 2; c.beginPath(); c.arc(x, cy, R0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = tok.muted; c.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
    c.beginPath(); c.moveTo(x + Math.cos(a) * (R0 - 4), cy + Math.sin(a) * (R0 - 4)); c.lineTo(x + Math.cos(a) * (R0 - 8), cy + Math.sin(a) * (R0 - 8)); c.stroke();
  }
  const a = Math.PI * 0.75 + Math.max(0.03, Math.min(0.97, frac * 1.2 + 0.05)) * Math.PI * 1.5;
  c.strokeStyle = tok.text; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, cy); c.lineTo(x + Math.cos(a) * (R0 - 9), cy + Math.sin(a) * (R0 - 9)); c.stroke();
  c.fillStyle = tok.amber; c.beginPath(); c.arc(x, cy, 3.2, 0, Math.PI * 2); c.fill();
  c.textAlign = "left"; c.fillStyle = tok.text; c.font = F(800, 16); c.fillText(label, x + R0 + 10, cy - 4);
  c.font = F(500, 13, "m"); c.fillStyle = tok.muted; c.fillText(val, x + R0 + 10, cy + 14 * TS);
}
