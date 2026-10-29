// Flowline Sizing — canvas scene: wellhead → buried flowline across terrain → facility,
// with a magnifier lens showing the flow inside (gas, liquid, or the two-phase pattern).
import { q, fixed } from "../../lib/format.js";

export const bounds = {
  full: { w: 1480, h: 660, cx: 30, cy: 40 },
  compact: { w: 1180, h: 660, cx: 30, cy: 30 },
};

const X0 = -540, X1 = 560, GROUND = 170, DEPTH = 26;
const LENS = { x: 0, y: -175, r: 118 };

const seeded = (n, seed) => {
  let x = seed; const out = [];
  const nx = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) out.push([nx(), nx(), nx()]);
  return out;
};
const BUB = seeded(120, 21), DROP = seeded(140, 33), XTAL = seeded(26, 9), FROST = seeded(120, 3);

let phase = 0, hydG = 0, puffs = [], drops = [];

function tintOf(hex, a) {
  const h = hex.replace("#", ""); if (h.length !== 6) return `rgba(20,33,61,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function draw(c, env) {
  const { now, dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const fx = r.fx, liquid = tintOf(tok.particle, 0.3);
  const rise = Math.max(-90, Math.min(90, (s.dh / Math.max(1, s.len * 1000)) * 3000 + Math.sign(s.dh) * Math.min(30, Math.abs(s.dh))));
  const terr = (x) => GROUND - 26 * Math.sin((x + 120) / 170) - 14 * Math.sin(x / 63 + 1) - rise * (x - X0) / (X1 - X0);
  const pipeY = (x) => terr(x) + DEPTH;
  const vis = 40 + 70 * Math.log10(1 + (fx.stall ? 0.3 : r.V1));
  if (playing) phase += dt * vis;

  // soil
  c.fillStyle = tok.soft; c.beginPath(); c.moveTo(-760, 360);
  for (let x = -760; x <= 780; x += 10) c.lineTo(x, terr(x));
  c.lineTo(780, 360); c.closePath(); c.fill();
  c.strokeStyle = tok.line; c.lineWidth = 2; c.beginPath();
  for (let x = -760; x <= 780; x += 10) (x === -760 ? c.moveTo(x, terr(x)) : c.lineTo(x, terr(x)));
  c.stroke();

  // buried line
  const Rp = 6 + Math.min(10, r.dIn * 0.9);
  c.lineJoin = "round"; c.lineCap = "round";
  const pathLine = () => { c.beginPath(); c.moveTo(X0, terr(X0) - 40); c.lineTo(X0, pipeY(X0)); for (let x = X0; x <= X1; x += 10) c.lineTo(x, pipeY(x)); c.lineTo(X1, pipeY(X1)); c.lineTo(X1, terr(X1) - 40); };
  pathLine(); c.strokeStyle = tok.steelEdge; c.lineWidth = 2 * Rp + 3; c.stroke();
  pathLine(); c.strokeStyle = fx.overstress ? tok.bad : tok.steel; c.lineWidth = 2 * Rp; c.stroke();
  if (fx.overstress) { pathLine(); c.strokeStyle = tok.card; c.setLineDash([6, 8]); c.lineWidth = 2; c.stroke(); c.setLineDash([]); }

  // km posts
  c.font = F(500, 12, "m"); c.textAlign = "center";
  const L = q("lengthKm", sys, s.len);
  for (let i = 0; i <= 4; i++) {
    const x = X0 + ((X1 - X0) * i) / 4, y = terr(x);
    c.strokeStyle = tok.muted; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 14); c.stroke();
    c.fillStyle = tok.muted; c.fillText(fixed((L.raw * i) / 4, L.raw < 10 ? 1 : 0), x, y + 52 + 6 * TS);
  }

  wellhead(c, X0, terr(X0), tok);
  facility(c, X1, terr(X1), tok, liquid, r);

  // lens leader
  const px = LENS.x, py = pipeY(px);
  c.strokeStyle = tok.muted; c.lineWidth = 1.5; c.setLineDash([4, 4]);
  c.beginPath(); c.moveTo(px, py - Rp - 2); c.lineTo(LENS.x, LENS.y + LENS.r); c.stroke(); c.setLineDash([]);
  c.strokeStyle = tok.text; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, Rp + 6, 0, Math.PI * 2); c.stroke();

  // lens
  c.save();
  if (playing && fx.shake) c.translate(Math.sin(now * 0.07) * 3, Math.cos(now * 0.09) * 2);
  c.beginPath(); c.arc(LENS.x, LENS.y, LENS.r, 0, Math.PI * 2); c.fillStyle = tok.card; c.fill();
  c.save(); c.clip();
  const ri = 64, top = LENS.y - ri, wall = 12;
  c.fillStyle = tok.steel; c.fillRect(LENS.x - LENS.r, top - wall, 2 * LENS.r, wall); c.fillRect(LENS.x - LENS.r, LENS.y + ri, 2 * LENS.r, wall);
  if (fx.frost) { c.fillStyle = "#ffffff"; for (const [a, b, k] of FROST) { c.globalAlpha = 0.4 + 0.5 * k; c.fillRect(LENS.x - LENS.r + a * 2 * LENS.r, (b < 0.5 ? top - wall : LENS.y + ri) + (b % 0.5) * 2 * wall * 0.9, 2, 2); } c.globalAlpha = 1; }
  c.save(); c.beginPath(); c.rect(LENS.x - LENS.r, top, 2 * LENS.r, 2 * ri); c.clip();
  c.translate(LENS.x, LENS.y);
  if (layers.flow) drawFlow(c, r, ri, LENS.r, tok, liquid, phase);
  hydG = fx.hydrate && !playing ? 0.8 : Math.max(0, Math.min(1, hydG + ((fx.hydrate ? 1 : -2) * dt) / 5));
  if (hydG > 0.01) {
    c.fillStyle = tok.card; c.strokeStyle = tok.steelEdge; c.lineWidth = 1.2;
    for (const [a, b, k] of XTAL) {
      const xx = -LENS.r + a * 2 * LENS.r, yy = b < 0.5 ? -ri : ri, sz = (5 + k * 22) * hydG;
      c.beginPath();
      for (let j = 0; j < 6; j++) { const t = (j / 6) * Math.PI * 2 + k, rr = sz * (j % 2 ? 1 : 0.7); c.lineTo(xx + Math.cos(t) * rr * 0.8, yy + Math.sin(t) * rr); }
      c.closePath(); c.fill(); c.stroke();
    }
  }
  c.restore();
  c.strokeStyle = tok.steelEdge; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(LENS.x - LENS.r, top); c.lineTo(LENS.x + LENS.r, top); c.moveTo(LENS.x - LENS.r, LENS.y + ri); c.lineTo(LENS.x + LENS.r, LENS.y + ri); c.stroke();
  c.restore();
  c.beginPath(); c.arc(LENS.x, LENS.y, LENS.r, 0, Math.PI * 2);
  c.strokeStyle = fx.shake ? tok.bad : tok.text; c.lineWidth = 3; c.stroke();
  c.restore();

  // rupture: eruption through the ground at the low point downstream of the lens
  const rx = 240, ry = terr(rx);
  if (fx.rupture) {
    c.fillStyle = tok.page; c.beginPath(); c.ellipse(rx, ry + 4, 46, 12, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = tok.bad; c.lineWidth = 2; c.stroke();
    const n = playing ? 70 * dt : 0;
    for (let i = 0; i < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i++) {
      if (r.qL > 0 && Math.random() < 0.45) drops.push({ x: rx + (Math.random() - 0.5) * 40, y: ry, vx: (Math.random() - 0.5) * 200, vy: -(250 + Math.random() * 250) });
      else puffs.push({ x: rx + (Math.random() - 0.5) * 40, y: ry, vx: (Math.random() - 0.5) * 60, vy: -(150 + Math.random() * 120), rad: 10, age: 0, life: 2.4 });
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    if (playing) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rad += 34 * dt; p.vy *= 0.985; }
    if (p.age > p.life || !fx.rupture) { puffs.splice(i, 1); continue; }
    c.globalAlpha = (1 - p.age / p.life) * 0.14; c.fillStyle = tok.muted; c.beginPath(); c.arc(p.x, p.y, p.rad, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = tok.particle;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (playing) { d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    if (d.y > terr(d.x) + 2 || !fx.rupture) { drops.splice(i, 1); continue; }
    c.globalAlpha = 0.6; c.beginPath(); c.arc(d.x, d.y, 2.3, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;

  // labels
  const v1 = q("velocity", sys, r.V1), v2 = q("velocity", sys, r.V2);
  c.textAlign = "center";
  c.font = F(800, 30); c.fillStyle = fx.shake ? tok.bad : tok.text;
  const head = fx.stall ? `${v1.v}` : r.phase === "L" ? v1.v : `${v1.v} → ${v2.v}`;
  c.fillText(head, LENS.x, LENS.y - LENS.r - 34 - 6 * TS);
  c.font = F(600, 14); c.fillStyle = tok.muted;
  const sub = r.phase === "2" ? `${v1.u} · ${r.patName} · H_L ${fixed(r.HL * 100, 0)}%` : `${v1.u} · ${r.phaseName}`;
  c.fillText(sub, LENS.x, LENS.y - LENS.r - 14);
  c.font = F(700, 13); c.fillStyle = tok.bad;
  if (fx.rupture) c.fillText("Rupture", rx, ry - 150);
  if (fx.hydrate) c.fillText("Hydrates", LENS.x, LENS.y + LENS.r + 22);
  else if (fx.frost) { c.fillStyle = tok.muted; c.fillText("Frost", LENS.x, LENS.y + LENS.r + 22); }
  if (fx.overstress) c.fillText("Above pipe rating", (X0 + X1) / 2 - 260, pipeY((X0 + X1) / 2 - 260) + 64);

  if (!layers.dims) return;
  const P1 = q("pressG", sys, s.p), P2 = q("psig", sys, r.p2g);
  gauge(c, X0 + 70, terr(X0 + 70) - 6, "P₁", `${P1.v} ${P1.u}`, 0.5, tok, F, TS);
  gauge(c, X1 - 90, terr(X1 - 90) - 6, "P₂", fx.stall ? "—" : `${P2.v} ${P2.u}`, fx.stall ? 0 : Math.max(0, Math.min(1, P2.raw / (P1.raw || 1))) * 0.5, tok, F, TS);
  const dP = q("dpPsi", sys, r.dpLine);
  let lt = `${q("thickMm", sys, s.od, sys === "metric" ? 1 : 3).v} × ${q("thickMm", sys, s.wt, sys === "metric" ? 2 : 3).v} ${q("thickMm", sys, 0).u}  ·  ΔP ${dP.v} ${dP.u}`;
  if (s.dh) { const dh = q("lengthM", sys, s.dh, 0); lt += `  ·  ΔH ${s.dh > 0 ? "+" : ""}${dh.v} ${dh.u}`; }
  c.font = F(500, 13, "m"); c.fillStyle = tok.text; c.textAlign = "center";
  c.fillText(lt, 0, GROUND + 112 + 10 * TS);
}

function drawFlow(c, r, ri, w, tok, liquid, phase) {
  const wrap = (v) => ((v % (2 * w)) + 2 * w) % (2 * w) - w;
  const dot = (x, y, rad, fill, stroke) => { c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = 1; c.strokeStyle = stroke; c.stroke(); } };
  const streaks = (y0, y1, off, alpha, len) => {
    c.strokeStyle = tok.particle; c.globalAlpha = alpha; c.lineWidth = 1.6; c.lineCap = "round";
    for (let i = 0; i < 36; i++) {
      const y = y0 + ((i * 7.3) % Math.max(1, y1 - y0)), x = wrap(-w + ((i * 61) % (2 * w)) + off);
      c.beginPath(); c.moveTo(x - len * (0.6 + (i % 3) * 0.25), y); c.lineTo(x, y); c.stroke();
    }
    c.globalAlpha = 1;
  };
  if (r.phase === "G") { streaks(-ri + 4, ri - 4, phase * 1.4, 0.5, 26); return; }
  if (r.phase === "L") { c.fillStyle = liquid; c.fillRect(-w, -ri, 2 * w, 2 * ri); streaks(-ri + 4, ri - 4, phase * 0.7, 0.55, 14); return; }
  const pat = r.pat;
  if (pat === "seg") {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, th = 2 * Math.acos(1 - 2 * m); ((th - Math.sin(th)) / (2 * Math.PI) < r.HL ? (lo = m) : (hi = m)); }
    const yl = ri - 2 * ri * lo;
    c.fillStyle = liquid; c.beginPath(); c.moveTo(-w, ri);
    for (let x = -w; x <= w; x += 6) c.lineTo(x, yl + Math.sin((x - phase * 0.4) / 14) * 3);
    c.lineTo(w, ri); c.closePath(); c.fill();
    streaks(-ri + 4, yl - 6, phase * 1.6, 0.4, 22); streaks(yl + 4, ri - 3, phase * 0.4, 0.6, 10);
    return;
  }
  if (pat === "int" || pat === "tr") {
    c.fillStyle = liquid; c.fillRect(-w, -ri, 2 * w, 2 * ri);
    const period = 2 * w * 0.9, bl = period * 0.6, yf = ri * 0.45, off = phase * 1.2;
    for (let k = -1; k <= 2; k++) {
      const x0 = (((off % period) + period) % period) - w + (k - 1) * period, x1 = x0 + bl;
      c.fillStyle = tok.card; c.beginPath(); c.moveTo(x0, yf); c.lineTo(x1 - 40, yf);
      c.quadraticCurveTo(x1 + 8, yf, x1, (yf - ri) / 2); c.quadraticCurveTo(x1 - 4, -ri, x1 - 40, -ri); c.lineTo(x0, -ri); c.closePath(); c.fill();
      for (let j = 0; j < 6; j++) dot(x0 - 6 - ((j * 23) % 50), -ri * 0.6 + ((j * 31) % (ri * 1.2)), 2 + (j % 3), tok.card, tok.particle);
    }
    return;
  }
  if (r.bb && r.bb.lam >= 0.25) {
    c.fillStyle = liquid; c.fillRect(-w, -ri, 2 * w, 2 * ri);
    for (const [a, b, k] of BUB) dot(wrap(-w + a * 2 * w + phase * (0.9 + 0.2 * k)), -ri + 4 + b ** 1.4 * (2 * ri - 8), 1.5 + k * 3, tok.card, tok.particle);
  } else {
    c.fillStyle = liquid; c.fillRect(-w, ri - 8, 2 * w, 8); c.fillRect(-w, -ri, 2 * w, 3);
    for (const [a, b, k] of DROP) dot(wrap(-w + a * 2 * w + phase * (1.4 + 0.4 * k)), -ri + 6 + b * (2 * ri - 16), 1 + k * 1.6, tok.particle);
  }
}

function wellhead(c, x, g, tok) {
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.fillRect(x - 30, g - 26, 60, 26); c.strokeRect(x - 30, g - 26, 60, 26);
  c.fillRect(x - 10, g - 150, 20, 124); c.strokeRect(x - 10, g - 150, 20, 124);
  for (const y of [g - 56, g - 118]) bowtie(c, x, y, 13, tok);
  c.fillRect(x - 16, g - 162, 32, 12); c.strokeRect(x - 16, g - 162, 32, 12);
  c.fillRect(x - 16, g - 92, 32, 22); c.strokeRect(x - 16, g - 92, 32, 22);
}
function bowtie(c, x, y, s, tok) {
  c.fillStyle = tok.card; c.strokeStyle = tok.text; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); c.lineTo(x - s, y + s); c.lineTo(x + s, y - s); c.closePath(); c.fill(); c.stroke();
}
function facility(c, x, g, tok, liquid, r) {
  // inlet separator and building
  const vx = x + 40, top = g - 200, w = 70;
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(vx - w / 2, top + 18); c.ellipse(vx, top + 18, w / 2, 18, 0, Math.PI, 0); c.lineTo(vx + w / 2, g - 30);
  c.ellipse(vx, g - 30, w / 2, 14, 0, 0, Math.PI); c.closePath(); c.fill(); c.stroke();
  if (r.qL > 0) { c.save(); c.clip(); c.fillStyle = liquid; c.fillRect(vx - w, g - 90, 2 * w, 80); c.restore(); }
  c.beginPath(); c.moveTo(vx - 20, g - 18); c.lineTo(vx - 20, g); c.moveTo(vx + 20, g - 18); c.lineTo(vx + 20, g); c.stroke();
  c.fillStyle = tok.steel; c.fillRect(x - 8, g - 52, 16 + 8, 14); c.strokeRect(x - 8, g - 52, 16 + 8, 14);
  // building
  const bx = vx + 70;
  c.fillStyle = tok.card; c.beginPath(); c.moveTo(bx, g); c.lineTo(bx, g - 90); c.lineTo(bx + 60, g - 120); c.lineTo(bx + 120, g - 90); c.lineTo(bx + 120, g); c.closePath(); c.fill(); c.stroke();
  c.strokeRect(bx + 46, g - 44, 28, 44);
}
function gauge(c, x, ytop, label, val, frac, tok, F, TS) {
  const R0 = 24, cy = ytop - 40 - R0;
  c.strokeStyle = tok.steelEdge; c.lineWidth = 3; c.beginPath(); c.moveTo(x, ytop); c.lineTo(x, cy + R0); c.stroke();
  c.fillStyle = tok.card; c.lineWidth = 2; c.beginPath(); c.arc(x, cy, R0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = tok.muted; c.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5; c.beginPath(); c.moveTo(x + Math.cos(a) * (R0 - 4), cy + Math.sin(a) * (R0 - 4)); c.lineTo(x + Math.cos(a) * (R0 - 8), cy + Math.sin(a) * (R0 - 8)); c.stroke(); }
  const a = Math.PI * 0.75 + Math.max(0.03, Math.min(0.97, frac * 1.2 + 0.05)) * Math.PI * 1.5;
  c.strokeStyle = tok.text; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, cy); c.lineTo(x + Math.cos(a) * (R0 - 9), cy + Math.sin(a) * (R0 - 9)); c.stroke();
  c.fillStyle = tok.amber; c.beginPath(); c.arc(x, cy, 3, 0, Math.PI * 2); c.fill();
  c.textAlign = "left"; c.fillStyle = tok.text; c.font = F(800, 15); c.fillText(label, x + R0 + 8, cy - 4);
  c.font = F(500, 12, "m"); c.fillStyle = tok.muted; c.fillText(val, x + R0 + 8, cy + 12 * TS);
}
