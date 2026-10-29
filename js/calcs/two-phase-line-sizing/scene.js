// 2-Phase Line Sizing — canvas scene: wellhead → flowline (inclined with ΔH) → separator.
// The cutaway draws the Beggs & Brill flow pattern: stratified, slug, dispersed bubble or mist.
import { npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";

export const bounds = {
  full: { w: 1500, h: 660, cx: 40, cy: 40 },
  compact: { w: 1160, h: 620, cx: 40, cy: 30 },
};

const GROUND = 230, Y0 = 40, X0 = -470, X1 = 470, CUT = 270;

const seeded = (n, seed) => {
  let x = seed; const out = [];
  const nx = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) out.push([nx(), nx(), nx()]);
  return out;
};
const FROST = seeded(260, 3), XTAL = seeded(30, 9), BUB = seeded(140, 21), DROP = seeded(160, 33);

let drops = [], puffs = [], hydG = 0, phase = 0, sepLevel = 0;

const pipeR = (r) => 16 + r.dIn * 6.2;

/** Liquid height fraction h/D for a stratified layer occupying area fraction HL. */
function levelFrac(HL) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2, th = 2 * Math.acos(1 - 2 * m);
    ((th - Math.sin(th)) / (2 * Math.PI) < HL ? (lo = m) : (hi = m));
  }
  return (lo + hi) / 2;
}

export function draw(c, env) {
  const { now, dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const R = pipeR(r), Ri = R - 5, fx = r.fx;
  const liquid = tintOf(tok.particle, 0.3);
  const aVis = Math.max(-0.2, Math.min(0.2, r.theta));          // visual tilt, clamped
  const dy = -Math.tan(aVis) * (X1 - X0);
  const mx = (X0 + X1) / 2, my = Y0 + dy / 2, ang = Math.atan2(dy, X1 - X0), Lp = Math.hypot(X1 - X0, dy);
  const toW = (lx, ly) => [mx + Math.cos(ang) * lx - Math.sin(ang) * ly, my + Math.sin(ang) * lx + Math.cos(ang) * ly];
  const tspd = 30 + 80 * Math.log10(1 + r.Vm);                     // px/s for the mixture
  if (playing) phase += dt * tspd;

  // slug arrival: periodic impulse
  const slugPeriod = 2 * Ri * 7;
  const slugHit = fx.slug ? Math.pow(Math.max(0, Math.sin((phase / slugPeriod) * Math.PI)), 16) : 0;

  c.strokeStyle = tok.line; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-720, GROUND); c.lineTo(760, GROUND); c.stroke();

  wellhead(c, -560, tok);
  separator(c, 610, Y0 + dy, tok, liquid, r, fx, slugHit, dt, playing);

  // ---- pipe in its own frame ----
  c.save();
  if (playing && (fx.shake || slugHit > 0.05)) {
    const a = fx.shake ? Math.min(4, 1.4 * (r.Vm / r.Ve)) : 3 * slugHit;
    c.translate(Math.sin(now * 0.071) * a, Math.cos(now * 0.093) * a * 0.6);
  }
  c.translate(mx, my); c.rotate(ang);
  const h = Lp / 2;
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.fillRect(-h, -R, Lp, 2 * R);
  c.beginPath(); c.moveTo(-h, -R); c.lineTo(h, -R); c.moveTo(-h, R); c.lineTo(h, R); c.stroke();
  const segs = [[-h, -CUT - R * 0.28], [CUT + R * 0.28, h]];
  if (fx.frost) {
    c.fillStyle = "#ffffff";
    for (const [a, b, k] of FROST) { const sg = segs[k < 0.5 ? 0 : 1]; c.globalAlpha = 0.35 + 0.5 * k; c.fillRect(sg[0] + a * (sg[1] - sg[0]), -R + 3 + b * (2 * R - 6), 1.5 + k * 2.5, 1.5 + k * 2.5); }
    c.globalAlpha = 1;
  }
  if (fx.overstress) {
    c.save(); c.beginPath(); segs.forEach(([a, b]) => c.rect(a, -R + 1, b - a, 2 * R - 2)); c.clip();
    c.strokeStyle = tok.bad; c.globalAlpha = 0.45; c.lineWidth = 2;
    for (let x = -h - 2 * R; x < h; x += 12) { c.beginPath(); c.moveTo(x, R); c.lineTo(x + 2 * R, -R); c.stroke(); }
    c.restore();
  }
  for (const x of [-h + 16, -360, 360]) flange(c, x, R, tok);

  // cutaway
  c.fillStyle = tok.card; c.fillRect(-CUT, -Ri, 2 * CUT, 2 * Ri);
  c.save(); c.beginPath(); c.rect(-CUT + 2, -Ri, 2 * CUT - 4, 2 * Ri); c.clip();
  if (layers.flow) drawPattern(c, r, Ri, tok, liquid, dt, playing, phase, slugPeriod);
  else { c.fillStyle = liquid; const yl = Ri - 2 * Ri * levelFrac(r.HL); c.fillRect(-CUT, yl, 2 * CUT, Ri - yl); }

  // hydrate crystals
  hydG = fx.hydrate && !playing ? 0.8 : Math.max(0, Math.min(1, hydG + ((fx.hydrate ? 1 : -2) * dt) / 5));
  if (hydG > 0.01) {
    c.fillStyle = tok.card; c.strokeStyle = tok.steelEdge; c.lineWidth = 1.2;
    for (const [a, b, k] of XTAL) {
      const xx = -CUT + 16 + a * (2 * CUT - 32), yy = b < 0.5 ? -Ri + 1 : Ri - 1;
      const sz = (6 + k * R * 0.55 * (0.5 + 0.5 * Math.sin(Math.PI * a))) * hydG;
      c.beginPath();
      for (let j = 0; j < 6; j++) { const t = (j / 6) * Math.PI * 2 + k, rr = sz * (j % 2 ? 1 : 0.72); c.lineTo(xx + Math.cos(t) * rr * 0.8, yy + Math.sin(t) * rr); }
      c.closePath(); c.fill(); c.stroke();
    }
  }
  c.restore();
  c.strokeStyle = tok.steelEdge; c.lineWidth = 1.5;
  ellipse(c, -CUT, 0, R * 0.28, R - 2); ellipse(c, CUT, 0, R * 0.28, R - 2);

  if (fx.rupture) {
    c.beginPath(); c.moveTo(-70, -R - 2);
    for (let i = 0; i <= 14; i++) c.lineTo(-70 + i * 10, -R - 2 - (i % 2 ? 9 : 0) - (i % 3 === 0 ? 5 : 0));
    for (let i = 14; i >= 0; i--) c.lineTo(-70 + i * 10, -R + 14 + (i % 2 ? 6 : 0));
    c.closePath(); c.fillStyle = tok.page; c.fill(); c.strokeStyle = tok.bad; c.lineWidth = 2; c.stroke();
  }
  if (fx.shake) {
    c.strokeStyle = tok.bad; c.lineWidth = 2; c.globalAlpha = 0.7;
    for (const xx of [-CUT - 50, CUT + 50]) for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) {
      c.beginPath(); c.arc(xx, sg * (R + 8), 8 + k * 7, sg < 0 ? Math.PI * 1.2 : Math.PI * 0.2, sg < 0 ? Math.PI * 1.8 : Math.PI * 0.8); c.stroke();
    }
    c.globalAlpha = 1;
  }
  c.restore();

  // escaping fluid
  const ruptW = toW(0, -R - 6);
  if (fx.leak || fx.rupture) {
    const n = playing ? ((fx.rupture ? 80 : 0) + (fx.leak ? 30 : 0)) * dt : 0;
    for (let i = 0; i < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i++) {
      const src = fx.rupture && (!fx.leak || Math.random() < 0.65) ? [ruptW[0] + (Math.random() - 0.5) * 120, ruptW[1], 1] : [...toW([-h + 16, -360, 360][Math.floor(Math.random() * 3)], -R - 12), 0];
      if (Math.random() < 0.5) drops.push({ x: src[0], y: src[1], vx: (Math.random() - 0.5) * (src[2] ? 200 : 30), vy: src[2] ? -(220 + Math.random() * 220) : -(20 + Math.random() * 40) });
      else { const life = src[2] ? 2.4 : 1.5; puffs.push({ x: src[0], y: src[1], vx: (Math.random() - 0.5) * 60, vy: -(src[2] ? 180 : 80) - Math.random() * 80, rad: src[2] ? 10 : 5, age: 0, life, big: src[2] }); }
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    if (playing) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rad += (p.big ? 36 : 20) * dt; p.vy *= 0.985; }
    if (p.age > p.life || (!fx.leak && !fx.rupture)) { puffs.splice(i, 1); continue; }
    c.globalAlpha = (1 - p.age / p.life) * (p.big ? 0.13 : 0.24); c.fillStyle = tok.muted;
    c.beginPath(); c.arc(p.x, p.y, p.rad, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = tok.particle;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (playing) { d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    if (d.y > GROUND || drops.length > 500 || (!fx.leak && !fx.rupture)) { drops.splice(i, 1); continue; }
    c.globalAlpha = 0.6; c.beginPath(); c.arc(d.x, d.y, 2.3, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;

  // labels
  const [lx, ly] = toW(0, -R);
  c.textAlign = "center";
  if (fx.rupture) { c.font = F(700, 13); c.fillStyle = tok.bad; c.fillText("Rupture", lx, ly - 130); }
  const under = toW(0, R + 20 + 6 * TS);
  c.font = F(700, 13);
  if (fx.hydrate) { c.fillStyle = tok.bad; c.fillText("Hydrates", under[0], under[1]); }
  else if (fx.frost) { c.fillStyle = tok.muted; c.fillText("Frost", under[0], under[1]); }
  if (fx.leak) { const w = toW(-360, -R - 30); c.fillStyle = tok.bad; c.fillText("Leak", w[0] - 30, w[1]); }
  if (fx.overstress) { const w = toW(-h + 60, R + 20); c.fillStyle = tok.bad; c.textAlign = "left"; c.fillText(`σh ${fixed((r.hoop / r.mat.S) * 100, 0)}% S`, w[0], w[1] + 6 * TS); c.textAlign = "center"; }

  if (!layers.dims) return;
  const P1 = q("pressG", sys, s.p), P2 = q("psig", sys, r.p2g);
  const g1 = toW(-300, -R), g2 = toW(300, -R);
  gauge(c, g1[0], g1[1], "P₁", `${P1.v} ${P1.u}`, 0.5, tok, F, TS);
  gauge(c, g2[0], g2[1], "P₂", r.P2 > 0 ? `${P2.v} ${P2.u}` : "—", r.P2 > 0 ? Math.max(0, Math.min(1, P2.raw / (P1.raw || 1))) * 0.5 : 0, tok, F, TS);

  // regime + velocity headline
  const head = toW(0, -R - 34 - 14 * TS);
  const vq = q("velocity", sys, r.Vm);
  c.textAlign = "center"; c.font = F(800, 34);
  c.fillStyle = r.Vm >= r.Ve ? tok.bad : tok.text;
  c.fillText(vq.v, head[0] - 16, head[1]);
  const vw = c.measureText(vq.v).width;
  c.fillStyle = tok.muted; c.font = F(600, 15); c.textAlign = "left"; c.fillText(vq.u, head[0] - 16 + vw / 2 + 6, head[1]);
  c.textAlign = "center"; c.font = F(700, 13); c.fillStyle = fx.slug ? tok.amberText : tok.muted;
  c.fillText(`${r.patName} · H_L ${fixed(r.HL * 100, 0)}%`, head[0], head[1] + 20 * TS);

  const idw = toW(CUT + 40, 0), idq = q("inch", sys, r.dIn, sys === "metric" ? 1 : 3);
  c.font = F(500, 13, "m"); c.textAlign = "left"; c.fillStyle = tok.text;
  c.fillText(`${idq.v} ${idq.u}`, idw[0], idw[1] + R + 26);
  c.fillStyle = tok.muted; c.fillText(`${npsLabel(s.nps)}" S${s.sch}`, idw[0], idw[1] + R + 30 + 14 * TS);

  const L = q("lengthM", sys, s.len, 0), dP = q("dpPsi", sys, r.dpLine);
  let lt = `L ${L.v} ${L.u}  ·  ΔP ${dP.v} ${dP.u}`;
  if (s.dh) { const dh = q("lengthM", sys, s.dh, 1); lt += `  ·  ΔH ${s.dh > 0 ? "+" : ""}${dh.v} ${dh.u}`; }
  c.font = F(500, 13, "m"); c.fillStyle = tok.text; c.textAlign = "center";
  c.fillText(lt, 0, GROUND + 32 + 6 * TS);
}

/* ---------- flow patterns (pipe-local frame, x along flow, +y toward gravity) ---------- */
function drawPattern(c, r, Ri, tok, liquid, dt, playing, phase, slugPeriod) {
  const pat = r.pat, X = CUT;
  const dot = (x, y, rad, fill, stroke) => { c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } };
  const wrap = (v) => ((v % (2 * X)) + 2 * X) % (2 * X) - X;

  if (pat === "seg") {
    const yl = Ri - 2 * Ri * levelFrac(r.HL);
    c.fillStyle = liquid; c.beginPath(); c.moveTo(-X, Ri);
    for (let x = -X; x <= X; x += 8) c.lineTo(x, yl + Math.sin((x - phase * 0.4) / 18) * Math.min(4, Ri * 0.08));
    c.lineTo(X, Ri); c.closePath(); c.fill();
    c.strokeStyle = tok.particle; c.globalAlpha = 0.5; c.lineWidth = 1.5; c.beginPath();
    for (let x = -X; x <= X; x += 8) { const y = yl + Math.sin((x - phase * 0.4) / 18) * Math.min(4, Ri * 0.08); x === -X ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke(); c.globalAlpha = 1;
    streaks(c, -Ri + 4, yl - 4, phase * 1.6, tok.particle, 0.35, 26);    // gas, faster
    streaks(c, yl + 4, Ri - 3, phase * 0.4, tok.particle, 0.6, 14);      // liquid, slower
    return;
  }

  if (pat === "int" || pat === "tr") {
    // liquid everywhere, then Taylor bubbles riding over a film
    c.fillStyle = liquid; c.fillRect(-X, -Ri, 2 * X, 2 * Ri);
    const yf = Ri - 2 * Ri * Math.max(0.18, levelFrac(r.HL) * 0.45);
    const bubL = slugPeriod * 0.6, off = phase * 1.2;
    for (let k = -2; k <= Math.ceil((2 * X) / slugPeriod) + 1; k++) {
      const x0 = ((off % slugPeriod) + slugPeriod) % slugPeriod - X + (k - 1) * slugPeriod;
      const x1 = x0 + bubL, nose = Math.min(Ri, (yf + Ri) * 0.9);
      c.fillStyle = tok.card; c.beginPath();
      c.moveTo(x0, yf); c.lineTo(x1 - nose, yf);
      c.quadraticCurveTo(x1 + nose * 0.2, yf, x1, (yf - Ri) / 2);
      c.quadraticCurveTo(x1 - nose * 0.1, -Ri, x1 - nose, -Ri);
      c.lineTo(x0, -Ri); c.closePath(); c.fill();
      c.strokeStyle = tok.particle; c.globalAlpha = 0.45; c.lineWidth = 1.2; c.stroke(); c.globalAlpha = 1;
      // dispersed bubbles shed into the slug body behind the bubble tail
      for (let j = 0; j < 7; j++) {
        const bx = x0 - 6 - ((j * 37) % (slugPeriod - bubL - 10)), by = -Ri * 0.7 + ((j * 53) % (Ri * 1.2));
        dot(bx, by, 2 + (j % 3), tok.card, tok.particle);
      }
    }
    return;
  }

  // dispersed: bubbles in liquid, or mist with droplets when gas dominates
  if (r.lam >= 0.25) {
    c.fillStyle = liquid; c.fillRect(-X, -Ri, 2 * X, 2 * Ri);
    c.lineWidth = 1;
    for (const [a, b, k] of BUB) {
      const x = wrap(-X + a * 2 * X + phase * (0.9 + 0.2 * k)), y = -Ri + 4 + Math.pow(b, 1.4) * (2 * Ri - 8);
      if (k > (1 - r.lam) * 1.6) continue;
      dot(x, y, 1.5 + k * 3, tok.card, tok.particle);
    }
  } else {
    c.fillStyle = liquid;
    const film = Math.max(2, Ri * 0.08);
    c.fillRect(-X, -Ri, 2 * X, film * 0.6); c.fillRect(-X, Ri - film * 1.6, 2 * X, film * 1.6);
    for (const [a, b, k] of DROP) {
      const x = wrap(-X + a * 2 * X + phase * (1.4 + 0.4 * k)), y = -Ri + film + b * (2 * Ri - 3 * film);
      dot(x, y, 1 + k * 1.6, tok.particle);
    }
  }
}

function streaks(c, y0, y1, off, col, alpha, len) {
  if (y1 - y0 < 3) return;
  c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 1.5; c.lineCap = "round";
  const n = Math.max(4, Math.round((y1 - y0) / 4));
  for (let i = 0; i < n * 5; i++) {
    const y = y0 + ((i * 7.3) % (y1 - y0)), x = (((i * 97 + off) % 540) + 540) % 540 - 270;
    c.beginPath(); c.moveTo(x - len * (0.5 + (i % 3) * 0.25), y); c.lineTo(x, y); c.stroke();
  }
  c.globalAlpha = 1;
}

function tintOf(hex, a) {
  const h = hex.replace("#", ""); if (h.length !== 6) return `rgba(20,33,61,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.stroke(); }
function flange(c, x, R, tok) {
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.roundRect ? c.roundRect(x - 7, -R - 12, 14, 2 * R + 24, 3) : c.rect(x - 7, -R - 12, 14, 2 * R + 24); c.fill(); c.stroke();
}
function bowtieV(c, x, y, s, tok) {
  c.fillStyle = tok.card; c.strokeStyle = tok.text; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); c.lineTo(x - s, y + s); c.lineTo(x + s, y - s); c.closePath(); c.fill(); c.stroke();
}
function wellhead(c, x, tok) {
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  // casing head and tubing head
  c.fillRect(x - 46, GROUND - 40, 92, 40); c.strokeRect(x - 46, GROUND - 40, 92, 40);
  c.fillRect(x - 32, GROUND - 76, 64, 36); c.strokeRect(x - 32, GROUND - 76, 64, 36);
  // vertical run
  c.fillRect(x - 13, -150, 26, GROUND - 76 + 150); c.strokeRect(x - 13, -150, 26, GROUND - 76 + 150);
  // master valves, swab valve, cap
  bowtieV(c, x, GROUND - 110, 18, tok); bowtieV(c, x, 105, 18, tok); bowtieV(c, x, -60, 16, tok);
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.fillRect(x - 20, -168, 40, 18); c.strokeRect(x - 20, -168, 40, 18);
  // flow cross and wing valve toward the flowline
  c.fillRect(x - 22, Y0 - 22, 44, 44); c.strokeRect(x - 22, Y0 - 22, 44, 44);
  c.fillRect(x + 22, Y0 - 12, X0 - x - 22, 24); c.strokeRect(x + 22, Y0 - 12, X0 - x - 22, 24);
  c.save(); c.translate(x + 62, Y0); c.rotate(Math.PI / 2); bowtieV(c, 0, 0, 14, tok); c.restore();
}
function separator(c, cx, cy, tok, liquid, r, fx, slugHit, dt, playing) {
  const L = 230, R = 72, x0 = cx - L / 2 + 40;
  const target = Math.min(0.75, 0.35 + 0.25 * r.HL) + slugHit * 0.18;
  sepLevel += (target - sepLevel) * Math.min(1, (playing ? dt : 1) * 4);
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x0, cy - R); c.lineTo(x0 + L, cy - R);
  c.ellipse(x0 + L, cy, R * 0.45, R, 0, -Math.PI / 2, Math.PI / 2); c.lineTo(x0, cy + R);
  c.ellipse(x0, cy, R * 0.45, R, 0, Math.PI / 2, Math.PI * 1.5); c.closePath(); c.fill(); c.stroke();
  c.save(); c.clip();
  const yl = cy + R - 2 * R * sepLevel;
  c.fillStyle = liquid; c.fillRect(x0 - R, yl, L + 2 * R, cy + R - yl);
  c.strokeStyle = tok.steelEdge; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(x0 - R, yl); c.lineTo(x0 + L + R, yl); c.stroke(); c.setLineDash([]);
  c.restore();
  // saddles
  c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  for (const sx of [x0 + 30, x0 + L - 30]) { c.beginPath(); c.moveTo(sx - 26, GROUND); c.lineTo(sx - 14, cy + R - 4); c.lineTo(sx + 14, cy + R - 4); c.lineTo(sx + 26, GROUND); c.stroke(); }
  // inlet nozzle to the flowline end
  c.fillStyle = tok.steel; c.fillRect(X1, cy - 14, x0 - R * 0.45 - X1 + 2, 28); c.strokeRect(X1, cy - 14, x0 - R * 0.45 - X1 + 2, 28);
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
