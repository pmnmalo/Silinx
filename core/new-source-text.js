// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A new source's text, as New Source's Finish writes it (#4751): one implementation for the interface (web/js/new-source.js)
// and the MCP server's new_source (server/mcp-new-source.js), which built it each its own way. Isomorphic module.
import * as T from './templates.js';
import { cTemplate, cppTemplate } from './c-templates.js';
import { constraintsFormatOf } from '../packages/silinx-fpga/src/parts.js';

/** The kinds of source (the MCP's new_source's types). */
export const SOURCE_KINDS = ['module', 'package', 'test_bench', 'constraints', 'mem', 'c', 'cpp', 'schematic', 'asm', 'fsm', 'petri', 'circuit', 'boolean', 'regmap', 'lab'];
const CONSTRAINTS = { ucf: T.ucfTemplate, pcf: T.pcfTemplate, lpf: T.lpfTemplate, cst: T.cstTemplate, ccf: T.ccfTemplate, xdc: T.xdcTemplate, qsf: T.qsfTemplate };
// a drawing's or a C function's name from the file's
const ident = n => String(n).replace(/[^A-Za-z0-9_]/g, '_');

/**
 * The text of a new source of kind `kind` (SOURCE_KINDS) named `file` (no extension) in project `pj`. lang: 'vhdl' |
 * 'verilog'; a module's entity, arch (VHDL) and ports; a test bench's uut (core/uut-info.js uutInfo); a constraints file's
 * format (ucf, pcf, lpf, cst, ccf, xdc, qsf; the device's when not given); a circuit's template ({ id, params }: the Digital
 * Electronic Circuit Wizard's assembly; none, a half breadboard and its supply), a state diagram's (the FSM Wizard's;
 * none, an empty diagram). Throws for an unknown kind.
 */
export async function sourceText(kind, { file, lang = 'vhdl', pj = {}, entity, arch, ports = [], uut, format, template } = {}) {
  const n = ident(file);
  switch (kind) {
    case 'module': return lang === 'vhdl' ? T.vhdlModule(entity, arch, ports, pj) : T.vlogModule(entity, ports, pj);
    case 'package': return T.vhdlPackage(file, pj);
    case 'test_bench': return lang === 'vhdl' ? T.vhdlTestbench(file, uut, pj) : T.vlogTestbench(file, uut, pj);
    // (the device's format: UCF, the iCE40's PCF, the ECP5's LPF, the Gowin's CST, the GateMate's CCF, the 7-series' XDC, the Intel families' QSF)
    case 'constraints': return (CONSTRAINTS[format || constraintsFormatOf(pj.device)] || T.ucfTemplate)(pj);
    case 'mem': return '// memory initialization file ($readmemh format)\n00\n01\n02\n03\n';
    case 'c': return cTemplate(n);
    case 'cpp': return cppTemplate(n);
    case 'schematic': return JSON.stringify((await import('./schdoc.js')).newDoc(n, lang), null, 1);
    case 'asm': return JSON.stringify((await import('./asm.js')).normalizeModel({ name: n, lang }), null, 2);   // empty (#2176)
    // (empty, #2176; the FSM Wizard's template, #4902: a counter, a sequence detector of bits or of a regular expression…)
    case 'fsm': return JSON.stringify(template ? (await import('./chart-wizard.js')).fsmFromSpec({ name: n, lang, ...(await import('./chart-templates.js')).fsmTemplate(template.id, template.params) })
      : (await import('./fsm.js')).normalizeFsm({ name: n, lang }), null, 2);
    case 'petri': return JSON.stringify((await import('./petri.js')).normalizePetri({ name: n, lang }), null, 2);   // empty (#2176)
    // (a half breadboard and its supply, #3897; the Digital Electronic Circuit Wizard's assembly, #4061)
    case 'circuit': return JSON.stringify(template ? (await import('./circuit-templates.js')).circuitTemplate(template.id, template.params, { name: n, lang })
      : (await import('./circuit.js')).newCircuit(n, lang), null, 2);
    case 'boolean': return JSON.stringify({ ...(await import('./logic.js')).newTable(n, ['a', 'b', 'c'], ['f']), lang }, null, 2);
    case 'regmap': return (await import('./regmap.js')).writeRegmap((await import('./regmap.js')).newRegmap(n, 'spi', lang));   // (#5288)
    case 'lab': return `${JSON.stringify((await import('./labs.js')).newLab(file, { top: pj.top, simTop: pj.simTop }), null, 2)}\n`;
    default: throw new Error(`no source of kind '${kind}'`);
  }
}
