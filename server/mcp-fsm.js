// The MCP server's tool of a state diagram's outputs (server/mcp.js, #2674): a state's or a transition's outputs set
// as its editor's Properties set them (#3814, web/js/fsm-side.js): a value per output of the machine, checked by the
// same function (core/fsm-outputs.js setOutputValues: an output the machine has, a constant that fits in its width),
// an empty one cleared (its default); the diagram written as its editor saves it and its HDL file made again.
// set_fsm_look: a state's or a transition's look (#3883) as its Properties' Look sets it (core/fsm-style.js setStyle:
// the same checks and messages); the HDL made from the diagram does not change.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

export const FSM_TOOLS = [
  {
    name: 'set_fsm_outputs', title: 'Set a state\'s or a transition\'s outputs (state diagram)',
    description: 'Set the outputs of a state (Moore) or a transition (Mealy) of a state diagram (.fsm.json), as its editor\'s Properties do: a constant per output (1, 5, 4\'b1010) that fits its width, or a don\'t care (X or - the whole output, "1X0" or 3\'b1x0 some bits); empty clears it (to the output\'s default, or the state\'s value). A value refused is not written, with the reason. The diagram is written, its HDL made again.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The state diagram: a .fsm.json file of the project.'),
      state: STR('The state, by its name (or give transition).'), transition: STR('The transition, by its id (as read_file shows it; or give state).'),
      values: { type: 'object', additionalProperties: { type: 'string' }, description: '{ output: value }; empty clears it; outputs not given stay.' },
    }, required: ['project', 'path', 'values'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, state, transition, values }) {
      await readProject(name);
      if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: not a state diagram (.fsm.json)`);
      if ((state == null) === (transition == null)) throw toolError('give either state (its name) or transition (its id)');
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw toolError('values: an object { output: value }');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const F = await import('../core/fsm.js');
      const O = await import('../core/fsm-outputs.js');
      let m;
      try { m = F.normalizeFsm(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const obj = state != null ? m.states.find(s => s.name === state) : m.transitions.find(t => t.id === transition);
      if (!obj) throw toolError(state != null ? `no state '${state}' in ${rel}` : `no transition '${transition}' in ${rel}`);
      const where = O.outputsWhere(m, { type: state != null ? 'state' : 'trans', id: obj.id });
      const r = O.setOutputValues(obj.outputs, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '')])), m.outputs);
      if (r.error) throw toolError(`${where}: ${r.error} (not applied)`);
      const changed = JSON.stringify(r.outputs) !== JSON.stringify(obj.outputs);
      obj.outputs = r.outputs;
      const rows = O.outputRows(m, obj.outputs).map(o => `${o.name} = ${o.value || (state != null ? `(${o.default}: default)` : '(the state\'s)')}`);
      let sync = null;
      if (changed) {
        await P.writeFile(name, rel, JSON.stringify(m, null, 2));
        const { syncDrawing } = await import('./drawing-sync.js');
        sync = await syncDrawing(P, name, rel);
      }
      return { text: [`${where}: ${changed ? 'outputs set' : 'its outputs are already these'}: ${rows.join(', ') || 'the machine has no outputs'}`, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, ...(state != null ? { state } : { transition }), outputs: obj.outputs, kind: F.fsmKind(m),
          ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
  {
    name: 'set_fsm_look', title: 'Set a state\'s or a transition\'s look (state diagram)',
    description: 'Set the look of a state or transition of a state diagram (.fsm.json), as its editor\'s Look does; its HDL does not change. A state: fill, stroke, strokeWidth (0.5 to 10), color, fontSize (6 to 48), textStyle (regular, bold, italic, bold-italic), font (sans-serif, serif, monospace). A transition: stroke, strokeWidth, dash (solid, dashed, dotted), color, fontSize, textStyle, font. Colours #rrggbb or #rgb. Empty or null: the default. A value refused is not written, with the reason.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The state diagram: a .fsm.json file of the project.'),
      state: STR('The state, by its name (or give transition).'), transition: STR('The transition, by its id (as read_file shows it; or give state).'),
      look: { type: 'object', additionalProperties: { type: ['string', 'number', 'null'] }, description: '{ property: value }; empty or null: its default; properties not given stay.' },
    }, required: ['project', 'path', 'look'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, state, transition, look }) {
      await readProject(name);
      if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: not a state diagram (.fsm.json)`);
      if ((state == null) === (transition == null)) throw toolError('give either state (its name) or transition (its id)');
      if (!look || typeof look !== 'object' || Array.isArray(look)) throw toolError('look: an object { property: value }');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const F = await import('../core/fsm.js');
      const S = await import('../core/fsm-style.js');
      const { outputsWhere } = await import('../core/fsm-outputs.js');
      let m;
      try { m = F.normalizeFsm(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const obj = state != null ? m.states.find(s => s.name === state) : m.transitions.find(t => t.id === transition);
      if (!obj) throw toolError(state != null ? `no state '${state}' in ${rel}` : `no transition '${transition}' in ${rel}`);
      const kind = state != null ? 'state' : 'trans';
      const where = outputsWhere(m, { type: kind, id: obj.id });
      const r = S.setStyle(kind, obj.look, look);
      if (r.error) throw toolError(`${where}: ${r.error} (not applied)`);
      const changed = JSON.stringify(r.look) !== JSON.stringify(obj.look ?? null);
      if (r.look) obj.look = r.look; else delete obj.look;
      let sync = null;
      if (changed) {
        await P.writeFile(name, rel, JSON.stringify(m, null, 2));
        const { syncDrawing } = await import('./drawing-sync.js');
        sync = await syncDrawing(P, name, rel);
      }
      return { text: [`${where}: ${changed ? 'look set' : 'its look is already this'}: ${S.styleText(kind, r.look)}`, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, ...(state != null ? { state } : { transition }), look: r.look || {},
          ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
  {
    name: 'set_fsm_condition', title: 'Set a transition\'s condition (state diagram)',
    description: 'Set a transition\'s condition in a state diagram (.fsm.json), as its editor\'s Properties do: condition, a Boolean expression over the inputs (x, !x, x && y, x || !y, a == 2\'b01, b[0], and, or, not, a.b\', /a + b), empty: always; or otherwise: true, the state\'s Else box (also typed else, @else, others, default): taken when its other transitions are not, one per state; false empties it. The diagram is written, its HDL made again; Check\'s problems of the transition and its state are returned.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The state diagram: a .fsm.json file of the project.'),
      transition: STR('The transition, by its id (as read_file shows it).'),
      condition: STR('The condition (or give otherwise).'),
      otherwise: { type: 'boolean', description: 'true: the state\'s otherwise (else); false: an empty condition (or give condition).' },
    }, required: ['project', 'path', 'transition'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, transition, condition, otherwise }) {
      await readProject(name);
      if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: not a state diagram (.fsm.json)`);
      if ((condition == null) === (otherwise == null)) throw toolError('give either condition or otherwise');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const F = await import('../core/fsm.js');
      const { condAsText } = await import('../core/cond-notation.js');
      let m;
      try { m = F.normalizeFsm(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const t = m.transitions.find(x => x.id === transition);
      if (!t) throw toolError(`no transition '${transition}' in ${rel}`);
      const where = `Transition ${F.nameOf(m, t.from)} → ${F.nameOf(m, t.to)}`;
      const cond = otherwise != null ? (otherwise ? F.ELSE_COND : '') : condAsText(String(condition).trim());
      const changed = cond !== (t.cond ?? '');
      t.cond = cond;
      const shown = `${cond || '(empty: always)'}${F.isOtherwise(cond) && F.drawnAsElse(m, t) ? ` (the otherwise of ${F.nameOf(m, t.from)})` : ''}`;
      const problems = F.validateFsm(m).filter(d => d.severity !== 'info' && (d.transition === t.id || d.state === t.from))
        .map(d => `${d.severity.toUpperCase()}: ${d.message}`);
      let sync = null;
      if (changed) {
        await P.writeFile(name, rel, JSON.stringify(m, null, 2));
        const { syncDrawing } = await import('./drawing-sync.js');
        sync = await syncDrawing(P, name, rel);
      }
      return { text: [`${where}: ${changed ? 'condition set' : 'its condition is already this'}: ${shown}`, ...problems, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, transition, condition: cond, otherwise: F.isOtherwise(cond), problems,
          ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
