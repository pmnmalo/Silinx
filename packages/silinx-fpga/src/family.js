// Xilinx device families known to ISE 14.7, and the open toolchains' others (the iCE40, #2295; the ECP5, #2302; the Gowin, #2303; the GateMate, #2431; the Intel FPGAs, #5376) (isomorphic:
// used by the server and the browser). An open family's constraints format (constraints) and its bitstream's extension (bitstream).
// Detection works from the part name alone, so it also covers parts missing from the device DB.

export const FAMILY_INFO = {
  spartan3:     { name: 'Spartan-3',          xise: 'Spartan3',                 pm: 'spartan3' },
  spartan3e:    { name: 'Spartan-3E',         xise: 'Spartan3E',                pm: 'spartan3e' },
  spartan3a:    { name: 'Spartan-3A / 3AN',   xise: 'Spartan3A and Spartan3AN', pm: 'spartan3a' },
  spartan3adsp: { name: 'Spartan-3A DSP',     xise: 'Spartan3A DSP',            pm: 'spartan3adsp' },
  spartan6:     { name: 'Spartan-6',          xise: 'Spartan6',                 pm: 'spartan6' },
  virtex4:      { name: 'Virtex-4',           xise: 'Virtex4',                  pm: 'virtex4' },
  virtex5:      { name: 'Virtex-5',           xise: 'Virtex5',                  pm: 'virtex5' },
  virtex6:      { name: 'Virtex-6',           xise: 'Virtex6',                  pm: 'virtex6' },
  // (#1648: an experimental family, its constraints XDC, its flows to come: Vivado #1649, the Silinx toolchain #3146)
  artix7:       { name: 'Artix-7',            xise: 'Artix7',                   pm: 'artix7', experimental: true, constraints: 'xdc', backEnd: 'vivado' },
  // (#3895: the 7-series of Vivado ML Standard, the free edition, besides the Artix-7: Vivado's flow, no open toolchain
  // (openFlow: false, no bit database of their parts); the Spartan-7 is not ISE 14.7's at all; the Virtex-7 is no free
  // edition's: ISE's as it was)
  spartan7:     { name: 'Spartan-7',                                            pm: 'spartan7', experimental: true, constraints: 'xdc', backEnd: 'vivado', openFlow: false },
  kintex7:      { name: 'Kintex-7',           xise: 'Kintex7',                  pm: 'kintex7', experimental: true, constraints: 'xdc', backEnd: 'vivado', openFlow: false },
  virtex7:      { name: 'Virtex-7',           xise: 'Virtex7',                  pm: 'virtex7' },
  // (#4680: its programmable logic the 7-series' fabric, the Silinx toolchain's 7-series back end's, openFamily; its parts with
  // a bit database and a chip database of nextpnr's, openParts: the XC7Z010 and the XC7Z020, the others Vivado's alone; its
  // processing system not set up yet, #4679)
  zynq:         { name: 'Zynq-7000',          xise: 'Zynq',                     pm: 'zynq', experimental: true, constraints: 'xdc', backEnd: 'vivado', openFamily: 'artix7', openParts: /^xc7z0[12]0$/ },
  ice40:        { name: 'iCE40', constraints: 'pcf', bitstream: '.bin' },
  // (#2302: Project Trellis's, nextpnr-ecp5 and ecppack; its constraints LPF, its bitstream ecppack's .bit, no Xilinx header)
  ecp5:         { name: 'ECP5', constraints: 'lpf', bitstream: '.bit' },
  // (#2303: Apicula's, nextpnr-himbaechel-gowin; its constraints CST; its bitstream gowin_pack's .fs, not made yet: Python)
  gowin:        { name: 'Gowin GW1N', constraints: 'cst', bitstream: '.fs' },
  // (#2431: Project Peppercorn's, nextpnr-himbaechel-gatemate and gmpack; its constraints Cologne Chip's CCF, its bitstream gmpack's .bit)
  gatemate:     { name: 'GateMate', constraints: 'ccf', bitstream: '.bit' },
  // (#5376: the Intel (Altera) FPGAs of Terasic's DE boards, experimental families: their boards and their constraints, QSF
  // (qsf.js, its clocks in an SDC); Intel Quartus Prime their back end on the local server (#5378), none in the browser
  // (next: what the browser edition's message adds); the Silinx toolchain's Cyclone V (#5377: nextpnr-mistral, its openParts: the
  // parts of Mistral's e50f and sx120f, whose routing data @silinx/nextpnr-mistral has, open-flow-mistral.js), in the browser too
  max10:        { name: 'MAX 10', experimental: true, constraints: 'qsf', bitstream: '.svf', vendor: 'intel', backEnd: 'quartus', openFlow: false, next: 'Intel Quartus Prime implements it on the local server' },
  cyclone4e:    { name: 'Cyclone IV E', experimental: true, constraints: 'qsf', bitstream: '.rbf', vendor: 'intel', backEnd: 'quartus', openFlow: false, next: 'Intel Quartus Prime implements it on the local server' },
  cyclone5:     { name: 'Cyclone V', experimental: true, constraints: 'qsf', bitstream: '.rbf', vendor: 'intel', backEnd: 'quartus', openParts: /^5c(e[bf]a[24]|s[ext][a-z]{2}[56])$/, next: 'Intel Quartus Prime implements it on the local server; the Silinx toolchain the 5CEBA2 / A4 and the 5CSxA5 / A6' },
};

/** Family id of a part name such as xc3s250e, xc6slx9, xc3s700an, xc7a100t, ice40up5k. */
export function familyOfPart(part) {
  const p = String(part || '').toLowerCase().replace(/^x[aq](?=\d)/, 'xc'); // XA (automotive) / XQ (defense) parts
  if (/^xc3sd\d+a/.test(p)) return 'spartan3adsp';
  if (/^xc3s\d+e$/.test(p)) return 'spartan3e';
  if (/^xc3s\d+an?$/.test(p)) return 'spartan3a';
  if (/^xc3s\d+l?$/.test(p)) return 'spartan3';
  if (/^xc6s/.test(p)) return 'spartan6';
  if (/^xc4v/.test(p)) return 'virtex4';
  if (/^xc5v/.test(p)) return 'virtex5';
  if (/^xc6v/.test(p)) return 'virtex6';
  if (/^xc7a/.test(p)) return 'artix7';
  if (/^xc7s/.test(p)) return 'spartan7';
  if (/^xc7k/.test(p)) return 'kintex7';
  if (/^xc7v/.test(p)) return 'virtex7';
  if (/^xc7z/.test(p)) return 'zynq';
  if (/^ice40/.test(p)) return 'ice40';
  if (/^lfe5u/.test(p)) return 'ecp5';   // (LFE5U, LFE5UM, LFE5UM5G)
  if (/^gw1n/.test(p)) return 'gowin';   // (GW1N, GW1NR, GW1NS…)
  if (/^ccgm1a\d+$/.test(p)) return 'gatemate';   // (Cologne Chip's CCGM1A1, A2, A4…)
  if (/^10m\d+[sd][acf]$/.test(p)) return 'max10';   // (10M50DA: single or dual supply, analog / compact / flash, #5376)
  if (/^ep4ce\d+$/.test(p)) return 'cyclone4e';
  if (/^5c(e|g[xt]|s[ext])[a-z]{2}\d+$/.test(p)) return 'cyclone5';   // (5CEBA4, 5CSEMA5, 5CSEBA6, 5CGXFC5…)
  return null;
}

/** Family of a project device ({ family?, part }), trusting the part name over a stale family field. */
export function deviceFamily(device) {
  return familyOfPart(device?.part) || String(device?.family || '').toLowerCase() || null;
}

/** Does ISE implement this family? The others are the open toolchain's only (#2295). */
export const isIseFamily = f => !!FAMILY_INFO[f]?.xise;
/** Is this project device's family one only the open toolchain implements? (An unknown family is not: it stays with ISE's flow;
 *  nor one Vivado implements, the Spartan-7, #3895.) */
export const openOnlyDevice = device => { const f = deviceFamily(device); return !!FAMILY_INFO[f] && !isIseFamily(f) && !FAMILY_INFO[f].backEnd; };
/** Is this project device's family an experimental one (#1648): its boards and constraints, no flow that runs yet? */
export const experimentalDevice = device => !!FAMILY_INFO[deviceFamily(device)]?.experimental;
/** Is this project device's family one AMD Vivado implements (#1649: the Artix-7, on the local server; #3895: the Spartan-7,
 *  the Kintex-7 and the Zynq-7000, Vivado ML Standard's; the Virtex-7 keeps ISE 14.7's flow)? */
export const vivadoDevice = device => FAMILY_INFO[deviceFamily(device)]?.backEnd === 'vivado';
/** Is this project device's family one Intel Quartus Prime implements (#5378: the MAX 10, the Cyclone IV E, the Cyclone V, on the
 *  local server)? */
export const quartusDevice = device => FAMILY_INFO[deviceFamily(device)]?.backEnd === 'quartus';
/** Has this project device's family a flow of the Silinx toolchain (#3895: not the 7-series' but the Artix-7's, whose bit
 *  database Silinx has; #4680: the Zynq-7000's XC7Z010 and XC7Z020, its openParts)? An ISE family's is the Silinx
 *  toolchain's Spartan-3E / Spartan-6 one, or its message. */
export const openFlowDevice = device => {
  const info = FAMILY_INFO[deviceFamily(device)];
  return info?.openFlow !== false && (!info?.openParts || info.openParts.test(String(device?.part || '').toLowerCase()));
};
/** The family whose back end of the Silinx toolchain implements this one: the Zynq-7000's the Artix-7's, the 7-series' (its
 *  programmable logic the same fabric, #4680); the family itself otherwise. */
export const openFamilyOf = family => FAMILY_INFO[family]?.openFamily || family;
/** Why the Silinx toolchain does not implement a device of a Vivado-only family (#3895): the interface offers Vivado alone; or a
 *  Quartus family's part out of its openParts (#5377): Intel Quartus Prime's alone. */
export const noOpenFlowMessage = device => `the Silinx toolchain has no back end for the ${String(device?.part || '').toUpperCase()} (${familyName(deviceFamily(device))}): ${quartusDevice(device) ? 'Intel Quartus Prime implements it (Synthesis Tool: Quartus' : 'AMD Vivado implements it (Synthesis Tool: Vivado'}, on the local server)`;
/** Why an experimental family's device has no implementation (the interface offers none; a request gets this error): its
 *  constraints' format, and what comes next (the Intel families', #5376). */
export const noFlowMessage = device => {
  const info = FAMILY_INFO[deviceFamily(device)];
  return `the ${String(device?.part || '').toUpperCase()} (${familyName(deviceFamily(device))}, an experimental family) has no implementation flow yet: its boards and its ${(info?.constraints || 'xdc').toUpperCase()} constraints only${info?.next ? ` (${info.next})` : ''}`;
};
/** The format of a project device's constraints: 'pcf' (the iCE40's), 'lpf' (the ECP5's, #2302), 'cst' (the Gowin's, #2303), 'ccf' (the GateMate's, #2431), 'xdc' (the 7-series', #3142), 'qsf' (the Intel families', #5376) or 'ucf'. */
export const constraintsFormatOf = device => FAMILY_INFO[deviceFamily(device)]?.constraints || 'ucf';
/** The extension of a project device's constraints file: '.ucf', '.pcf', '.lpf', '.cst', '.ccf', '.xdc' or '.qsf'. */
export const constraintsExtOf = device => `.${constraintsFormatOf(device)}`;
/** The extension of a project device's bitstream (build/<top><ext>): '.bit' (Xilinx's, ecppack's, gmpack's), '.bin' (icepack's), '.fs' (gowin_pack's). */
export const bitstreamExtOf = device => FAMILY_INFO[deviceFamily(device)]?.bitstream || '.bit';
/** A project device as its vendor's tools name it: xc3s250e-4-cp132 (part, speed, package: ISE's); an Intel one Quartus's,
 *  5CEBA4F23C7 (#5376). */
export const deviceLabel = d => (FAMILY_INFO[deviceFamily(d)]?.vendor === 'intel' ? `${d.part}${d.package}${d.speed}`.toUpperCase() : `${d?.part}${d?.speed}-${d?.package}`);
export const familyName = f => FAMILY_INFO[f]?.name || f || 'unknown family';
export const isSpartan3Like = f => /^spartan3/.test(f || '');
export const familyFromXise = text => {
  const t = String(text || '').toLowerCase().replace(/[\s-]/g, '');
  for (const [id, fi] of Object.entries(FAMILY_INFO)) if (fi.xise?.toLowerCase().replace(/[\s-]/g, '') === t || (fi.pm && fi.pm === t)) return id;
  if (/spartan3a/.test(t)) return 'spartan3a';
  return null;
};

/** Split a bitstream header part such as "3s250ecp132" or "6slx9csg324" into { part, package }. */
export function splitBitPart(p) {
  const m = /^(?:xc)?(\d[a-z]+\d+[a-z]*?)((?:cpg|cp|csg|cs|tqg|tq|vqg|vq|pqg|pq|ftg|ft|fgg|fg|ffg|ff|fbg|fb|sbg|sb|rfg|rf|rbg|rb|clg|cl|cg|sf)\d+)$/i.exec(String(p || ''));
  return m ? { part: `xc${m[1].toLowerCase()}`, package: m[2].toLowerCase() } : null;
}
