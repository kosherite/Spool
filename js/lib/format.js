import { toDisplay, unit } from "./units.js";

const nf = (d) => new Intl.NumberFormat("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const cache = {};
export const fixed = (v, d) => (Number.isFinite(v) ? (cache[d] ||= nf(d)).format(v) : "—");

/** Readable precision: ~3–4 significant figures, thousands separators. */
export function num(v) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return fixed(v, a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4);
}

/** Format a base-unit value of `kind` in the active unit system. */
export function q(kind, sys, v, digits) {
  const d = toDisplay(kind, sys, v);
  return { v: digits === undefined ? num(d) : fixed(d, digits), u: unit(kind, sys), raw: d };
}
