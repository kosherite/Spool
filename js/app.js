// Spool app shell: search, detail panel, settings, toast and the scene canvas.
// Each calculator module (see js/calcs/registry.js) supplies its own inputs,
// results, equations and scene; this file stays calculator-agnostic.
import { CATALOG, LIVE } from "./calcs/registry.js";
import { toDisplay, fromDisplay, unit } from "./lib/units.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(`spool.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`spool.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- State ---------- */
let calc = LIVE.find((c) => `#${c.id}` === location.hash) || LIVE[0];
let S = { ...calc.defaults };
let sys = store.get("units", "metric") === "imperial" ? "imperial" : "metric";
const layers = { flow: true, dims: true, profile: false };
let R = null, lastFx = "";

/* ---------- Render ---------- */
function render() {
  R = calc.compute(S);
  const list = calc.checks(S, R);
  const [tone, label] = calc.status(R, list);

  $("pCode").textContent = calc.code;
  $("pTitle").textContent = calc.name;
  $("pCtx").textContent = calc.context(S, sys);
  $("pill").className = `pill ${tone}`;
  $("pillTxt").textContent = label;

  $("kpis").innerHTML = calc.kpis(R, sys).map((k) =>
    `<div class="kpi"><div class="k-l">${k.label}</div><div class="k-v${k.tone ? ` t-${k.tone}` : ""}">${k.v}<span class="k-u">${k.u}</span></div></div>`).join("");

  const ch = calc.chart(S, R, sys);
  $("chart").innerHTML = ch.svg;
  $("chartCap").textContent = ch.caption;

  const word = { ok: "OK", warn: "Warn", bad: "Fail", na: "—" };
  $("checks").innerHTML = calc.checkRows(S, R, list, sys).map((c) =>
    `<tr><td>${c.label}</td><td>${c.val}<span class="u">${c.u}</span></td><td>${c.lim}</td><td class="t-${c.sev}">${word[c.sev]}</td></tr>`).join("");

  $("kv").innerHTML = calc.details(S, R, sys).map(([k, d]) =>
    `<div><dt>${k}</dt><dd${d.mono ? ' class="mono"' : ""}>${d.v}${d.u ? `<span class="u">${d.u}</span>` : ""}</dd></div>`).join("");

  $("foot").textContent = calc.footnote;
  fxToast();
}

function fxToast() {
  const order = calc.alerts || [["rupture", "Rupture"], ["leak", "Flange leak"], ["overstress", "Overstressed"], ["choke", "Choked flow"],
    ["stall", "ΔP exceeds inlet pressure"], ["hydrate", "Hydrates forming"], ["shake", "Above erosional velocity"]];
  const hit = order.find(([k]) => R.fx[k]);
  const key = hit ? hit[0] : "";
  if (key && key !== lastFx) toast(hit[1]);
  lastFx = key;
}

/* ---------- Inputs ---------- */
function fieldValue(f) {
  const v = S[f.id];
  return f.kind ? +toDisplay(f.kind, sys, v).toPrecision(6) : v;
}

function buildForm() {
  const ex = calc.examples.findIndex(([, o]) => Object.entries({ ...calc.defaults, ...o }).every(([k, v]) => S[k] === v));
  let h = `<div class="field full"><label for="in-case">Case</label><select id="in-case">${
    ex < 0 ? `<option value="-1" selected>Custom</option>` : ""}${
    calc.examples.map(([n], i) => `<option value="${i}" ${i === ex ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;
  for (const g of calc.inputs) {
    h += `<div class="grp">${g.title}</div>`;
    for (const f of g.fields) {
      const u = f.unit ?? (f.kind ? unit(f.kind, sys) : "");
      h += `<div class="field"><label for="in-${f.id}">${f.label}<span class="u">${u}</span></label>`;
      if (f.options) {
        h += `<select id="in-${f.id}" data-f="${f.id}">${f.options.map(([v, l]) =>
          `<option value="${v}" ${String(S[f.id]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      } else {
        h += `<input id="in-${f.id}" data-f="${f.id}" type="text" inputmode="decimal" value="${fieldValue(f)}" aria-describedby="err-${f.id}">`;
      }
      h += `<span class="err" id="err-${f.id}" hidden></span></div>`;
    }
  }
  $("form").innerHTML = h;
}

const fieldDef = (id) => calc.inputs.flatMap((g) => g.fields).find((f) => f.id === id);

function onInput(e) {
  const el = e.target;
  if (el.id === "in-case") {
    const i = +el.value; if (i < 0) return;
    S = { ...calc.defaults, ...calc.examples[i][1] };
    lastFx = ""; buildForm(); render(); return;
  }
  const f = fieldDef(el.dataset.f); if (!f) return;
  const draft = { ...S };
  // read every numeric field so cross-field rules (e.g. P > −Patm) see current text
  for (const g of calc.inputs) for (const d of g.fields) {
    const node = $(`in-${d.id}`); if (!node) continue;
    if (d.options) draft[d.id] = d.number ? +node.value : node.value;
    else {
      const raw = node.value.trim().replace(/,/g, "").replace(/−/g, "-");
      const n = raw === "" ? NaN : Number(raw);
      draft[d.id] = Number.isFinite(n) && d.kind ? fromDisplay(d.kind, sys, n) : n;
    }
  }
  const errs = calc.validate(draft);
  for (const g of calc.inputs) for (const d of g.fields) {
    if (d.options) continue;
    const raw = $(`in-${d.id}`)?.value.trim();
    if (raw === "") errs[d.id] = "Required";
    else if (!Number.isFinite(draft[d.id])) errs[d.id] = "Not a number";
  }
  for (const g of calc.inputs) for (const d of g.fields) {
    const node = $(`in-${d.id}`), err = $(`err-${d.id}`); if (!node || d.options) continue;
    const m = errs[d.id];
    node.setAttribute("aria-invalid", m ? "true" : "false");
    err.hidden = !m; err.textContent = m || "";
  }
  if (Object.keys(errs).length) return; // keep last valid result
  S = draft;
  const caseSel = $("in-case");
  if (caseSel && caseSel.value !== "-1") { // mark as custom without rebuilding the form
    caseSel.insertAdjacentHTML("afterbegin", `<option value="-1">Custom</option>`); caseSel.value = "-1";
  }
  render();
}
$("form").addEventListener("input", onInput);

$("form").addEventListener("submit", (e) => e.preventDefault());

/* ---------- Method (typeset with KaTeX → MathML) ---------- */
let eqDone = false;
function tex(src, display) {
  if (window.katex) {
    try { return window.katex.renderToString(src, { output: "mathml", displayMode: display, throwOnError: false }); } catch { /* fall through */ }
  }
  return `<code>${esc(src)}</code>`;
}
function renderMethod() {
  if (eqDone) return;
  $("eqs").innerHTML = calc.equations.map((e) =>
    `<div class="eq"><div class="eq-l">${e.label}</div><div class="eq-m">${tex(e.tex, true)}</div></div>`).join("");
  $("sym").innerHTML = calc.symbols.map(([s, d, u]) => `<tr><td>${tex(s, false)}</td><td>${d}</td><td>${u}</td></tr>`).join("");
  eqDone = !!window.katex;
}

/* ---------- Tabs ---------- */
function setTab(t) {
  for (const [k, v] of [["res", "vRes"], ["in", "vIn"], ["eq", "vEq"]]) {
    $(`tab-${k}`).setAttribute("aria-selected", String(k === t));
    $(v).hidden = k !== t;
  }
  if (t === "eq") renderMethod();
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

/* ---------- Chart: tap a bar to pick that NPS ---------- */
function pickBar(g) {
  S = { ...S, nps: +g.dataset.nps };
  buildForm(); render();
}
$("chart").addEventListener("click", (e) => { const g = e.target.closest(".bar"); if (g) pickBar(g); });
$("chart").addEventListener("keydown", (e) => {
  const g = e.target.closest(".bar");
  if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickBar(g); }
});

/* ---------- Units and layers ---------- */
function setUnits(next) {
  sys = next; store.set("units", sys);
  $("uMetric").setAttribute("aria-selected", String(sys === "metric"));
  $("uImperial").setAttribute("aria-selected", String(sys === "imperial"));
  buildForm(); render();
}
$("uMetric").onclick = () => setUnits("metric");
$("uImperial").onclick = () => setUnits("imperial");
$("lyFlow").onchange = (e) => { layers.flow = e.target.checked; };
$("lyDims").onchange = (e) => { layers.dims = e.target.checked; };
$("lyProfile").onchange = (e) => { layers.profile = e.target.checked; };
$("resetBtn").onclick = () => { S = { ...calc.defaults }; lastFx = ""; buildForm(); render(); closePop(); toast("Inputs reset"); };

/* ---------- Panel ---------- */
const panel = $("panel");
const isPhone = () => matchMedia("(max-width: 639px)").matches;
function openPanel() { panel.hidden = false; document.body.classList.add("sheet-open"); fit(); }
function closePanel() { panel.hidden = true; panel.classList.remove("expanded"); document.body.classList.remove("sheet-open", "sheet-expanded"); fit(); }
function toggleExpand() {
  const on = panel.classList.toggle("expanded");
  document.body.classList.toggle("sheet-expanded", on);
  $("expBtn").setAttribute("aria-label", on ? "Collapse" : "Expand");
  setTimeout(fit, 230);
}
$("closeBtn").onclick = closePanel;
$("expBtn").onclick = toggleExpand;
$("grab").onclick = toggleExpand;
document.body.classList.add("sheet-open");

/* ---------- Search ---------- */
const qEl = $("q"), sug = $("suggest");
let sgIdx = 0, sgItems = [];
function renderSuggest() {
  const term = qEl.value.trim().toLowerCase();
  sgItems = CATALOG.filter((c) => !term || c.name.toLowerCase().includes(term) || c.category.toLowerCase().includes(term))
    .sort((a, b) => (b.calc ? 1 : 0) - (a.calc ? 1 : 0));
  sgIdx = Math.min(sgIdx, Math.max(0, Math.min(sgItems.length, 12) - 1));
  if (!sgItems.length) { sug.innerHTML = `<div class="sg-empty">No matches</div>`; return; }
  const rx = term ? new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i") : null;
  sug.innerHTML = sgItems.slice(0, 12).map((c, i) =>
    `<button class="sg-row${c.calc ? "" : " off"}" role="option" id="sg-${i}" data-i="${i}" aria-selected="${i === sgIdx}">
      <span class="lbl">${rx ? esc(c.name).replace(rx, "<b>$1</b>") : esc(c.name)}</span><span class="typ">${c.calc ? c.category : "Soon"}</span></button>`).join("");
  qEl.setAttribute("aria-activedescendant", `sg-${sgIdx}`);
}
function showSuggest(on) { sug.hidden = !on; qEl.setAttribute("aria-expanded", String(on)); if (on) renderSuggest(); }
function choose(i) {
  const it = sgItems[i]; if (!it) return;
  showSuggest(false); qEl.value = ""; qEl.blur();
  if (!it.calc) { toast(`${it.name} · not built yet`); return; }
  if (it.calc !== calc) { calc = it.calc; S = { ...calc.defaults }; eqDone = false; lastFx = ""; buildForm(); render(); fit(); }
  history.replaceState(null, "", `#${calc.id}`);
  openPanel(); setTab("res");
}
qEl.addEventListener("focus", () => { closePop(); showSuggest(true); });
qEl.addEventListener("input", () => { sgIdx = 0; showSuggest(true); });
qEl.addEventListener("keydown", (e) => {
  const n = Math.min(sgItems.length, 12);
  if (e.key === "ArrowDown") { e.preventDefault(); sgIdx = Math.min(sgIdx + 1, n - 1); renderSuggest(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); sgIdx = Math.max(sgIdx - 1, 0); renderSuggest(); }
  else if (e.key === "Enter") { e.preventDefault(); choose(sgIdx); }
  else if (e.key === "Escape") { showSuggest(false); qEl.blur(); }
});
sug.addEventListener("mousedown", (e) => e.preventDefault());
sug.addEventListener("click", (e) => { const b = e.target.closest(".sg-row"); if (b) choose(+b.dataset.i); });
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); qEl.focus(); }
});

/* ---------- Settings popover ---------- */
const pop = $("pop"), setBtn = $("setBtn");
function closePop() { pop.hidden = true; setBtn.setAttribute("aria-expanded", "false"); }
setBtn.onclick = (e) => {
  e.stopPropagation();
  const open = pop.hidden; pop.hidden = !open; setBtn.setAttribute("aria-expanded", String(open));
  if (open) showSuggest(false);
};
document.addEventListener("pointerdown", (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !setBtn.contains(e.target)) closePop();
  if (!sug.hidden && !$("searchWrap").contains(e.target)) showSuggest(false);
});
$("popNote").textContent = "Flow colour: amber above the velocity guideline, red at erosional.";

/* ---------- Toast ---------- */
let toastT;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- Scene canvas ---------- */
const cv = $("scene"), ctx = cv.getContext("2d");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let playing = !reduce, dpr = 1, vw = 0, vh = 0, userZoom = 1, pan = { x: 0, y: 0 }, drag = null;
let cam = { x: 0, y: 0, z: 1 }, camT = { x: 0, y: 0, z: 1 }, snap = true;
const tok = {};
const TOKENS = { page: "--page", card: "--card", text: "--text", muted: "--muted", line: "--line", soft: "--soft", steel: "--steel",
  steelEdge: "--steel-edge", grid: "--grid", particle: "--particle", amber: "--amber", amberText: "--amber-text", bad: "--bad" };
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const [k, v] of Object.entries(TOKENS)) tok[k] = cs.getPropertyValue(v).trim();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readTokens);
new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); vw = innerWidth; vh = innerHeight;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  snap = true; fit();
}
function fit() {
  let x0 = 0, y0 = 70, x1 = vw, y1 = vh;
  if (!panel.hidden) { const r = panel.getBoundingClientRect(); if (isPhone()) y1 = r.top; else x0 = r.right; }
  if (isPhone()) { x1 = vw - 52; y0 = 64; }
  const w = Math.max(x1 - x0, 120), h = Math.max(y1 - y0, 120);
  const b = w < 700 ? calc.scene.bounds.compact : calc.scene.bounds.full;
  const z = Math.min(w / b.w, h / b.h) * 0.96 * userZoom;
  camT = { x: (x0 + x1) / 2 - b.cx * z, y: (y0 + y1) / 2 - b.cy * z, z };
  if (snap) { cam = { ...camT }; snap = false; }
}
addEventListener("resize", resize);

$("zIn").onclick = () => { userZoom = Math.min(userZoom * 1.25, 4); fit(); };
$("zOut").onclick = () => { userZoom = Math.max(userZoom / 1.25, 0.4); fit(); };
$("zFit").onclick = () => { userZoom = 1; pan = { x: 0, y: 0 }; fit(); };
function setPlaying(on) {
  playing = on;
  $("play").setAttribute("aria-label", on ? "Pause" : "Play");
  $("playIco").innerHTML = on ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M8 5v14l11-7z"/>';
}
$("play").onclick = () => setPlaying(!playing);
setPlaying(playing);

cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }; cv.setPointerCapture(e.pointerId); cv.classList.add("drag"); });
cv.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  pan = { x: drag.px + dx, y: drag.py + dy };
});
cv.addEventListener("pointerup", () => { cv.classList.remove("drag"); if (drag && !drag.moved && panel.hidden) openPanel(); drag = null; });
cv.addEventListener("wheel", (e) => { e.preventDefault(); userZoom = Math.max(0.4, Math.min(4, userZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); fit(); }, { passive: false });

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const e = 1 - Math.pow(0.001, dt);
  cam.x += (camT.x - cam.x) * e; cam.y += (camT.y - cam.y) * e; cam.z += (camT.z - cam.z) * e;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = tok.page; ctx.fillRect(0, 0, vw, vh);
  const gs = 28 * cam.z;
  if (gs > 8) {
    ctx.fillStyle = tok.grid;
    const ox = (cam.x + pan.x) % gs, oy = (cam.y + pan.y) % gs;
    for (let x = ox; x < vw; x += gs) for (let y = oy; y < vh; y += gs) ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.save();
  ctx.translate(cam.x + pan.x, cam.y + pan.y); ctx.scale(cam.z, cam.z); ctx.translate(-22, -30);
  const TS = Math.max(1, Math.min(1.6, 0.72 / cam.z));
  const F = (w, px, fam) => `${w} ${(px * TS).toFixed(1)}px ${fam === "m" ? "'JetBrains Mono', monospace" : "Figtree, sans-serif"}`;
  if (R) calc.scene.draw(ctx, { now, dt, playing, layers, tok, TS, F, s: S, r: R, sys });
  ctx.restore();
  requestAnimationFrame(frame);
}

/* ---------- Boot ---------- */
readTokens();
setUnits(sys);
resize();
requestAnimationFrame((t) => { last = t; frame(t); });
if (document.fonts) document.fonts.ready.then(readTokens);
