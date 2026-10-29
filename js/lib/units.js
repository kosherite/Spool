// Quantity kinds. Each kind has a base unit (what the calc stores) and a
// display unit per system. `to` converts base -> display, `from` the reverse.
const id = (v) => v;
const KPA_PER_PSI = 6.894757;

export const KINDS = {
  // inputs (base: metric)
  stdFlow:   { metric: ["e³m³/d", id, id], imperial: ["MMscfd", (v) => v * 0.0353147, (v) => v / 0.0353147] },
  pressG:    { metric: ["kPag", id, id], imperial: ["psig", (v) => v / KPA_PER_PSI, (v) => v * KPA_PER_PSI] },
  pressA:    { metric: ["kPa", id, id], imperial: ["psia", (v) => v / KPA_PER_PSI, (v) => v * KPA_PER_PSI] },
  tempC:     { metric: ["°C", id, id], imperial: ["°F", (v) => v * 9 / 5 + 32, (v) => (v - 32) * 5 / 9] },
  lengthM:   { metric: ["m", id, id], imperial: ["ft", (v) => v * 3.28084, (v) => v / 3.28084] },
  lengthKm:  { metric: ["km", id, id], imperial: ["mi", (v) => v / 1.609344, (v) => v * 1.609344] },
  dp100In:   { metric: ["kPa/100 m", id, id], imperial: ["psi/100 ft", (v) => v * 0.0442075, (v) => v / 0.0442075] },
  speedIn:   { metric: ["m/s", id, id], imperial: ["ft/s", (v) => v * 3.28084, (v) => v / 3.28084] },
  tankP:     { metric: ["kPag", id, id], imperial: ["oz/in²", (v) => (v / KPA_PER_PSI) * 16, (v) => (v / 16) * KPA_PER_PSI] },
  airStd:    { metric: ["Sm³/h", id, id], imperial: ["SCFM", (v) => (v * 35.3147) / 60, (v) => (v * 60) / 35.3147] },
  thickMm:   { metric: ["mm", id, id], imperial: ["in", (v) => v / 25.4, (v) => v * 25.4] },
  none:      { metric: ["", id, id], imperial: ["", id, id] },
  count:     { metric: ["", id, id], imperial: ["", id, id] },
  liqFlow:   { metric: ["m³/d", id, id], imperial: ["bbl/d", (v) => v * 6.289811, (v) => v / 6.289811] },
  densKg:    { metric: ["kg/m³", id, id], imperial: ["lb/ft³", (v) => v / 16.01846, (v) => v * 16.01846] },
  dpKpa:     { metric: ["kPa", id, id], imperial: ["psi", (v) => v / KPA_PER_PSI, (v) => v * KPA_PER_PSI] },
  modGpa:    { metric: ["GPa", id, id], imperial: ["ksi", (v) => v * 145.0377, (v) => v / 145.0377] },

  // results (base: US field units)
  velocity:  { metric: ["m/s", (v) => v * 0.3048], imperial: ["ft/s", id] },
  dp100:     { metric: ["kPa/100 m", (v) => v * KPA_PER_PSI * 3.28084], imperial: ["psi/100 ft", id] },
  dpPsi:     { metric: ["kPa", (v) => v * KPA_PER_PSI], imperial: ["psi", id] },
  psig:      { metric: ["kPag", (v) => v * KPA_PER_PSI], imperial: ["psig", id] },
  psia:      { metric: ["kPa(a)", (v) => v * KPA_PER_PSI], imperial: ["psia", id] },
  density:   { metric: ["kg/m³", (v) => v * 16.01846], imperial: ["lb/ft³", id] },
  massFlow:  { metric: ["kg/h", (v) => v * 0.4535924], imperial: ["lb/h", id] },
  actFlow:   { metric: ["m³/h", (v) => v * 0.02831685], imperial: ["ft³/h", id] },
  inch:      { metric: ["mm", (v) => v * 25.4], imperial: ["in", id] },
  degF:      { metric: ["°C", (v) => (v - 32) * 5 / 9], imperial: ["°F", id] },
  degC:      { metric: ["°C", id], imperial: ["°F", (v) => v * 9 / 5 + 32] },
  stressPsi: { metric: ["MPa", (v) => v / 145.0377], imperial: ["psi", id] },
  lengthFt:  { metric: ["m", (v) => v * 0.3048], imperial: ["ft", id] },
  speedMs:   { metric: ["m/s", id], imperial: ["ft/s", (v) => v * 3.28084] },
  psiTank:   { metric: ["kPag", (v) => v * KPA_PER_PSI], imperial: ["oz/in²", (v) => v * 16] },
  scfh:      { metric: ["Sm³/h", (v) => v / 35.3147], imperial: ["SCFM", (v) => v / 60] },
};

export const unit = (kind, sys) => KINDS[kind][sys][0];
export const toDisplay = (kind, sys, v) => KINDS[kind][sys][1](v);
export const fromDisplay = (kind, sys, v) => (KINDS[kind][sys][2] || id)(v);
