import gasLineSizing from "./gas-line-sizing/view.js";

/** Live calculators. Add a module here once it is built. */
export const LIVE = [gasLineSizing];

/** Full catalogue from the source workbooks; entries without a module are not built yet. */
export const CATALOG = [
  ["Gas Line Sizing", "Piping"], ["Liquid Line Sizing", "Piping"], ["2-Phase Line Sizing", "Piping"],
  ["Flowline Sizing", "Piping"], ["Reducer and Expansion", "Piping"], ["Gooseneck Flow", "Piping"],
  ["B31.3 Pipe Stress", "Piping"], ["B31.3 Threaded Pipe Stress", "Piping"], ["Pipe Stress", "Piping"],
  ["Diameter-Inch Welding", "Piping"], ["Meter Run Weight", "Piping"], ["Pressure Test Plan", "Piping"],
  ["Horizontal Separator", "Vessels"], ["Horizontal Separator with Weir", "Vessels"], ["Vertical Separator", "Vessels"],
  ["FWKO", "Vessels"], ["FWKO with Weir", "Vessels"], ["Flare Knockout Drum", "Vessels"],
  ["Treater Sizing", "Vessels"], ["Firetube Sizing", "Vessels"],
  ["Thermal PSV Sizing", "Relief"], ["Blowdown Time", "Relief"], ["Blowdown with Cv", "Relief"],
  ["Gas Blowdown with Cv", "Relief"], ["Blowdown Rate and Valve Check", "Relief"], ["Gas Blowby", "Relief"],
  ["Fisher Universal Sizing", "Relief"],
  ["Tank Vent", "Tanks"], ["API 2000 Tank Venting", "Tanks"], ["API 12F Normal Venting", "Tanks"],
  ["Tank Berm Sizing", "Tanks"], ["Tank Heat Loss", "Tanks"],
  ["CO₂ Emissions", "Emissions"], ["SO₂ Emissions", "Emissions"], ["NOx Emissions", "Emissions"],
  ["AER Manual 15", "Emissions"], ["Combustion Emissions Reduction", "Emissions"],
  ["Fuel Gas and NOx", "Emissions"], ["Fuel Gas Consumption", "Emissions"],
  ["H₂S Release Volume", "Emissions"], ["Inlet Sulfur", "Emissions"],
  ["Pump Head", "Pumps"], ["NPSHa", "Pumps"], ["Reciprocating Rates", "Pumps"],
  ["Flash Gas", "Process"], ["Partial Pressure", "Process"], ["DEOS", "Process"],
  ["Volume and Mass Flow", "Conversions"], ["PPM Conversions", "Conversions"],
  ["Calculation Cover Sheet", "Admin"], ["Calculation Log", "Admin"],
].map(([name, category]) => ({ name, category, calc: LIVE.find((c) => c.name === name) || null }));
