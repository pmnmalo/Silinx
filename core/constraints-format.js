// Silinx - a constraints file's pins in its device family's format (#5588, moved from web/js/constraints-format.js for
// the System's FPGA nodes and the MCP server, #5581): UCF, the iCE40's PCF (#2296), the ECP5's LPF (#2302), the Gowin's
// CST (#2303), the GateMate's CCF (#2431) or the 7-series' XDC (#3142). The interface's model is parseUcf's: a bus's bit
// written x<1>, as PCF, LPF and XDC write x[1]; PCF's and LPF's own text stays nextpnr's. Isomorphic module.
import { PCF, LPF, CST, CCF, XDC, constraintsFormatOf, generateUcf, parseUcf } from '../packages/silinx-fpga/src/parts.js';

const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toPcf = net => net.replace(/<(\d+)>$/, '[$1]');
// the formats nextpnr reads, its names (x[1])
const NEXTPNR = { pcf: PCF, lpf: LPF, cst: CST, ccf: CCF };
const renamed = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

/** The pins of a constraints text: { assignments, clocks, other }. */
export function readPins(device, text, opts) {
  const format = constraintsFormatOf(device);
  if (format === 'ucf') return parseUcf(text, opts);
  if (format === 'xdc') return XDC.read(text);   // (its reader writes the model's names, x<1>)
  const m = NEXTPNR[format].read(text);
  return { ...m, assignments: renamed(m.assignments, toModel), clocks: m.clocks.map(c => ({ ...c, net: toModel(c.net) })) };
}

/** The text of the pins, generateUcf's arguments. */
export function writePins(device, { assignments = {}, clocks = [], header, ...rest }) {
  const format = constraintsFormatOf(device);
  if (format === 'ucf') return generateUcf({ assignments, clocks, header, ...rest });
  if (format === 'xdc') return `${header ? `# ${header}\n` : ''}${XDC.write({ assignments, clocks, ...rest })}`;
  const body = NEXTPNR[format].write({ assignments: renamed(assignments, toPcf), clocks: clocks.map(c => ({ ...c, net: toPcf(c.net) })), ...rest });
  return `${header ? `${NEXTPNR[format].comment || '#'} ${header}\n` : ''}${body}`;
}
