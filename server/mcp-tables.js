// The MCP server's tool of a truth table's outputs (server/mcp.js, #2674): set_output_logic, what the Boolean Algebra
// editor's tick box on a result (an output's HDL logic, #2951) and its Karnaugh map's solution selector (the minimal
// solution used, #2950) do, through the same function (core/logic-choice.js setOutputLogic), and what its Inputs and
// Outputs boxes do (core/logic.js shapeTable: one name changed in place a rename, #5165; one tool for both, within
// tools/list's budget, #4752); the table written and its HDL file made again, as write_file does.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';
import { notationSetting } from './mcp-notation.js';

const NAMES = what => ({ type: 'array', items: { type: 'string' }, minItems: 1, description: what });
const FORMS_TEXT = 'sop, pos (minimal: Karnaugh\'s, past 6 inputs Quine-McCluskey\'s), qsop, qpos (Quine-McCluskey\'s), xor (when simpler, else the SOP), nand, nor, gates (least gates), delay (least delay), csop, cpos (canonical)';

export const TABLE_TOOLS = [
  {
    name: 'set_output_logic', title: 'Set a truth table\'s ports, an output\'s HDL logic or solution',
    description: `Set a truth table's (.bool.json, .tt.json) output's HDL logic, as its editor's tick box on a result (${FORMS_TEXT}; a new output: gates), and / or the minimal solution its SOP or POS uses (k from 0, as related_view lists them); or its inputs and outputs, as its Inputs and Outputs boxes (columns follow their names; one name changed in place: a rename). The table and its HDL written.`,
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The truth table (.bool.json or .tt.json).'), output: STR('The output\'s name.'),
      inputs: NAMES('Its inputs, MSB first.'), outputs: NAMES('Its outputs.'),
      form: { type: 'string', enum: ['sop', 'pos', 'qsop', 'qpos', 'xor', 'nand', 'nor', 'gates', 'delay', 'csop', 'cpos'], description: 'The output\'s HDL logic.' },
      solution: { type: 'object', properties: { sop: { type: 'integer', minimum: 0 }, pos: { type: 'integer', minimum: 0 } }, additionalProperties: false, description: 'The minimal solution used, from 0: { "sop": k } and / or { "pos": k }.' },
    }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, output, form, solution, inputs, outputs }) {
      await readProject(name);
      if (!/\.(tt|bool)\.json$/i.test(rel)) throw toolError(`${rel}: a truth table (.bool.json, .tt.json) has outputs`);
      const logic = form !== undefined || solution !== undefined;
      if (!logic && !inputs && !outputs) throw toolError('form or solution (or inputs, outputs): what to set');
      if (logic && output === undefined) throw toolError('output: the output whose logic to set');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const L = await import('../core/logic.js');
      let doc;
      try {
        doc = L.normalizeTable(JSON.parse(text));
        if (inputs || outputs) doc = L.shapeTable(doc, inputs || doc.inputs, outputs || doc.outputs);   // (the editor's checks)
        if (logic) doc = L.setOutputLogic(doc, output, { form, solution });
      } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const errs = L.validateTable(doc).filter(x => x.severity === 'error');
      if (errs.length) throw toolError(`${rel}: ${errs.map(x => x.message).join('; ')}`);
      await P.writeFile(name, rel, JSON.stringify(doc, null, 2));   // (as its editor saves it)
      const { syncDrawing } = await import('./drawing-sync.js');
      const sync = await syncDrawing(P, name, rel);
      const hdl = sync ? { hdl: { file: sync.target, written: !!sync.written } } : {};
      if (!logic) {
        return { text: [`${rel}: inputs ${doc.inputs.join(', ')}; outputs ${doc.outputs.join(', ')}`, ...(sync?.messages || [])].join('\n'),
          data: { project: name, path: rel, inputs: doc.inputs, outputs: doc.outputs, table: doc.table, ...hdl } };
      }
      const r = L.outputForm(doc, output), f = L.formOf(doc, output);
      // (in the notation set, #3915)
      const { showExpr } = await import('../core/expr-notation.js');
      const expr = `${output} = ${showExpr(r.ast, doc.notation || await notationSetting())}`;   // (the table's own, #3939)
      return { text: [`${rel}: ${output}'s HDL logic: ${L.formName(doc, f)}: ${expr}   (${r.what})`, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, output, form: f, solutions: doc.solutions?.[output] || {}, expr, what: r.what, ...hdl } };
    },
  },
];
