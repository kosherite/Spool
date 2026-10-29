// CSA Z662 steel pipeline design pressure (cl. 4.3.6).  P = (2 S t / D) × F × L × J × T

/** CSA Z245.1 grades: SMYS and SMTS, MPa. */
export const GRADES = {
  "241": { smys: 241, smts: 414 }, "290": { smys: 290, smts: 414 }, "359": { smys: 359, smts: 455 },
  "386": { smys: 386, smts: 490 }, "414": { smys: 414, smts: 517 }, "448": { smys: 448, smts: 531 },
};

/** Location factor L, Table 4.2 (general; no road or railway crossing). */
export const LOCATION = {
  gas:  [1.0, 0.9, 0.7, 0.55],
  sour: [0.9, 0.75, 0.625, 0.5],
  lvp:  [1.0, 1.0, 1.0, 1.0],
};
export const SERVICES = { gas: "Gas / multiphase", sour: "Sour service", lvp: "LVP liquid" };

export const DESIGN_FACTOR = 0.8;

/** Temperature factor T, Table 4.3 (≤ 120 °C → 1.0). */
export function tempFactor(tC) {
  if (tC <= 120) return 1.0;
  if (tC <= 150) return 0.97;
  if (tC <= 180) return 0.93;
  if (tC <= 200) return 0.91;
  return 0.87; // to 230 °C
}

/** Design pressure, MPa. D and t in mm (t = nominal wall less corrosion allowance). */
export function designPressure({ smys, odMm, tMm, service, cls, tC, J = 1 }) {
  const Lf = LOCATION[service][cls - 1];
  if (!(tMm > 0)) return 0;
  return ((2 * smys * tMm) / odMm) * DESIGN_FACTOR * Lf * J * tempFactor(tC);
}

/** Barlow burst at minimum tensile strength, MPa. */
export const burstPressure = ({ smts, odMm, tMm }) => (2 * smts * tMm) / odMm;
