// B31.3 Pipe Stress — canvas scene: to-scale cross-section of the pipe wall with the pressure
// thickness, corrosion allowance and mill tolerance, hoop-stress arrows, and failure modes.
import { npsText } from "../../lib/pipe-schedules.js";
import { q, fixed } from "../../lib/format.js";

export const bounds = {
  full: { w: 1260, h: 720, cx: 110, cy: 20 },
  compact: { w: 1100, h: 720, cx: 110, cy: 20 },
};

const CX = -80, CY = 0, RO = 250;
let pulse = 0, gas = [];

export function draw(c, env) {
  const { now, dt, playing, layers, tok, TS, F, s, r, sys } = env;
  const fx = r.fx;
  const k = RO / (r.D / 2);                                   // px per mm
  const px = (mm) => Math.max(1.5, mm * k);
  const rN = RO - px(r.tn), rM = RO - px(r.tm), rC = RO - px(r.tm - s.ca), rT = RO - px(r.t);
  if (playing) pulse += dt;
  const swell = fx.over ? 4 + 3 * Math.sin(pulse * 6) : 0;
  const Ro = RO + swell;

  c.save(); c.translate(CX, CY);

  // bore with gas
  c.fillStyle = tok.card; c.beginPath(); c.arc(0, 0, rN, 0, Math.PI * 2); c.fill();
  while (gas.length < 70) gas.push({ a: Math.random() * Math.PI * 2, r: Math.random(), v: 0.3 + Math.random() });
  if (layers.flow) {
    c.fillStyle = tok.particle;
    for (const g of gas) {
      if (playing) { g.r += g.v * dt * 0.8; if (g.r > 1) { g.r = 0; g.a = Math.random() * Math.PI * 2; } }
      const rr = g.r * (rN - 6);
      c.globalAlpha = 0.25 + 0.5 * g.r; c.beginPath(); c.arc(Math.cos(g.a) * rr, Math.sin(g.a) * rr, 2.2, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  // wall bands (outside in): pressure thickness, margin, corrosion allowance, mill tolerance
  const ring = (ro, ri, fill) => { c.beginPath(); c.arc(0, 0, ro, 0, Math.PI * 2); c.arc(0, 0, ri, 0, Math.PI * 2, true); c.fillStyle = fill; c.fill("evenodd"); };
  ring(Ro, rN, fx.thin ? tok.bad : tok.steel);
  // mill-tolerance band (may be missing from delivered pipe)
  c.save(); c.beginPath(); c.arc(0, 0, rM, 0, Math.PI * 2); c.arc(0, 0, rN, 0, Math.PI * 2, true); c.clip("evenodd");
  c.strokeStyle = tok.steelEdge; c.lineWidth = 1;
  for (let x = -RO; x < RO; x += 6) { c.beginPath(); c.moveTo(x, -RO); c.lineTo(x + RO, RO); c.stroke(); }
  c.restore();
  // corrosion allowance band
  if (s.ca > 0) {
    c.save(); c.beginPath(); c.arc(0, 0, rC, 0, Math.PI * 2); c.arc(0, 0, rM, 0, Math.PI * 2, true); c.clip("evenodd");
    c.strokeStyle = tok.amber; c.lineWidth = 1.6;
    for (let x = -RO; x < RO; x += 5) { c.beginPath(); c.moveTo(x, RO); c.lineTo(x + RO, -RO); c.stroke(); }
    c.restore();
  }
  // outlines
  c.strokeStyle = tok.steelEdge; c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, Ro, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, rN, 0, Math.PI * 2); c.stroke();
  c.setLineDash([5, 4]); c.lineWidth = 1.5;
  c.strokeStyle = tok.muted; c.beginPath(); c.arc(0, 0, rM, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = fx.thin ? tok.bad : tok.text; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, rT, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]);

  // hoop-stress arrows
  const nA = 16, aLen = Math.min(46, 14 + (s.p / Math.max(r.mawp, 1)) * 26);
  c.strokeStyle = r.fx.over ? tok.bad : tok.text; c.fillStyle = c.strokeStyle; c.lineWidth = 2;
  for (let i = 0; i < nA; i++) {
    const a = (i / nA) * Math.PI * 2 + 0.1, r0 = Ro + 10, r1 = r0 + aLen;
    c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke();
    const hx = Math.cos(a) * (r1 + 6), hy = Math.sin(a) * (r1 + 6);
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - Math.cos(a - 0.4) * 9, hy - Math.sin(a - 0.4) * 9); c.lineTo(hx - Math.cos(a + 0.4) * 9, hy - Math.sin(a + 0.4) * 9); c.closePath(); c.fill();
  }

  // cold: frost and brittle cracks
  if (fx.cold) {
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 160; i++) { const a = (i * 2.399) % (Math.PI * 2), rr = rN + ((i * 37) % 100) / 100 * (Ro - rN); c.globalAlpha = 0.6; c.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 2, 2); }
    c.globalAlpha = 1;
    c.strokeStyle = tok.bad; c.lineWidth = 1.5;
    for (const a0 of [0.7, 2.6, 4.4]) { c.beginPath(); let a = a0, rr = Ro; c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); for (let j = 0; j < 4; j++) { rr -= (Ro - rN) / 4; a += (j % 2 ? 0.04 : -0.04); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.stroke(); }
  }
  // thin wall: crack through the wall
  if (fx.thin && !fx.burst) {
    c.strokeStyle = tok.card; c.lineWidth = 3; c.beginPath();
    let a = -0.6; c.moveTo(Math.cos(a) * rN, Math.sin(a) * rN);
    for (let j = 1; j <= 5; j++) { const rr = rN + ((Ro - rN) * j) / 5; a += j % 2 ? 0.05 : -0.05; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.stroke();
  }
  // burst: fish-mouth opening at 12 o'clock
  if (fx.burst) {
    c.fillStyle = tok.page; c.beginPath(); c.ellipse(0, -(rN + Ro) / 2, 26, (Ro - rN) / 2 + 6, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = tok.bad; c.lineWidth = 2; c.stroke();
    c.fillStyle = tok.muted;
    for (let i = 0; i < 18; i++) { const t = ((now / 600) + i / 18) % 1; c.globalAlpha = 0.25 * (1 - t); c.beginPath(); c.arc((i % 2 ? 1 : -1) * t * 30, -Ro - t * 140, 8 + t * 30, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
  }
  c.restore();

  // labels
  c.font = F(700, 13); c.textAlign = "center"; c.fillStyle = tok.bad;
  if (fx.burst) c.fillText("Burst", CX, CY - RO - 190);
  else if (fx.thin) c.fillText("Wall too thin", CX, CY + RO + 70);
  if (fx.cold) c.fillText("Below MDMT", CX, CY + RO + 90 + 6 * TS);

  if (!layers.dims) return;
  // magnified wall strip: outside surface on the left, bore on the right
  const mm = (v) => q("thickMm", sys, v, sys === "metric" ? 2 : 3);
  const sx = CX + RO + 70, sw = 230, sh = 170, sy = CY - sh / 2, kk = sw / r.tn;
  const seg = (a, b, fill) => { c.fillStyle = fill; c.fillRect(sx + a * kk, sy, Math.max(0, (b - a) * kk), sh); };
  const tReq = Math.min(r.t, r.tn), mEnd = Math.max(0, Math.min(r.tm - s.ca, r.tn));
  seg(0, r.tn, tok.steel);
  seg(0, tReq, fx.thin ? tok.bad : tok.text);
  c.save(); c.beginPath(); c.rect(sx + mEnd * kk, sy, Math.max(0, (r.tm - mEnd) * kk), sh); c.clip();
  c.strokeStyle = tok.amber; c.lineWidth = 2; for (let x = sx - sh; x < sx + sw; x += 7) { c.beginPath(); c.moveTo(x, sy + sh); c.lineTo(x + sh, sy); c.stroke(); }
  c.restore();
  c.save(); c.beginPath(); c.rect(sx + r.tm * kk, sy, (r.tn - r.tm) * kk, sh); c.clip();
  c.strokeStyle = tok.steelEdge; c.lineWidth = 1; for (let x = sx - sh; x < sx + sw; x += 5) { c.beginPath(); c.moveTo(x, sy); c.lineTo(x + sh, sy + sh); c.stroke(); }
  c.restore();
  c.strokeStyle = tok.steelEdge; c.lineWidth = 2; c.strokeRect(sx, sy, sw, sh);
  // magnifier lines from the ring
  c.strokeStyle = tok.muted; c.lineWidth = 1; c.setLineDash([3, 4]);
  c.beginPath(); c.moveTo(CX + RO, CY - 8); c.lineTo(sx, sy); c.moveTo(CX + RO, CY + 8); c.lineTo(sx, sy + sh); c.stroke(); c.setLineDash([]);
  c.font = F(600, 12); c.fillStyle = tok.muted; c.textAlign = "left"; c.fillText("OD", sx, sy - 8); c.textAlign = "right"; c.fillText("bore", sx + sw, sy - 8);
  // dimension rows under the strip
  const rows = [["t", 0, r.t, fx.thin ? tok.bad : tok.text], ["c", r.tm - s.ca, r.tm, tok.amberText], ["t_m", 0, r.tm, tok.muted], ["t_n", 0, r.tn, tok.text]];
  rows.forEach(([name, a, b, col], i) => {
    if (name === "c" && !(s.ca > 0)) return;
    const y = sy + sh + 22 + i * (22 + 4 * TS), x0 = sx + Math.max(0, a) * kk, x1 = sx + Math.min(b, r.tn * 1.6) * kk;
    c.strokeStyle = col; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.moveTo(x0, y - 5); c.lineTo(x0, y + 5); c.moveTo(x1, y - 5); c.lineTo(x1, y + 5); c.stroke();
    const v = mm(b - a);
    c.textAlign = "left"; c.fillStyle = col; c.font = F(800, 14); c.fillText(name, sx + sw + 12, y + 5);
    c.font = F(500, 12, "m"); c.fillStyle = tok.muted; c.fillText(`${v.v} ${v.u}`, sx + sw + 44, y + 5);
  });
  const P = q("pressG", sys, s.p, 0), M = q("pressG", sys, r.mawp, 0), H = q("stressKpa", sys, r.hoop);
  c.textAlign = "center"; c.font = F(800, 30); c.fillStyle = fx.over ? tok.bad : tok.text;
  c.fillText(`${P.v}`, CX, CY - 8);
  c.font = F(600, 14); c.fillStyle = tok.muted; c.fillText(`${P.u} design · MAWP ${M.v}`, CX, CY + 16 + 4 * TS);
  c.font = F(500, 13, "m"); c.fillText(`σ_h ${H.v} ${H.u}`, CX, CY + 38 + 8 * TS);
  c.font = F(500, 13, "m"); c.fillStyle = tok.text;
  c.fillText(`NPS ${npsText(s.nps)} · OD ${q("thickMm", sys, r.D, 1).v} ${q("thickMm", sys, 0).u} · Sch ${s.sch}`, CX, CY + RO + 120 + 8 * TS);
}
