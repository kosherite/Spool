// Two-phase gas–liquid pipe flow: Beggs & Brill (1973). US field units:
// ft/s, lb/ft³, cP, dyn/cm, in. θ is the inclination from horizontal, radians (+ uphill).
import { colebrook } from "./hydraulics.js";

export const PATTERNS = {
  seg: "Stratified",
  tr: "Transition",
  int: "Slug",
  dist: "Dispersed",
};

const HOLDUP = { seg: [0.98, 0.4846, 0.0868], int: [0.845, 0.5351, 0.0173], dist: [1.065, 0.5824, 0.0609] };
const C_UP = { seg: [0.011, -3.768, 3.539, -1.614], int: [2.96, 0.305, -0.4473, 0.0978] };
const C_DOWN = [4.70, -0.3692, 0.1244, -0.5056];

/** Flow-pattern boundaries for no-slip liquid fraction λ. */
export function boundaries(lam) {
  return { L1: 316 * lam ** 0.302, L2: 0.0009252 * lam ** -2.4684, L3: 0.1 * lam ** -1.4516, L4: 0.5 * lam ** -6.738 };
}

export function pattern(lam, NFr) {
  const { L1, L2, L3, L4 } = boundaries(lam);
  if ((lam < 0.01 && NFr < L1) || (lam >= 0.01 && NFr < L2)) return "seg";
  if (lam >= 0.01 && NFr >= L2 && NFr <= L3) return "tr";
  if ((lam >= 0.01 && lam < 0.4 && NFr > L3 && NFr <= L1) || (lam >= 0.4 && NFr > L3 && NFr <= L4)) return "int";
  return "dist";
}

function holdupFor(pat, lam, NFr, NLV, theta) {
  const [a, b, c] = HOLDUP[pat];
  const H0 = Math.max(lam, (a * lam ** b) / NFr ** c);
  let C = 0;
  if (theta < 0) { const [e, f, g, h] = C_DOWN; C = (1 - lam) * Math.log(e * lam ** f * NLV ** g * NFr ** h); }
  else if (pat !== "dist") { const [e, f, g, h] = C_UP[pat]; C = (1 - lam) * Math.log(e * lam ** f * NLV ** g * NFr ** h); }
  C = Math.max(0, C);
  const s = Math.sin(1.8 * theta);
  return Math.min(1, H0 * (1 + C * (s - 0.333 * s ** 3)));
}

/**
 * @param {object} p  VSL, VSG ft/s; rhoL, rhoG lb/ft³; muL, muG cP; sigma dyn/cm; dIn, epsIn in; theta rad
 * @returns pattern, holdup, friction factors and pressure gradients (psi/100 ft)
 */
export function beggsBrill({ VSL, VSG, rhoL, rhoG, muL, muG, sigma, dIn, epsIn, theta = 0 }) {
  const D = dIn / 12, Vm = VSL + VSG, lam = VSL / Vm;
  const NFr = (Vm * Vm) / (32.174 * D);
  const NLV = 1.938 * VSL * (rhoL / sigma) ** 0.25;
  const pat = lam >= 1 ? "dist" : lam <= 0 ? "seg" : pattern(lam, NFr);

  let HL;
  if (lam >= 1) HL = 1;
  else if (lam <= 0) HL = 0;
  else if (pat === "tr") {
    const { L2, L3 } = boundaries(lam), A = (L3 - NFr) / (L3 - L2);
    HL = A * holdupFor("seg", lam, NFr, NLV, theta) + (1 - A) * holdupFor("int", lam, NFr, NLV, theta);
  } else HL = holdupFor(pat, lam, NFr, NLV, theta);

  const rhoN = rhoL * lam + rhoG * (1 - lam);
  const muN = muL * lam + muG * (1 - lam);
  const rhoS = rhoL * HL + rhoG * (1 - HL);
  const ReN = (1488 * rhoN * Vm * D) / muN;
  const fn = colebrook(ReN, dIn, epsIn);

  let S = 0;
  if (lam > 0 && lam < 1 && HL > 0) {
    const y = lam / (HL * HL), ly = Math.log(y);
    S = y > 1 && y < 1.2 ? Math.log(2.2 * y - 1.2) : ly / (-0.0523 + 3.182 * ly - 0.8725 * ly * ly + 0.01853 * ly ** 4);
  }
  const ftp = fn * Math.exp(S);
  const dpFric = ((ftp * rhoN * Vm * Vm) / (2 * 32.174 * D)) * 100 / 144;   // psi/100 ft
  const dpElev = (rhoS * Math.sin(theta) * 100) / 144;                       // psi/100 ft
  return { pat, lam, NFr, NLV, HL, rhoN, muN, rhoS, ReN, fn, S, ftp, Vm, dpFric, dpElev, dp: dpFric + dpElev };
}
