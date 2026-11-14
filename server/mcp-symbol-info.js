// The MCP server's Symbol Info (server/mcp.js, #3935): a schematic symbol's datasheet, as the schematic editor's Symbol
// Info dialog shows it (web/js/symbol-info.js), through the same functions (core/symdocs.js symbolDoc, core/symtables.js
// truthTable): its description and formula, its pins, its parameters, its truth table or mode table, its Xilinx library
// equivalents, a device primitive's resource on the project's part, and its equivalent VHDL and Verilog. A design and
// simulation project's (#3891): no HDL, no Xilinx equivalents, no device primitive nor HDL BLOCK, as its palette.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { isDesignOnly } from '../core/project-kind.js';

const LIST = 64;   // the truth table's rows listed at most

// a symbol by the name the palette, the Symbol Info or the Xilinx library gives it (M4_1, D2_4E, FDCE, AND2, MUX), its
// type (mux4), or a module of the project: { type, params, preset } (a type the palette reaches through another's
// parameters too, mux4 by MUX's: its Symbol Info the dialog's of a placed one)
function findSymbol(name, { SYMBOLS, XILINX_SYMBOLS, titleOf }, mods) {
  const n = String(name).toUpperCase();
  for (const [type, S] of Object.entries(SYMBOLS)) {
    if (type === 'module') continue;
    const pr = (S.presets || []).find(p => p.title.toUpperCase() === n);
    if (pr) return { type, params: { ...pr.params }, preset: pr.title };
  }
  if (XILINX_SYMBOLS[n]) return { type: XILINX_SYMBOLS[n].type, params: { ...XILINX_SYMBOLS[n].params } };
  for (const [type, S] of Object.entries(SYMBOLS)) {
    if (type === 'module') continue;
    if ([S.title, S.paletteTitle, type].some(t => t && String(t).toUpperCase() === n)) return { type, params: {} };
  }
  // (a title its parameters make, the dialog's: MUX at its defaults is M2_1, mux4's M4_1)
  for (const [type, S] of Object.entries(SYMBOLS)) {
    if (type === 'module' || type === 'hdlblock') continue;
    if (String(titleOf(type)).toUpperCase() === n) return { type, params: {} };
  }
  const m = Object.values(mods).find(x => x.name.toUpperCase() === n);
  return m ? { type: 'module', params: { module: m.name, generics: {} } } : null;
}

// a table's lines: its header, its rows, the cells padded to their column
function tableLines(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length)));
  const line = r => `  ${r.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ').trimEnd()}`;
  return [line(head), ...rows.map(line)];
}
const cells = v => (Array.isArray(v) ? v : String(v).split(''));

// the truth table as the dialog shows it: the compact one when there is one, else its rows (the first LIST)
function truthLines(tt, T, lang) {
  if (tt.kind === 'none') return [];
  if (tt.kind === 'error') return [`${T('Truth table', lang)}: ${tt.error}`];
  const ins = tt.inCols.map(c => c.label), outs = tt.outCols.map(c => c.label);
  const rows = (tt.compact?.length ? tt.compact : tt.rows);
  const out = [`${T('Truth table', lang)} (${tt.compact?.length ? 'compact' : tt.kind}${tt.perBit ? ', bitwise' : ''}):`,
    ...tableLines([...ins, '|', ...outs], rows.slice(0, LIST).map(r => [...cells(r.in), '|', ...cells(r.out)]))];
  if (rows.length > LIST) out.push(`  (${rows.length - LIST} more row(s))`);
  return out;
}

export const SYMBOL_INFO_TOOLS = [
  {
    name: 'symbol_info', title: 'Symbol Info',
    description: 'A schematic symbol\'s datasheet, as the schematic editor\'s Symbol Info (F1, the palette\'s More…) shows it: its description and formula, its pins (direction, width, function), its parameters (value, default, meaning), its truth table (computed by simulating the symbol alone) or its mode table, its Xilinx library equivalents, a device primitive\'s resource on the project\'s device, and its equivalent VHDL and Verilog (a design and simulation project: no HDL, no Xilinx equivalents). The symbol by its palette or Xilinx library name (M4_1, D2_4E, FDCE, AND3B1, ADD8), its type, or a module of the project; parameters change it as the dialog\'s fields do.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, symbol: STR('The symbol: its name in the palette or the Xilinx library (M4_1, FDCE, AND2), its type (mux4), or a module of the project.'),
      params: { type: 'object', description: 'Its parameters, as the dialog\'s fields (e.g. { "width": 4 }); left out: the symbol\'s.' },
      interface_language: { type: 'string', enum: ['en', 'pt'], description: 'The datasheet\'s language: the interface\'s (default en).' },
    }, required: ['project', 'symbol'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, symbol, params = {}, interface_language: lang = 'en' }) {
      const pj = await readProject(name);
      if (!symbol) throw toolError('symbol: a symbol\'s name (M4_1, FDCE, AND2…)');   // (its type and params\', the schema\'s checks)
      const [D, Sch, { truthTable }, { projectModules }] = await Promise.all([import('../core/symdocs.js'), import('../core/schdoc.js'),
        import('../core/symtables.js'), import('./drawing-sync.js')]);
      const mods = await projectModules(P, name);
      const found = findSymbol(symbol, { SYMBOLS: Sch.SYMBOLS, XILINX_SYMBOLS: D.XILINX_SYMBOLS, titleOf: t => D.symbolDoc(t, {}, { withHdl: false }).title }, mods);
      if (!found) throw toolError(`no symbol '${symbol}' in the palette nor a module '${symbol}' in the project`);
      const design = isDesignOnly(pj);
      // (a design project's palette: no HDL BLOCK, no device primitive, #3891)
      if (design && (found.type === 'hdlblock' || Sch.SYMBOLS[found.type]?.prim)) throw toolError(`${symbol}: not a symbol of a design and simulation project (no FPGA)`);
      const { getDeviceDb } = await import('./devices.js');
      const part = design ? null : getDeviceDb().parts.find(p => p.part === pj.device?.part) || null;
      const p = { ...found.params, ...params };
      const d = D.symbolDoc(found.type, p, { lang, modules: mods, preset: found.preset, part, withHdl: !design });
      const T = k => D.T(k, lang);
      const dir = x => T(x === 'in' ? 'input' : x === 'out' ? 'output' : 'bidirectional');
      const lines = [`${T('Symbol Info')}: ${d.preset && d.preset !== Sch.SYMBOLS[found.type]?.title ? `${d.title} (${Sch.SYMBOLS[found.type].title})` : d.title}   ${T('Category')}: ${d.category}`, '',
        `${T('Description')}:`, ...d.text.map(t => `  ${t}`), ...(d.formula ? [`${T('Formula')}: ${d.formula}`] : []), '',
        `${T('Pins')}:`, ...tableLines([T('Pin'), T('Direction'), T('Width'), T('Function')], d.pins.map(q => [q.name, dir(q.dir), q.widthText, q.func]))];
      if (d.params.length) {
        const val = v => (typeof v === 'boolean' ? T(v ? 'yes' : 'no') : String(v ?? ''));
        lines.push('', `${T('Parameters and attributes')}:`, ...tableLines([T('Parameter'), T('Value'), T('Default'), T('Meaning')], d.params.map(x => [x.label, val(x.value), val(x.default), x.meaning])));
      }
      let table = null;
      if (d.mode) {
        const m = d.mode;
        lines.push('', `${T('Mode table')}:`, ...tableLines([...m.cols, '|', m.out], m.rows.map(r => [...m.cols.map(c => r.in[c]), '|', D.modeQText(r.q, found.type, p, lang)])), ...m.notes.map(n => `  ${n}`));
      } else if (found.type !== 'module' && found.type !== 'hdlblock' && !Sch.SYMBOLS[found.type]?.prim) {
        try { table = truthTable(found.type, p, { modules: mods }); } catch (e) { table = { kind: 'error', error: e.message }; }
        const tl = truthLines(table, D.T, lang);
        if (tl.length) lines.push('', ...tl);
      }
      if (!design && d.xilinx.length) lines.push('', `${T('Xilinx library equivalents')}: ${d.xilinx.join(', ')}`);
      if (d.hdl) for (const l of ['vhdl', 'verilog']) if (d.hdl[l]) lines.push('', `${T('Equivalent HDL')} (${l === 'vhdl' ? 'VHDL' : 'Verilog'}):`, d.hdl[l].trimEnd());
      const data = { project: name, symbol: d.title, type: found.type, preset: d.preset, category: d.category, text: d.text, formula: d.formula, pins: d.pins,
        params: d.params.map(x => ({ name: x.name, label: x.label, value: x.value, default: x.default, meaning: x.meaning })), mode: d.mode || null,
        truthTable: table && table.kind !== 'none' ? table : null, resource: d.resource || null, ...(design ? {} : { xilinx: d.xilinx, hdl: d.hdl || null }) };
      return { text: lines.join('\n'), data, untrusted: found.type === 'module' ? 'the project\'s module\'s names' : undefined };
    },
  },
];
