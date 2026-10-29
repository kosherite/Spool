// Shared piping data and code checks. Units: inches, psi, °F.

/** Nominal pipe sizes with OD and ID per ASME B36.10M. */
export const NPS = [1, 1.5, 2, 3, 4, 6, 8, 10, 12];
export const OD = [1.315, 1.900, 2.375, 3.500, 4.500, 6.625, 8.625, 10.750, 12.750];
export const ID = {
  "40": [1.049, 1.610, 2.067, 3.068, 4.026, 6.065, 7.981, 10.020, 11.938],
  "80": [0.957, 1.500, 1.939, 2.900, 3.826, 5.761, 7.625, 9.562, 11.374],
};
export const SCHEDULES = { "40": "40 / STD", "80": "80 / XS" };

export const npsLabel = (n) => (n === 1.5 ? "1½" : String(n));
const idx = (nps) => {
  const i = NPS.indexOf(nps);
  if (i < 0) throw new RangeError(`Unsupported NPS ${nps}`);
  return i;
};
export const pipeOD = (nps) => OD[idx(nps)];
export const pipeID = (nps, sch) => ID[sch][idx(nps)];
export const pipeWall = (nps, sch) => (pipeOD(nps) - pipeID(nps, sch)) / 2;

/** ASME B31.3 Table A-1 basic allowable stress (≤ 400 °F), min. tensile, and
 *  minimum metal temperature without impact testing (°C, simplified). */
export const MATERIALS = {
  "A106B":  { name: "A106 Gr B", S: 20000, UTS: 60000, mdmtC: -29 },
  "A333-6": { name: "A333 Gr 6", S: 20000, UTS: 60000, mdmtC: -45 },
};

/** ASME B16.5 Table 2-1.1 (Group 1.1), psig at °F. */
const FL_T = [100, 200, 300, 400, 500];
export const FLANGE = {
  "150": [285, 260, 230, 200, 170],
  "300": [740, 680, 655, 635, 605],
  "600": [1480, 1360, 1310, 1265, 1205],
};
export function flangeRating(cls, tempF) {
  const r = FLANGE[cls];
  if (tempF <= FL_T[0]) return r[0];
  if (tempF >= FL_T[FL_T.length - 1]) return r[r.length - 1];
  for (let i = 0; i < FL_T.length - 1; i++) {
    if (tempF <= FL_T[i + 1]) return r[i] + (r[i + 1] - r[i]) * (tempF - FL_T[i]) / (FL_T[i + 1] - FL_T[i]);
  }
}

/** B31.3 eq. (3a) solved for P. E = W = 1 (seamless), Y = 0.4, 12.5 % mill tolerance. */
export function mawp({ od, tn, ca, S }) {
  const tm = 0.875 * tn - ca;
  return { tm, P: tm > 0 ? (2 * S * tm) / (od - 2 * 0.4 * tm) : 0 };
}

/** Barlow burst pressure at minimum tensile strength, minimum wall. */
export const burst = ({ od, tn, UTS }) => (2 * UTS * 0.875 * tn) / od;
