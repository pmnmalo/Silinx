// The MCP server's related views (server/mcp.js, #2834): the read-only views the interface shows beside a document
// (its tabs' Show … Beside, web/js/related-views.js) that are no file of the project, made as the interface makes them,
// nothing written: an HDL source's translation to the other language (core/translate.js, #2711), a state diagram's ASM
// chart and an ASM chart's state diagram (core/fsm-asm.js), a Petri net's state machine (core/petri-fsm.js, #2696), a
// truth table's schematic (core/logic.js, #694) and its results, the editor's results panel (#2927). The others are read_file's (a drawing's HDL), c_generated's and
// c_synthesis_report's (a C source's).
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';
import { isDesignOnly } from '../core/project-kind.js';
import { notationSetting } from './mcp-notation.js';
import { NOTATION_IDS, showExpr } from '../core/expr-notation.js';

const VIEWS = ['translation', 'asm', 'fsm', 'schematic', 'results'];
// (Settings ▸ Boolean Notation's, #3915, then the older ones formatExpr has)
const NOTATIONS = [...NOTATION_IDS, 'slash-compact', 'textbook', 'compact', 'ascii'];
const base = p => p.split('/').pop();

async function source(name, rel) {
  return projectText(name, rel, `no file '${rel}' in the project '${name}'`);
}
const json = (text, rel) => { try { return JSON.parse(text); } catch (e) { throw toolError(`${rel}: ${e.message}`); } };

export const VIEW_TOOLS = [
  {
    name: 'related_view', title: 'A read-only view related to a source',
    description: 'A view the interface shows beside a source, made from it and read-only, nothing written to the project: translation (an HDL source in the other language: VHDL to Verilog, Verilog to VHDL), asm (a state diagram\'s ASM chart, its JSON), fsm (an ASM chart\'s state diagram, or a Petri net\'s state machine: a state per marking, its JSON), schematic (a Boolean algebra / truth table\'s schematic, its JSON), results (a Boolean algebra / truth table\'s results, as its editor shows them, per output: the forms of least gates and of least delay, the Karnaugh map\'s SOP and POS (up to 6 inputs) with every minimal solution when there are several (up to 64; the one used marked), Quine-McCluskey\'s SOP and POS (every table, up to 16 inputs) with their prime implicants, the essential ones and whether proven minimal, the canonical SOP and POS, the minterm and maxterm lists, the XOR form when simpler, the NAND and NOR forms, each output\'s HDL logic (set_output_logic changes it)). A drawing\'s HDL is read_file\'s, a C source\'s c_generated\'s and c_synthesis_report\'s; convert_drawing makes a drawing a new module.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The source: an HDL file (.vhd, .v), a state diagram (.fsm.json), an ASM chart (.asm.json), a Petri net (.pn.json) or a truth table (.bool.json, .tt.json).'), view: { type: 'string', enum: VIEWS, description: 'The view.' }, notation: { type: 'string', enum: NOTATIONS, description: 'results: the notation of the expressions (default: the table\'s own, as its editor\'s menu sets it, else the one set_notation set, as the Settings ▸ Boolean Notation; engineering, a̅·b + c, when none is).' } }, required: ['project', 'path', 'view'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false },
    async run({ project: name, path: rel, view, notation }) {
      await readProject(name);
      if (!VIEWS.includes(view)) throw toolError(`view: ${VIEWS.join(', ')}`);
      const text = await source(name, rel);
      if (view === 'translation') {
        const { translateSource, translatedPath, translationLang } = await import('../core/translate.js');
        const from = /\.vhdl?$/i.test(rel) ? 'vhdl' : /\.s?v$/i.test(rel) ? 'verilog' : null;
        if (!from) throw toolError(`${rel}: an HDL source (.vhd, .v) is translated`);
        const to = translationLang(rel, from === 'vhdl' ? 'verilog' : 'vhdl');
        const sources = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
        const r = translateSource(text, { path: rel, to, sources });
        if (!r.ok) throw toolError(`${base(rel)} cannot be translated to ${to === 'vhdl' ? 'VHDL' : 'Verilog'}: ${r.errors.map(e => `${e.line ? `line ${e.line}: ` : ''}${e.message}`).join('; ')}`);
        return { text: r.text, data: { project: name, path: rel, view, lang: to, name: translatedPath(base(rel), to), text: r.text } };
      }
      if (view === 'results') {
        if (!/\.(tt|bool)\.json$/i.test(rel)) throw toolError(`${rel}: a truth table (.bool.json, .tt.json) has results`);
        if (notation === undefined) notation = json(text, rel).notation || await notationSetting();   // (the table's own, #3939, else the one set)
        if (!NOTATIONS.includes(notation)) throw toolError(`notation: ${NOTATIONS.join(', ')}`);
        return tableResults(name, rel, json(text, rel), notation, isDesignOnly(await P.readProject(name)));
      }
      if (view === 'schematic') {
        if (!/\.(tt|bool)\.json$/i.test(rel)) throw toolError(`${rel}: a truth table (.bool.json, .tt.json) has a schematic`);
        const { schematicFromTable, validateTable, normalizeTable } = await import('../core/logic.js');
        const m = normalizeTable(json(text, rel));
        const errs = validateTable(m).filter(x => x.severity !== 'warning');
        if (errs.length) throw toolError(`the schematic of ${base(rel)}: ${errs.map(x => x.message).join('; ')}`);
        return reply(name, rel, view, schematicFromTable(m));
      }
      if (view === 'asm') {
        if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: a state diagram (.fsm.json) has an ASM chart`);
        const F = await import('../core/fsm.js');
        const f = F.normalizeFsm(json(text, rel));
        const errs = F.fsmErrors(f);
        if (errs.length) throw toolError(`the ASM chart of ${base(rel)}: ${errs.map(x => x.message).join('; ')}`);
        return reply(name, rel, view, F.fsmToAsm(f));
      }
      if (/\.pn\.json$/i.test(rel)) {
        const { petriToFsm } = await import('../core/petri-fsm.js');
        const r = petriToFsm(json(text, rel), { notation: notation ?? await notationSetting() });   // (#3915)
        if (!r.fsm) throw toolError(`the state machine of ${base(rel)}: ${r.error}`);
        return reply(name, rel, view, r.fsm, { states: r.states, truncated: !!r.truncated });
      }
      if (!/\.asm\.json$/i.test(rel)) throw toolError(`${rel}: an ASM chart (.asm.json) or a Petri net (.pn.json) has a state diagram`);
      const { asmToFsm } = await import('../core/fsm.js');
      try { return reply(name, rel, view, asmToFsm(json(text, rel), { notation: notation ?? await notationSetting() })); } catch (e) { if (e.toolError) throw e; throw toolError(`${base(rel)} cannot be shown as a state diagram: ${e.message}`); }
    },
  },
];
const reply = (name, rel, view, model, more = {}) => ({ text: JSON.stringify(model, null, 2), data: { project: name, path: rel, view, model, ...more } });

// a truth table's results, as the editor's results panel shows them (web/js/truthtable.js renderResults, #2927): each
// output's HDL logic too (#2951), and the minimal solution its SOP and POS use (#2950)
async function tableResults(name, rel, doc, notation, design = false) {
  const L = await import('../core/logic.js');
  const { canonicalCost } = await import('../core/logic-canon.js');
  const m = L.normalizeTable(doc);
  const errs = L.validateTable(m).filter(x => x.severity !== 'warning');
  if (errs.length) throw toolError(`the results of ${base(rel)}: ${errs.map(x => x.message).join('; ')}`);
  const { cubeText } = await import('../core/qm.js');
  const n = m.inputs.length, kmap = n <= L.MAX_KMAP_INPUTS;
  const outputs = m.outputs.map(o => {
    const A = L.analyzeOutput(m, o);   // (past 6 inputs, Quine-McCluskey's: bounded, #3939)
    const ex = ast => `${o} = ${showExpr(ast, notation)}`;
    // a minimal form (the solution used, `used`) and every minimal solution of it (#2928, #2950); `many`: the cap reached
    // (a form's terms, literals and gates by type, as the editor says them, #4091)
    const cost = (ast, form) => { const c = L.formCost(ast, form); return { cost: c.text, gates: c.gates.types.map(([type, k]) => ({ type, count: k })) }; };
    const minimal = r => ({ expr: ex(r.ast), terms: r.terms.length, literals: r.literals, ...cost(r.ast, r.form), used: r.pick, many: r.solutions >= 64,
      solutions: r.alternatives.map(a => ({ expr: ex(a.ast), terms: a.terms.length, literals: a.literals, gates: a.gates })) });
    // Quine-McCluskey's (#3939): its prime implicants, the essential ones, the columns of its steps when small, minimal or not proven
    const cube = (c, pos) => ex(L.minimalAst({ form: pos ? 'pos' : 'sop', terms: [c] }, m.inputs)).replace(/^[^=]*= /, '');
    const qm = r => ({ expr: ex(r.ast), terms: r.terms.length, literals: r.literals, ...cost(r.ast, r.form), exact: r.exact, method: r.method,
      primes: r.primes.map(p => ({ cube: cubeText(p, n), expr: cube(p, r.form === 'pos'), essential: p.essential })),
      essential: r.essential.map(p => cube(p, r.form === 'pos')),
      columns: r.steps?.columns ? r.steps.columns.map(col => col.map(c => ({ cube: cubeText(c, n), combined: c.combined }))) : null });
    const formName = f => L.formName(m, f);   // (the minimal SOP and POS past 6 inputs: Quine-McCluskey's, as the editor's)
    const least = goal => { const r = L.outputForm(m, o, goal); return { form: formName(r.form), expr: ex(r.ast), ...cost(r.ast, r.form) }; };
    const hdl = L.outputForm(m, o);
    return {
      output: o, canonicalSop: ex(A.canon.sop), canonicalPos: ex(A.canon.pos), minterms: `${o} = ${A.sigma}`, maxterms: `${o} = ${A.pi}`,
      canonicalCost: canonicalCost(A.col, m.inputs.length),   // (their terms, literals and gates, #3072)
      canonicalSopCost: cost(A.canon.sop, 'csop'), canonicalPosCost: cost(A.canon.pos, 'cpos'),
      kmap: kmap ? { sop: minimal(A.sop), pos: minimal(A.pos) } : null, quineMcCluskey: { sop: qm(A.qm.sop), pos: qm(A.qm.pos) },
      xor: A.xor ? ex(A.xor.ast) : null, nand: ex(A.nand.ast), nor: ex(A.nor.ast),
      xorCost: A.xor ? cost(A.xor.ast, 'xor') : null, nandCost: cost(A.nand.ast, 'nand'), norCost: cost(A.nor.ast, 'nor'), leastGates: least('gates'), leastDelay: least('delay'),
      hdlLogic: { form: L.formOf(m, o), name: formName(L.formOf(m, o)), expr: ex(hdl.ast), what: hdl.what },
    };
  });
  const lines = outputs.flatMap(r => [   // (the editor's order, #3065)
    // (the function, then its terms, literals and gates by type, #4091)
    `Least number of gates: ${r.leastGates.expr}   (${r.leastGates.cost})`, `Least delay: ${r.leastDelay.expr}   (${r.leastDelay.cost})`,
    // (then the Karnaugh map's, up to 6 inputs, and Quine-McCluskey's, #3939)
    ...(r.kmap ? ['sop', 'pos'].flatMap(k => [`Karnaugh map ${k.toUpperCase()}: ${r.kmap[k].expr}   (${r.kmap[k].cost})`, ...solutionLines(r.kmap[k])])
      : [`Karnaugh map: none for more than ${L.MAX_KMAP_INPUTS} inputs (it has ${n}): the simplified function is Quine-McCluskey's.`]),
    ...['sop', 'pos'].flatMap(k => qmLines(k, r.quineMcCluskey[k])),
    // (its list, #2952, then its expression, #3069, its terms and literals, #3072)
    `Canonical SOP: ${r.minterms}   (${r.canonicalSopCost.cost})`, `  ${r.canonicalSop}`,
    `Canonical POS: ${r.maxterms}   (${r.canonicalPosCost.cost})`, `  ${r.canonicalPos}`,
    ...(r.xor ? [`XOR form: ${r.xor}   (${r.xorCost.cost})`] : []), `NAND form: ${r.nand}   (${r.nandCost.cost})`, `NOR form: ${r.nor}   (${r.norCost.cost})`,
    `${design ? 'Logic' : 'HDL logic'}: ${r.hdlLogic.name}: ${r.hdlLogic.expr}   (${r.hdlLogic.what})`, '']);   // (a design project's: no HDL, #3891)
  return { text: lines.join('\n').trimEnd(), data: { project: name, path: rel, view: 'results', notation, inputs: m.inputs, outputs } };
}
// Quine-McCluskey's SOP or POS (#3939): its expression, its prime implicants (up to 40 listed) and the essential ones
const qmLines = (k, q) => [`Quine-McCluskey ${k.toUpperCase()}: ${q.expr}   (${q.cost}${q.exact ? '' : '; not proven minimal'})`,
  q.primes.length <= 40 ? `  Prime implicants${k === 'pos' ? ' of the 0s' : ''}: ${q.primes.map(p => `${p.cube} ${p.expr}`).join(', ') || 'none'}` : `  ${q.primes.length} prime implicant(s)`,
  `  Essential: ${q.essential.join(', ') || 'none'}`];
// the minimal solutions of a form, when it has several (#2928), as the editor's selector says them, the one used marked
const solutionLines = m => (m.solutions.length < 2 ? [] : [
  `  ${m.many ? 'Many minimal solutions exist; the first 64 can be browsed.' : `${m.solutions.length} minimal solutions exist.`}`,
  ...m.solutions.map((x, i) => `  Solution ${i + 1} of ${m.solutions.length}: ${x.expr}${i === m.used ? '   (used)' : ''}`)]);
