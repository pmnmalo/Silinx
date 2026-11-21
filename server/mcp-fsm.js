// The MCP server's tool of a state diagram's outputs (server/mcp.js, #2674): a state's or a transition's outputs set
// as its editor's Properties set them (#3814, web/js/fsm-side.js): a value per output of the machine, checked by the
// same function (core/fsm-outputs.js setOutputValues: an output the machine has, a constant that fits in its width),
// an empty one cleared (its default); the diagram written as its editor saves it and its HDL file made again.
// set_fsm_look: a state's or a transition's look (#3883) as its Properties' Look sets it (core/fsm-style.js setStyle:
// the same checks and messages); the HDL made from the diagram does not change. set_fsm_encoding: the state encoding
// and the states' codes of the user's (#4908), as the machine's and a state's Properties set them (core/fsm-codes.js).
// edit_fsm (#4974): a transition's next state, a transition added or removed, a state added or renamed, as the editor's
// transition table does them (core/fsm-edit.js).
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
  {
    name: 'set_fsm_encoding', title: 'Set the state encoding and the states\' codes (state diagram)',
    description: 'Set the state encoding of a state diagram (.fsm.json), as its machine\'s Properties do: binary, gray, onehot, enum (the synthesis tool\'s codes) or user (each state\'s code given: the states with none get the one they had); and the codes of states (codes: { state name: binary digits }, as a state\'s Properties\' Code: a code given makes the encoding user, the other states keeping the codes they had; an empty one clears it). The codes must be binary digits, all as wide, none twice (Check\'s errors otherwise, returned; the diagram written as the interface writes it). The diagram is written and its HDL file made again.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The state diagram: a .fsm.json file of the project.'),
      encoding: { type: 'string', enum: ['binary', 'gray', 'onehot', 'enum', 'user'], description: 'The encoding (or give codes, or both).' },
      codes: { type: 'object', additionalProperties: { type: 'string' }, description: 'States\' codes: { state name: binary digits } (the encoding made user).' },
    }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, encoding, codes }) {
      await readProject(name);
      if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: not a state diagram (.fsm.json)`);
      if (encoding == null && codes == null) throw toolError('give encoding, codes or both');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const F = await import('../core/fsm.js');
      let m;
      try { m = F.normalizeFsm(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      for (const k of Object.keys(codes || {})) if (!m.states.some(s => s.name === k)) throw toolError(`no state '${k}' in ${rel}`);
      const before = JSON.stringify(m);
      const bitsOf = (id) => F.fsmEncoding(m).find(e => e.id === id)?.bits;
      if (encoding != null) F.setEncoding(m, encoding, bitsOf);
      for (const [k, v] of Object.entries(codes || {})) F.setStateCode(m, m.states.find(s => s.name === k).id, String(v ?? ''), bitsOf);
      const changed = JSON.stringify(m) !== before;
      const enc = F.fsmEncoding(m);
      const shown = m.encoding === 'enum' ? '' : `: ${enc.map(e => `${e.name} = ${e.shown}`).join(', ')}`;   // (the user's as typed, #5026)
      const problems = F.validateFsm(m).filter(d => d.severity === 'error').map(d => `ERROR: ${d.message}`);
      let sync = null;
      if (changed) {
        await P.writeFile(name, rel, JSON.stringify(m, null, 2));
        const { syncDrawing } = await import('./drawing-sync.js');
        sync = await syncDrawing(P, name, rel);
      }
      return { text: [`${changed ? 'Encoding set' : 'The encoding is already this'}: ${m.encoding}${shown}`, ...problems, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, encoding: m.encoding, codes: Object.fromEntries(enc.map(e => [e.name, m.encoding === 'enum' ? null : e.shown])), problems,
          ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
  {
    name: 'edit_fsm', title: 'Edit a state diagram as its transition table does (state diagram)',
    description: 'Edit a state diagram (.fsm.json) as its editor\'s transition table (the Tables panel) and the diagram do (core/fsm-edit.js): next_state (a transition\'s next state: transition, to; or a state\'s otherwise row given one: state, to), add_transition (from state to to, default itself, with condition, empty: always; before the else or right after transition after), remove_transition, add_state (name, empty: S<n>), rename_state (state, name). A name used twice, a state or transition not there: refused, nothing written. Conditions: set_fsm_condition; outputs: set_fsm_outputs. The diagram is written, its HDL made again; its Check\'s errors and warnings returned.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The state diagram: a .fsm.json file of the project.'),
      action: { type: 'string', enum: ['next_state', 'add_transition', 'remove_transition', 'add_state', 'rename_state'], description: 'What to do.' },
      transition: STR('A transition, by its id (as read_file shows it): next_state, remove_transition.'),
      state: STR('A state, by its name: next_state (its otherwise), add_transition (its source), rename_state.'),
      to: STR('A state, by its name: next_state, add_transition (the target; default: state).'),
      condition: STR('add_transition: the new transition\'s condition (empty: always).'),
      after: STR('add_transition: the transition (an id) the new one is tried right after.'),
      name: STR('add_state, rename_state: the state\'s (new) name.'),
    }, required: ['project', 'path', 'action'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    async run({ project: name, path: rel, action, transition, state, to, condition, after, name: newName }) {
      await readProject(name);
      if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: not a state diagram (.fsm.json)`);
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const F = await import('../core/fsm.js');
      const X = await import('../core/fsm-edit.js');
      let m;
      try { m = F.normalizeFsm(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const need = (v, what) => { if (v == null || v === '') throw toolError(`${action}: give ${what}`); return v; };
      const st = (n) => { const s = X.stateNamed(m, n); if (!s) throw toolError(`no state '${n}' in ${rel}`); return s.id; };
      const tr = (id) => { if (!m.transitions.some((t) => t.id === id)) throw toolError(`no transition '${id}' in ${rel}`); return id; };
      const before = JSON.stringify(m);
      let r;
      if (action === 'next_state') {
        if ((transition == null) === (state == null)) throw toolError('next_state: give either transition (its id) or state (its otherwise)');
        r = transition != null ? X.setNextState(m, tr(transition), st(need(to, 'to'))) : X.setStayNext(m, st(state), st(need(to, 'to')));
      } else if (action === 'add_transition') {
        const from = st(need(state, 'state'));
        r = X.addTransition(m, from, to != null ? st(to) : from, condition ?? '', after != null ? tr(after) : null);
      } else if (action === 'remove_transition') r = X.removeTransition(m, tr(need(transition, 'transition')));
      else if (action === 'add_state') r = X.addState(m, newName ?? '');
      else if (action === 'rename_state') r = X.renameState(m, st(need(state, 'state')), need(newName, 'name'));
      else throw toolError(`action: one of next_state, add_transition, remove_transition, add_state, rename_state`);
      if (r.error) throw toolError(`${r.error} (not applied)`);
      m = F.normalizeFsm(m);
      const changed = JSON.stringify(m) !== before;
      // (the machine's: a next state changed may leave another state unreachable)
      const problems = F.validateFsm(m).filter((d) => d.severity !== 'info')
        .map((d) => `${d.severity.toUpperCase()}: ${d.message}`);
      let sync = null;
      if (changed) {
        await P.writeFile(name, rel, JSON.stringify(m, null, 2));
        const { syncDrawing } = await import('./drawing-sync.js');
        sync = await syncDrawing(P, name, rel);
      }
      return { text: [r.message, ...problems, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, action, ...(r.id ? { id: r.id } : {}), changed, problems,
          ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
