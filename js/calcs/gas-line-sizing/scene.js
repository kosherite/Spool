// Gas Line Sizing — canvas scene: vessel, pipe run with cutaway, gauges, failure modes.
import { npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";
import { V_LIMIT_FTS } from "./calc.js";

/** World boxes the camera fits to. */
export const bounds = {
  full: { w: 1420, h: 620, cx: 0, cy: 0 },
  compact: { w: 1080, h: 560, cx: 70, cy: -30 },
};

const PIPE_X1 = 520, CUT0 = -250, CUT1 = 300;
const VX = -560, VW = 150, VTOP = -230, VBOT = 200;
const X0 = VX + VW / 2;
const FLANGES = [X0 + 18, -390, 462];

const seeded = (n, seed) => {
  let x = seed; const out = [];
  const nx = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) out.push([nx(), nx(), nx()]);
  return out;
};
const FROST = seeded(260, 7), XTAL = seeded(36, 31);

let parts = [], puffs = [], hydG = 0;

const pipeR = (r) => 18 + r.dIn * 6.2;
const speedVis = (V) => 40 + 120 * Math.log10(1 + V);

function spawnPuff(x, y, vx, vy, big) {
  const life = big ? 2.6 : 1.6, age = Math.random() * life;
  puffs.push({ x: x + vx * age, y: y + vy * age, vx, vy, rad: (big ? 10 : 5) + age * (big ? 40 : 22), life, age, big });
}

export function draw(c, env) {
  const { now, dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const R = pipeR(r), fx = r.fx;
  const want = Math.round(60 + R * 2.2);
  while (parts.length < want) parts.push({ x: Math.random(), y: Math.random() * 2 - 1, l: 0.4 + Math.random() * 0.6 });
  if (parts.length > want) parts.length = want;

  // vessel
  c.lineWidth = 2; c.strokeStyle = tok.steelEdge; c.fillStyle = tok.steel;
  vessel(c, VX - VW / 2, VTOP, VW, VBOT - VTOP);
  c.save(); c.beginPath(); c.rect(VX - VW / 2 + 6, VBOT - 80, VW - 12, 60); c.clip();
  c.fillStyle = tok.line; c.fillRect(VX - VW / 2, VBOT - 80, VW, 80); c.restore();
  c.strokeStyle = tok.steelEdge; c.beginPath();
  c.moveTo(VX - 50, VBOT + 24); c.lineTo(VX - 50, VBOT + 60); c.moveTo(VX + 50, VBOT + 24); c.lineTo(VX + 50, VBOT + 60); c.stroke();

  // pipe (vibrates above erosional)
  c.save();
  if (fx.shake && playing) {
    const a = Math.min(4, 1.4 * (r.V / r.Ve));
    c.translate(Math.sin(now * 0.071) * a, Math.cos(now * 0.093) * a * 0.6);
  }
  const x1 = PIPE_X1;
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.fillRect(X0, -R, x1 - X0, 2 * R);
  c.fillStyle = tok.card; c.fillRect(CUT0, -R + 5, CUT1 - CUT0, 2 * R - 10);
  c.fillStyle = tok.soft; c.fillRect(CUT0, -R + 5, CUT1 - CUT0, Math.max(3, R * 0.12));
  c.beginPath(); c.moveTo(X0, -R); c.lineTo(x1, -R); c.moveTo(X0, R); c.lineTo(x1, R); c.stroke();
  c.lineWidth = 1.5; ellipse(c, CUT0, 0, R * 0.28, R - 2); ellipse(c, CUT1, 0, R * 0.28, R - 2);
  c.lineWidth = 2; c.fillStyle = tok.steel; c.beginPath(); c.ellipse(x1, 0, R * 0.3, R, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = tok.card; c.beginPath(); c.ellipse(x1, 0, R * 0.3 - 4, R - 5, 0, 0, Math.PI * 2); c.fill();
  FLANGES.forEach((x) => flange(c, x, R, tok));

  const segs = [[X0, CUT0 - R * 0.28], [CUT1 + R * 0.28, x1 - R * 0.3]];
  if (fx.frost) {
    c.fillStyle = "#ffffff";
    for (const [a, b, k] of FROST) {
      const sg = segs[k < 0.35 ? 0 : 1];
      c.globalAlpha = 0.35 + 0.5 * k;
      c.fillRect(sg[0] + a * (sg[1] - sg[0]), -R + 3 + b * (2 * R - 6), 1.5 + k * 2.5, 1.5 + k * 2.5);
    }
    c.globalAlpha = 1;
  }
  if (fx.overstress) {
    c.save(); c.beginPath(); segs.forEach(([a, b]) => c.rect(a, -R + 1, b - a, 2 * R - 2)); c.clip();
    c.strokeStyle = tok.bad; c.globalAlpha = 0.45; c.lineWidth = 2;
    for (let x = X0 - 2 * R; x < x1; x += 12) { c.beginPath(); c.moveTo(x, R); c.lineTo(x + 2 * R, -R); c.stroke(); }
    c.restore();
  }

  // gas inside the cutaway
  c.save(); c.beginPath(); c.rect(CUT0 + 2, -R + 6, CUT1 - CUT0 - 4, 2 * R - 12); c.clip();
  if (layers.flow) {
    const sp = speedVis(r.V), span = CUT1 - CUT0;
    c.strokeStyle = r.V >= r.Ve ? tok.bad : r.V > V_LIMIT_FTS ? tok.amber : tok.particle;
    c.lineCap = "round";
    for (const p of parts) {
      const prof = Math.pow(Math.max(0.02, 1 - Math.abs(p.y)), 1 / 7);
      const stall = fx.stall ? Math.max(0.06, 1 - p.x * 0.94) : 1;
      if (playing) p.x += (sp * prof * stall * dt) / span;
      if (p.x > 1) { p.x -= 1; p.y = Math.random() * 2 - 1; }
      const px = CUT0 + p.x * span, py = p.y * (R - 10);
      const len = 4 + Math.min(30, sp * prof * stall * 0.12) * p.l;
      c.globalAlpha = 0.35 + 0.55 * p.l; c.lineWidth = 1.6 + p.l * 1.2;
      c.beginPath(); c.moveTo(px - len, py); c.lineTo(px, py); c.stroke();
    }
    c.globalAlpha = 1;
  }
  if (layers.profile) {
    const xm = CUT1 - 70; c.strokeStyle = tok.text; c.fillStyle = tok.text; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(xm, -R + 8); c.lineTo(xm, R - 8); c.stroke();
    for (let i = -4; i <= 4; i++) {
      const yy = i / 4.6, L = 56 * Math.pow(1 - Math.abs(yy), 1 / 7), py = yy * (R - 10);
      c.beginPath(); c.moveTo(xm, py); c.lineTo(xm + L, py); c.stroke();
      c.beginPath(); c.moveTo(xm + L, py); c.lineTo(xm + L - 6, py - 3.5); c.lineTo(xm + L - 6, py + 3.5); c.closePath(); c.fill();
    }
  }
  hydG = fx.hydrate && !playing ? 0.8 : Math.max(0, Math.min(1, hydG + ((fx.hydrate ? 1 : -2) * dt) / 5));
  if (hydG > 0.01) {
    c.fillStyle = tok.card; c.strokeStyle = tok.steelEdge; c.lineWidth = 1.2;
    for (const [a, b, k] of XTAL) {
      const xx = CUT0 + 20 + a * (CUT1 - CUT0 - 40), yy = b < 0.5 ? -R + 6 : R - 6;
      const sz = (6 + k * R * 0.55 * (0.5 + 0.5 * Math.sin(Math.PI * a))) * hydG;
      c.beginPath();
      for (let j = 0; j < 6; j++) {
        const ang = (j / 6) * Math.PI * 2 + k, rr = sz * (j % 2 ? 1 : 0.75);
        c.lineTo(xx + Math.cos(ang) * rr * 0.8, yy + Math.sin(ang) * rr);
      }
      c.closePath(); c.fill(); c.stroke();
    }
  }
  c.restore();

  const mid = (CUT0 + CUT1) / 2;
  if (fx.rupture) {
    c.beginPath(); c.moveTo(mid - 80, -R - 2);
    for (let i = 0; i <= 16; i++) c.lineTo(mid - 80 + i * 10, -R - 2 - (i % 2 ? 9 : 0) - (i % 3 === 0 ? 5 : 0));
    for (let i = 16; i >= 0; i--) c.lineTo(mid - 80 + i * 10, -R + 16 + (i % 2 ? 6 : 0) + Math.sin(i) * 4);
    c.closePath(); c.fillStyle = tok.page; c.fill(); c.strokeStyle = tok.bad; c.lineWidth = 2; c.stroke();
  }

  // outlet: arrow, or shock diamonds when choked
  if (fx.choke) {
    for (let k = 0; k < 4; k++) {
      const cx = x1 + 34 + k * 44, hh = R * 0.85 * (1 - k * 0.2), ww = 20;
      c.globalAlpha = (1 - k * 0.22) * (playing ? 0.75 + 0.25 * Math.sin(now * 0.03 + k) : 1);
      c.strokeStyle = tok.amber; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(cx - ww, 0); c.lineTo(cx, -hh); c.lineTo(cx + ww, 0); c.lineTo(cx, hh); c.closePath(); c.stroke();
    }
    c.globalAlpha = 1;
  } else {
    c.fillStyle = tok.muted; c.strokeStyle = tok.muted; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x1 + 40, 0); c.lineTo(x1 + 110, 0); c.stroke();
    c.beginPath(); c.moveTo(x1 + 118, 0); c.lineTo(x1 + 104, -8); c.lineTo(x1 + 104, 8); c.closePath(); c.fill();
  }
  if (fx.shake) {
    c.strokeStyle = tok.bad; c.lineWidth = 2; c.globalAlpha = 0.7;
    for (const xx of [CUT0 - 60, CUT1 + 90]) for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.arc(xx, sgn * (R + 8), 8 + k * 7, sgn < 0 ? Math.PI * 1.2 : Math.PI * 0.2, sgn < 0 ? Math.PI * 1.8 : Math.PI * 0.8);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  c.restore();

  // escaping gas
  if (fx.leak || fx.rupture) {
    let n = playing ? ((fx.rupture ? 70 : 0) + (fx.leak ? 36 : 0)) * dt : puffs.length < 120 ? 6 : 0;
    while (n > 0 && puffs.length < 520) {
      if (Math.random() < n) {
        if (fx.rupture && (!fx.leak || Math.random() < 0.65)) {
          spawnPuff(mid - 70 + Math.random() * 140, -R - 6, (Math.random() - 0.5) * 120, -(160 + Math.random() * 200), true);
        } else {
          const up = Math.random() < 0.5;
          spawnPuff(FLANGES[Math.floor(Math.random() * 3)], up ? -R - 12 : R + 12, (Math.random() - 0.5) * 50, (up ? -1 : 1) * (70 + Math.random() * 90), false);
        }
      }
      n -= 1;
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    if (playing) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rad += (p.big ? 40 : 22) * dt; p.vx *= 0.99; p.vy *= 0.985; }
    if (p.age > p.life || (!fx.leak && !fx.rupture)) { puffs.splice(i, 1); continue; }
    c.globalAlpha = (1 - p.age / p.life) * (p.big ? 0.13 : 0.26); c.fillStyle = tok.muted;
    c.beginPath(); c.arc(p.x, p.y, p.rad, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;

  // labels
  const lowLbl = R + 20 + 8 * TS;
  c.font = F(700, 13); c.fillStyle = tok.bad; c.textAlign = "center";
  if (fx.rupture) c.fillText("Rupture", mid, -R - 150 - 10 * TS);
  if (fx.choke) { c.textAlign = "left"; c.fillText("Ma 1", x1 + 24, R + 16 + 14 * TS); c.textAlign = "center"; }
  if (fx.leak) { c.textAlign = "right"; c.fillText("Leak", -400, -R - 24); c.textAlign = "center"; }
  if (fx.overstress) { c.textAlign = "left"; c.fillText(`σh ${fixed((r.hoop / r.mat.S) * 100, 0)}% S`, X0 + 40, lowLbl); c.textAlign = "center"; }
  if (fx.hydrate) c.fillText("Hydrates", mid, lowLbl);
  else if (fx.frost) { c.fillStyle = tok.muted; c.fillText("Frost", mid, lowLbl); }

  if (!layers.dims) return;
  const P1 = q("pressG", sys, s.p), P2 = q("psig", sys, r.p2g);
  gauge(c, -330, -R, "P₁", `${P1.v} ${P1.u}`, 0.5, tok, F, TS);
  gauge(c, 490, -R, "P₂", fx.stall ? "—" : `${P2.v} ${P2.u}`, fx.stall ? 0 : Math.max(0, Math.min(1, P2.raw / (P1.raw || 1))) * 0.5, tok, F, TS);

  const vq = q("velocity", sys, r.V), ly = -R - 34 - 14 * TS;
  c.textAlign = "center"; c.font = F(800, 34);
  c.fillStyle = r.V >= r.Ve ? tok.bad : r.V > V_LIMIT_FTS ? tok.amberText : tok.text;
  c.fillText(vq.v, mid - 16, ly);
  const vw = c.measureText(vq.v).width;
  c.fillStyle = tok.muted; c.font = F(600, 15); c.textAlign = "left"; c.fillText(vq.u, mid - 16 + vw / 2 + 6, ly);

  const dx = CUT1 + 38, idq = q("inch", sys, r.dIn, sys === "metric" ? 1 : 3);
  c.strokeStyle = tok.text; c.fillStyle = tok.text; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(dx, -R + 5); c.lineTo(dx, R - 5); c.stroke();
  tick(c, dx, -R + 5); tick(c, dx, R - 5);
  c.font = F(500, 13, "m"); c.textAlign = "left";
  c.fillText(`${idq.v} ${idq.u}`, dx + 10, -4);
  c.fillStyle = tok.muted; c.fillText(`${npsLabel(s.nps)}" S${s.sch}`, dx + 10, 4 + 12 * TS);

  const ly2 = R + 46 + (fx.overstress || fx.hydrate || fx.frost ? 14 * TS : 0);
  c.strokeStyle = tok.muted; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(X0 + 18, ly2); c.lineTo(x1, ly2); c.stroke();
  c.beginPath(); c.moveTo(X0 + 18, ly2 - 8); c.lineTo(X0 + 18, ly2 + 8); c.moveTo(x1, ly2 - 8); c.lineTo(x1, ly2 + 8); c.stroke();
  const L = q("lengthM", sys, s.len, 0), dP = q("dpPsi", sys, r.dpLine);
  const lt = `${L.v} ${L.u}  ·  ΔP ${dP.v} ${dP.u}`, lm = (X0 + 18 + x1) / 2;
  c.font = F(500, 13, "m"); const ltw = c.measureText(lt).width;
  c.fillStyle = tok.page; c.fillRect(lm - ltw / 2 - 8, ly2 - 10 * TS, ltw + 16, 20 * TS);
  c.fillStyle = tok.text; c.textAlign = "center"; c.fillText(lt, lm, ly2 + 5 * TS);
}

function tick(c, x, y) { c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.stroke(); }
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.stroke(); }
function flange(c, x, r, tok) {
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.roundRect ? c.roundRect(x - 7, -r - 12, 14, 2 * r + 24, 3) : c.rect(x - 7, -r - 12, 14, 2 * r + 24);
  c.fill(); c.stroke();
}
function vessel(c, x, y, w, h) {
  const rr = w / 2;
  c.beginPath(); c.moveTo(x, y + rr * 0.5);
  c.ellipse(x + rr, y + rr * 0.5, rr, rr * 0.5, 0, Math.PI, 0); c.lineTo(x + w, y + h - rr * 0.5);
  c.ellipse(x + rr, y + h - rr * 0.5, rr, rr * 0.5, 0, 0, Math.PI); c.closePath(); c.fill(); c.stroke();
}
function gauge(c, x, ytop, label, val, frac, tok, F, TS) {
  const R0 = 30, cy = ytop - 54 - R0;
  c.strokeStyle = tok.steelEdge; c.lineWidth = 3; c.beginPath(); c.moveTo(x, ytop); c.lineTo(x, cy + R0); c.stroke();
  c.fillStyle = tok.card; c.lineWidth = 2; c.beginPath(); c.arc(x, cy, R0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = tok.muted; c.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
    c.beginPath(); c.moveTo(x + Math.cos(a) * (R0 - 4), cy + Math.sin(a) * (R0 - 4)); c.lineTo(x + Math.cos(a) * (R0 - 9), cy + Math.sin(a) * (R0 - 9)); c.stroke();
  }
  const a = Math.PI * 0.75 + Math.max(0.03, Math.min(0.97, frac * 1.2 + 0.05)) * Math.PI * 1.5;
  c.strokeStyle = tok.text; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, cy); c.lineTo(x + Math.cos(a) * (R0 - 10), cy + Math.sin(a) * (R0 - 10)); c.stroke();
  c.fillStyle = tok.amber; c.beginPath(); c.arc(x, cy, 3.5, 0, Math.PI * 2); c.fill();
  c.textAlign = "left"; c.fillStyle = tok.text; c.font = F(800, 16); c.fillText(label, x + R0 + 10, cy - 4);
  c.font = F(500, 13, "m"); c.fillStyle = tok.muted; c.fillText(val, x + R0 + 10, cy + 14 * TS);
}
