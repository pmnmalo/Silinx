// The MCP server's Symbol Info (server/mcp.js, #3935): a schematic symbol's datasheet, as the schematic editor's Symbol
// Info dialog shows it (web/js/symbol-info.js), through the same functions (core/symdocs.js symbolDoc, core/symtables.js
// truthTable): its description and formula, its pins, its parameters, its truth table or mode table, its Xilinx library
// equivalents, a device primitive's resource on the project's part, and its equivalent VHDL and Verilog. A design and
// simulation project's (#3891): no HDL, no Xilinx equivalents, no device primitive nor HDL BLOCK, as its palette. A
// symbol built of others (#4806, core/symlib.js: ADD8 of ADD4, ADD4 of FA1, FA1 of gates): its composition's levels, and
// symbol_composition draws each one, as a schematic, for an assistant to walk down them as a student pushes into them.
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
      const L = await import('../core/symlib.js');
      const comp = found.type === 'module' ? null : L.composition(found.type, p);
      if (comp) lines.push('', `${T('Composition')}:`, ...comp.modules.map(m => `  ${L.levelLine(m)}`));
      if (!design && d.xilinx.length) lines.push('', `${T('Xilinx library equivalents')}: ${d.xilinx.join(', ')}`);
      if (d.hdl) for (const l of ['vhdl', 'verilog']) if (d.hdl[l]) lines.push('', `${T('Equivalent HDL')} (${l === 'vhdl' ? 'VHDL' : 'Verilog'}):`, d.hdl[l].trimEnd());
      const data = { project: name, symbol: d.title, type: found.type, preset: d.preset, category: d.category, text: d.text, formula: d.formula, pins: d.pins,
        params: d.params.map(x => ({ name: x.name, label: x.label, value: x.value, default: x.default, meaning: x.meaning })), mode: d.mode || null,
        truthTable: table && table.kind !== 'none' ? table : null, resource: d.resource || null,
        composition: comp ? { top: comp.top, levels: comp.modules.map(m => ({ module: m.name, parts: L.levelParts(m) })) } : null,
        ...(design ? {} : { xilinx: d.xilinx, hdl: d.hdl || null }) };
      return { text: lines.join('\n'), data, untrusted: found.type === 'module' ? 'the project\'s module\'s names' : undefined };
    },
  },
  {
    name: 'symbol_composition', title: 'Symbol Composition',
    description: 'A level of a palette symbol\'s composition, as a schematic (read-only, as read_file returns a schematic): the symbol built of the symbols of the level below, down to the gates (ADD8: two ADD4; ADD4: four FA1; FA1: two XOR2, two AND2 and an OR2; SUB8: an ADD8 with B and the borrows inverted). Its levels are symbol_info\'s Composition: a level by its module (left out: the top, the symbol itself), or by its path of instances from the top (["U1", "U2"]: the schematic editor\'s Push into, then into U2). With inputs (the symbol\'s input pins\' values; a counter\'s count Q too, its state), the level\'s values as a Try it of the symbol pushed into shows them: its inputs, from the levels above simulated with the symbol\'s, and its outputs. A view: the HDL generated for the symbol is its own, proved equivalent to the composition. The adders, subtractors, comparators, counters, multiplexers, decoders, demultiplexers and encoders have one so far.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, symbol: STR('The symbol: its name in the palette or the Xilinx library (ADD8, SUB16), or its type (add, sub).'),
      params: { type: 'object', description: 'Its parameters, as Symbol Info\'s fields (e.g. { "width": 16, "cin": true }); left out: the symbol\'s.' },
      module: STR('The level: one of the composition\'s modules (ADD4, FA1…); left out: its top (or the path\'s).'),
      path: { type: 'array', items: { type: 'string' }, description: 'The level by the instances pushed into from the top, in order (["U1", "U2"]).' },
      inputs: { type: 'object', description: 'The symbol\'s input pins\' values (a counter\'s count Q too: its state), as numbers or "0x5F" / "0b101" texts (e.g. { "A": 95, "B": 33, "CI": 1 }): the level\'s values are given.' },
    }, required: ['project', 'symbol'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, symbol, params = {}, module = null, path = null, inputs = null }) {
      await readProject(name);
      if (!symbol) throw toolError('symbol: a symbol\'s name (ADD8, SUB16…)');
      const [D, Sch, L] = await Promise.all([import('../core/symdocs.js'), import('../core/schdoc.js'), import('../core/symlib.js')]);
      const found = findSymbol(symbol, { SYMBOLS: Sch.SYMBOLS, XILINX_SYMBOLS: D.XILINX_SYMBOLS, titleOf: t => D.symbolDoc(t, {}, { withHdl: false }).title }, {});
      if (!found) throw toolError(`no symbol '${symbol}' in the palette`);
      const comp = L.composition(found.type, { ...found.params, ...params });
      if (!comp) throw toolError(`${symbol}: no composition (a symbol of the palette drawn as it is; the adders, subtractors, comparators, counters, multiplexers, decoders, demultiplexers and encoders have one)`);
      const levelOf = n => comp.modules.find(m => m.name.toLowerCase() === String(n).toLowerCase());
      // (the path of instances from the top: each one an instance of a module of the level above)
      const steps = [{ module: comp.top, instance: null }];
      for (const inst of path || []) {
        const s = levelOf(steps[steps.length - 1].module).doc.symbols.find(x => x.type === 'module' && x.name.toLowerCase() === String(inst).toLowerCase());
        if (!s) throw toolError(`path: no instance '${inst}' in ${steps[steps.length - 1].module}: one of ${levelOf(steps[steps.length - 1].module).doc.symbols.filter(x => x.type === 'module').map(x => x.name).join(', ') || 'none (gates only)'}`);
        steps.push({ module: s.params.module, instance: s.name });
      }
      const level = module == null ? levelOf(steps[steps.length - 1].module) : levelOf(module);
      if (!level) throw toolError(`no level '${module}' in the composition of ${comp.symbol}: one of ${comp.modules.map(m => m.name).join(', ')}`);
      if (module != null && path && level.name !== steps[steps.length - 1].module) throw toolError(`module ${level.name} is not the path's level, ${steps[steps.length - 1].module}`);
      const parts = L.levelParts(level);
      const text = [`${comp.symbol}: ${L.levelLine(level)}${level === comp.modules[0] ? '' : ` (a level of ${comp.top}${path?.length ? `: ${steps.slice(1).map(x => x.instance).join(' › ')}` : ''})`}`,
        `${level.name}'s drawing (a schematic, read-only; its modules: ${parts.filter(x => x.module).map(x => x.name).join(', ') || 'none, gates only'}):`,
        JSON.stringify(level.doc, null, 1)];
      let values = null;
      if (inputs) {
        if (module != null && !path && level !== comp.modules[0]) throw toolError(`inputs: the level by its path (["U1", …]), so that its instance is known`);
        const LV = await import('../core/symlib-live.js'), { buildLiveSim } = await import('../core/schlive.js');
        // (an output given: a sequential symbol's state, a counter's count Q, #4811)
        const ins = comp.modules[0].ports.filter(q => q.dir === 'in'), outs = found.type === 'counter' ? comp.modules[0].ports.filter(q => q.dir !== 'in') : [], pins = [...ins, ...outs], top = {}, state = {};
        for (const [k, v] of Object.entries(inputs)) if (!pins.some(q => q.name.toLowerCase() === k.toLowerCase())) throw toolError(`inputs: no pin '${k}' (${ins.map(q => q.name).join(', ')}${outs.length ? `; a count, a state: ${outs.map(q => q.name).join(', ')}` : ''})`);
        for (const q of pins) {
          const k = Object.keys(inputs).find(x => x.toLowerCase() === q.name.toLowerCase());
          if (k == null) { if (q.dir === 'in') top[q.name] = null; continue; }
          let v;
          try { v = BigInt(typeof inputs[k] === 'number' ? Math.trunc(inputs[k]) : String(inputs[k]).trim()); } catch { throw toolError(`inputs: ${q.name}: '${inputs[k]}' is not a number`); }
          if (v < 0n || v >> BigInt(q.width) !== 0n) throw toolError(`inputs: ${q.name}: ${inputs[k]} does not fit in its ${q.width} bit(s)`);
          (q.dir === 'in' ? top : state)[q.name] = v;
        }
        const Dv = LV.derivedValues(comp), r = Dv.levelValues(steps, top, state);
        if (r.error) throw toolError(r.error);
        const b = buildLiveSim(level.doc, { modules: Dv.modules, sources: Dv.sources, lang: 'vhdl' });
        if (!b.ok) throw toolError(b.errors.join('; '));
        b.live.restoreInputs(LV.savedInputs(level, r.values));
        if (steps.length === 1) LV.forceOutputs(b.live, level, state);
        const show = v => (LV.knownValue(v) == null ? 'X' : LV.knownValue(v).toString());
        values = Object.fromEntries(level.doc.ports.map(p => [p.name, show(b.live.portValue(p.id))]));
        text.splice(2, 0, `Values (${level.doc.ports.map(p => `${p.name} = ${values[p.name]}`).join(', ')}): ${steps.length > 1 ? 'its inputs from the levels above simulated with the symbol\'s' : 'the symbol\'s'}.`);
      }
      return { text: text.join('\n'), data: { project: name, symbol: comp.symbol, top: comp.top, module: level.name, path: steps.slice(1).map(x => x.instance), levels: comp.modules.map(m => m.name), parts,
        ports: level.ports, ...(values ? { values } : {}), doc: level.doc } };
    },
  },
];
