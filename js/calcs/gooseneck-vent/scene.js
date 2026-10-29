// Gooseneck Vent — canvas scene: atmospheric tank, gooseneck vent on the roof with flow through
// it, the vapour plume (rises or slumps by SG), tank gauge, roof bulge and roof-seam failure.
import { npsLabel } from "../../lib/pipe.js";
import { q, fixed } from "../../lib/format.js";

export const bounds = {
  full: { w: 1180, h: 760, cx: 60, cy: -40 },
  compact: { w: 900, h: 760, cx: 60, cy: -40 },
};

const GROUND = 300, TX = -120, TW = 420, TH = 380, ROOF = 46;
let puffs = [], parts = [], seamPuffs = [], bulge = 0;

function tintOf(hex, a) {
  const h = hex.replace("#", ""); if (h.length !== 6) return `rgba(20,33,61,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function draw(c, env) {
  const { dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const fx = r.fx;
  const shellTop = GROUND - TH, x0 = TX - TW / 2, x1 = TX + TW / 2;
  const over = Math.max(0, r.ptReq / r.pdPsi - 1);
  const target = Math.min(1, over) * 34;
  bulge += (target - bulge) * Math.min(1, (playing ? dt : 1) * 3);

  // ground
  c.strokeStyle = tok.line; c.lineWidth = 2; c.beginPath(); c.moveTo(-760, GROUND); c.lineTo(820, GROUND); c.stroke();

  // shell + liquid
  c.fillStyle = tok.steel; c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.fillRect(x0, shellTop, TW, TH); c.strokeRect(x0, shellTop, TW, TH);
  c.fillStyle = tintOf(tok.particle, 0.22); c.fillRect(x0 + 3, GROUND - TH * 0.42, TW - 6, TH * 0.42 - 3);
  c.strokeStyle = tok.steelEdge; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(x0 + 6, GROUND - TH * 0.42); c.lineTo(x1 - 6, GROUND - TH * 0.42); c.stroke(); c.setLineDash([]);
  // roof (cone, bulging under overpressure); seam opens beyond 1.5 × design
  const apexY = shellTop - ROOF - bulge;
  const gap = fx.seam ? 10 : 0;
  c.fillStyle = tok.steel; c.strokeStyle = fx.over ? tok.bad : tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x0 - 6, shellTop - gap);
  c.quadraticCurveTo(TX - TW / 4, apexY + ROOF * 0.25 - bulge * 0.5, TX, apexY);
  c.quadraticCurveTo(TX + TW / 4, apexY + ROOF * 0.25 - bulge * 0.5, x1 + 6, shellTop - gap);
  c.closePath(); c.fill(); c.stroke();
  if (fx.seam) {
    c.strokeStyle = tok.bad; c.lineWidth = 2;
    for (const xs of [x0, x1]) { c.beginPath(); c.moveTo(xs - 6, shellTop - gap); c.lineTo(xs + (xs < TX ? 18 : -18), shellTop - 2); c.stroke(); }
    if (playing) for (let i = 0; i < 3; i++) { const left = Math.random() < 0.5; seamPuffs.push({ x: left ? x0 : x1, y: shellTop - gap / 2, vx: (left ? -1 : 1) * (60 + Math.random() * 80), vy: -20 - Math.random() * 30, rad: 6, age: 0 }); }
  }

  // gooseneck path: riser from the roof apex, 180° bend, short downturn
  const R = Math.max(6, 4 + r.dIn * 1.25);
  const riserH = 120 + Math.min(120, s.len * 14), bendR = Math.max(R * 2.2, 36);
  const pTop = apexY - riserH, outX = TX + 2 * bendR, outY = pTop + 70;
  const path = () => { c.beginPath(); c.moveTo(TX, apexY + 6); c.lineTo(TX, pTop); c.arc(TX + bendR, pTop, bendR, Math.PI, 0); c.lineTo(outX, outY); };
  c.lineCap = "butt"; c.lineJoin = "round";
  path(); c.strokeStyle = tok.steelEdge; c.lineWidth = 2 * R + 3; c.stroke();
  path(); c.strokeStyle = tok.card; c.lineWidth = 2 * R; c.stroke();
  // flame arrestor / screen element when extra K is set
  if (s.kx > 0) {
    const ay = apexY - riserH * 0.45;
    c.fillStyle = tok.steel; c.strokeStyle = tok.text; c.lineWidth = 1.5;
    c.fillRect(TX - R - 8, ay - 22, 2 * R + 16, 44); c.strokeRect(TX - R - 8, ay - 22, 2 * R + 16, 44);
    for (let k = -18; k <= 18; k += 6) { c.beginPath(); c.moveTo(TX - R - 8, ay + k); c.lineTo(TX + R + 8, ay + k); c.stroke(); }
  }
  // outlet screen
  c.strokeStyle = tok.text; c.lineWidth = 1.5; c.setLineDash([3, 3]);
  c.beginPath(); c.moveTo(outX - R, outY); c.lineTo(outX + R, outY); c.stroke(); c.setLineDash([]);

  // streaks along the vent path at the vent velocity
  const lenRiser = apexY + 6 - pTop, lenArc = Math.PI * bendR, lenDown = outY - pTop, total = lenRiser + lenArc + lenDown;
  const at = (u) => {
    let d = u * total;
    if (d < lenRiser) return [TX, apexY + 6 - d, 0, -1];
    d -= lenRiser;
    if (d < lenArc) { const a = Math.PI + d / bendR; return [TX + bendR + Math.cos(a) * bendR, pTop + Math.sin(a) * bendR, -Math.sin(a), Math.cos(a)]; }
    d -= lenArc; return [outX, pTop + d, 0, 1];
  };
  const vis = 40 + 90 * Math.log10(1 + r.Vreq);
  if (layers.flow) {
    while (parts.length < 46) parts.push({ u: Math.random(), o: Math.random() * 2 - 1, l: 0.4 + Math.random() * 0.6 });
    c.strokeStyle = r.Ma > 0.3 ? tok.amber : tok.particle; c.lineCap = "round";
    for (const p of parts) {
      if (playing) p.u += (vis * dt) / total;
      if (p.u > 1) { p.u -= 1; p.o = Math.random() * 2 - 1; }
      const [x, y, tx, ty] = at(p.u), ox = -ty * p.o * (R - 3), oy = tx * p.o * (R - 3), len = 6 + 10 * p.l;
      c.globalAlpha = 0.4 + 0.5 * p.l; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + ox - tx * len, y + oy - ty * len); c.lineTo(x + ox, y + oy); c.stroke();
    }
    c.globalAlpha = 1;
    // vapour inside the tank drifting to the vent
    c.fillStyle = tok.muted;
    for (let i = 0; i < 14; i++) {
      const ph = ((performance.now() / 1000) * (0.2 + (vis / 600)) + i / 14) % 1;
      const sx = x0 + 40 + ((i * 73) % (TW - 80)), sy = GROUND - TH * 0.45;
      const xx = sx + (TX - sx) * ph, yy = sy + (shellTop - 12 - sy) * ph;
      c.globalAlpha = 0.25 * (1 - ph) + 0.1; c.beginPath(); c.arc(xx, yy, 2.4, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  // plume: leaves downward, then buoyancy (SG < 1 rises, SG > 1 slumps)
  const rate = Math.min(28, 4 + r.qReq / 1200);
  if (playing) for (let i = 0; i < Math.floor(rate * dt) + (Math.random() < (rate * dt) % 1 ? 1 : 0); i++) {
    puffs.push({ x: outX + (Math.random() - 0.5) * R, y: outY + 4, vx: (Math.random() - 0.5) * 20 + 14, vy: 60 + Math.min(180, r.Vreq * 2), rad: R * 0.6, age: 0 });
  }
  const buoy = (s.sg - 1) * 180;
  for (const list of [puffs, seamPuffs]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (playing) { p.age += dt; p.vy = p.vy * 0.96 + buoy * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rad += 16 * dt; }
      if (p.y > GROUND - p.rad * 0.3) { p.y = GROUND - p.rad * 0.3; p.vy = 0; p.vx += 6 * dt * Math.sign(p.vx || 1); }
      if (p.age > 3.2) { list.splice(i, 1); continue; }
      c.globalAlpha = (1 - p.age / 3.2) * 0.07; c.fillStyle = tok.muted; c.beginPath(); c.arc(p.x, p.y, p.rad, 0, Math.PI * 2); c.fill();
    }
  }
  c.globalAlpha = 1;
  if (!fx.seam) seamPuffs.length = 0;

  // labels
  c.font = F(700, 13); c.textAlign = "center"; c.fillStyle = tok.bad;
  if (fx.seam) c.fillText("Roof seam at risk", TX, apexY - 26);
  else if (fx.over) c.fillText("Overpressure", TX - TW / 4, apexY + 4);

  if (!layers.dims) return;
  // tank gauge
  const gx = x1 + 70, gy = shellTop + 70, R0 = 30;
  c.strokeStyle = tok.steelEdge; c.lineWidth = 3; c.beginPath(); c.moveTo(x1, gy); c.lineTo(gx - R0, gy); c.stroke();
  c.fillStyle = tok.card; c.lineWidth = 2; c.beginPath(); c.arc(gx, gy, R0, 0, Math.PI * 2); c.fill(); c.stroke();
  const frac = Math.min(1, r.ptReq / (2 * r.pdPsi));
  c.strokeStyle = tok.bad; c.lineWidth = 3; c.beginPath(); c.arc(gx, gy, R0 - 6, Math.PI * 0.75 + 0.5 * Math.PI * 1.5, Math.PI * 0.75 + Math.PI * 1.5); c.stroke();
  const a = Math.PI * 0.75 + Math.max(0.02, frac) * Math.PI * 1.5;
  c.strokeStyle = tok.text; c.lineWidth = 2.4; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + Math.cos(a) * (R0 - 9), gy + Math.sin(a) * (R0 - 9)); c.stroke();
  c.fillStyle = tok.amber; c.beginPath(); c.arc(gx, gy, 3.4, 0, Math.PI * 2); c.fill();
  const pt = q("psiTank", sys, r.ptReq, 2), pd = q("psiTank", sys, r.pdPsi, 2);
  c.textAlign = "left"; c.font = F(800, 16); c.fillStyle = fx.over ? tok.bad : tok.text; c.fillText(`${pt.v} ${pt.u}`, gx + R0 + 10, gy - 2);
  c.font = F(500, 12, "m"); c.fillStyle = tok.muted; c.fillText(`design ${pd.v}`, gx + R0 + 10, gy + 12 * TS);

  // vent velocity and size
  const vq = q("velocity", sys, r.Vreq);
  c.textAlign = "left"; c.font = F(800, 28); c.fillStyle = tok.text;
  c.fillText(vq.v, outX + R + 24, pTop + 10);
  const vw = c.measureText(vq.v).width;
  c.font = F(600, 14); c.fillStyle = tok.muted; c.fillText(vq.u, outX + R + 30 + vw, pTop + 10);
  c.font = F(500, 13, "m"); c.fillText(`NPS ${npsLabel(s.nps)} S${s.sch}`, outX + R + 24, pTop + 10 + 22 * TS);
  const qr = q("airStd", sys, s.qreq);
  c.textAlign = "center"; c.fillStyle = tok.text; c.font = F(500, 13, "m");
  c.fillText(`required ${qr.v} ${qr.u} air`, TX, GROUND + 34 + 6 * TS);
}
