// Shared single-phase hydraulics. US field units: in, ft, ft/s, lb/ft³, cP, psi.

export const EPS_STEEL_IN = 0.0018; // commercial steel absolute roughness

/** Darcy friction factor. Laminar 64/Re below 2000; Colebrook–White above,
 *  solved by fixed-point iteration from the Swamee–Jain estimate. */
export function colebrook(Re, dIn, epsIn = EPS_STEEL_IN) {
  if (!(Re > 0)) return NaN;
  if (Re < 2000) return 64 / Re;
  const rr = epsIn / dIn;
  let f = 0.25 / Math.log10(rr / 3.7 + 5.74 / Re ** 0.9) ** 2;
  for (let i = 0; i < 50; i++) {
    const next = (-2 * Math.log10(rr / 3.7 + 2.51 / (Re * Math.sqrt(f)))) ** -2;
    if (Math.abs(next - f) < 1e-12) return next;
    f = next;
  }
  return f;
}

/** Reynolds number, Crane form: d in, V ft/s, ρ lb/ft³, μ cP. */
export const reynolds = (dIn, V, rho, mu) => (123.9 * dIn * V * rho) / mu;

/** Darcy pressure drop per 100 ft, psi (Crane TP-410 eq. 3-5). W lb/h. */
export const dp100 = (f, W, dIn, rho) => (0.000336 * f * W * W) / (dIn ** 5 * rho);

/** Velocity head loss, psi, for a resistance coefficient K. */
export const kLossPsi = (K, rho, V) => (K * rho * V * V) / (2 * 32.174 * 144);

/** Hooper 2-K fittings: K = K₁/Re + K∞(1 + 1/D), D in inches.
 *  Entrances and exits use K = K₁/Re + K∞ (no size term). */
export const FITTINGS = [
  { id: "ell90",  label: "90° elbow",      K1: 800,  Kinf: 0.25 },
  { id: "ell90lr", label: "90° LR elbow",  K1: 800,  Kinf: 0.20 },
  { id: "mitre",  label: "90° mitre",      K1: 800,  Kinf: 0.35 },
  { id: "teeRun", label: "Tee, run",       K1: 150,  Kinf: 0.50 },
  { id: "teeBr",  label: "Tee, branch",    K1: 800,  Kinf: 0.80 },
  { id: "gate",   label: "Gate / ball",    K1: 300,  Kinf: 0.10 },
  { id: "globe",  label: "Globe",          K1: 1500, Kinf: 2.00 },
  { id: "check",  label: "Swing check",    K1: 1500, Kinf: 1.50 },
  { id: "bfly",   label: "Butterfly",      K1: 800,  Kinf: 0.25 },
  { id: "entry",  label: "Entrance",       K1: 160,  Kinf: 0.50, end: true },
  { id: "exit",   label: "Exit",           K1: 0,    Kinf: 1.00, end: true },
];

export function fittingK(fit, Re, dIn) {
  return fit.K1 / Re + fit.Kinf * (fit.end ? 1 : 1 + 1 / dIn);
}

/** Equivalent length, ft: L = K·D / f. */
export const equivLengthFt = (K, dIn, f) => (K * (dIn / 12)) / f;

/** Sudden expansion / contraction K, referenced to the small-bore velocity (Crane). */
export const kExpansion = (beta) => (1 - beta * beta) ** 2;
export const kContraction = (beta) => 0.5 * (1 - beta * beta);

/** Pressure-wave speed in a thin-walled elastic pipe, m/s (Korteweg).
 *  Kb bulk modulus Pa, ρ kg/m³, D and e in m, E pipe modulus Pa. */
export function waveSpeed(Kb, rho, D, e, E = 200e9) {
  return Math.sqrt((Kb / rho) / (1 + (Kb * D) / (E * e)));
}

/** Hooper (1988) 2-K reducer / expander loss, referenced to the UPSTREAM velocity.
 *  type "con": D1 large → D2 small; "exp": D1 small → D2 large. f = Darcy friction factor
 *  of the upstream pipe. theta = included cone angle, degrees (180 = square / sudden). */
export function kHooperReducer({ type, Re, f, d1, d2, theta = 180 }) {
  const r = d1 / d2, s = Math.sin((Math.min(180, Math.max(1, theta)) * Math.PI) / 360);
  if (type === "con") {
    let K = Re < 2500 ? (1.2 + 160 / Re) * (r ** 4 - 1) : (0.6 + 0.48 * f) * r * r * (r * r - 1);
    if (theta < 45) K *= 1.6 * s; else if (theta < 180) K *= Math.sqrt(s);
    return K;
  }
  let K = Re < 4000 ? 2 * (1 - r ** 4) : (1 + 0.8 * f) * (1 - r * r) ** 2;
  if (theta < 45) K *= 2.6 * s;
  return K;
}

/** Contraction coefficient at the vena contracta (Weisbach), area ratio a = A_small / A_large. */
export const contractionCc = (a) => 0.62 + 0.38 * a ** 3;
