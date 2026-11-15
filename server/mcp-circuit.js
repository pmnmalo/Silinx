// The MCP server's tools of a digital circuit (server/mcp.js, #2674, #3897, docs/CIRCUITS.md): circuit_parts (the parts'
// library: each part's pins, its logic and its delay, core/circuit-parts.js) and edit_circuit (parts added, moved,
// turned, deleted, wired, their properties set, as the editor does: core/circuit-edit.js, the same checks and messages);
// the circuit written as its editor saves it, its HDL file made again, its check's messages returned. Its Check is
// check_drawing's, its simulation simulate_drawing's (server/mcp-simulate-circuit.js).
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

const POINT = { description: 'A place: a grid point [x, y] (0.1 inch steps), a breadboard\'s hole (BB1.f10, BB1.tp3) or a part\'s pin (U1.3, S1.out, D1.A).' };
const OPS = ['add', 'move', 'rotate', 'copy', 'delete', 'wire', 'set', 'wires'];

/** One operation applied: { model, line } or { error }. */
async function apply(E, m, op) {
  switch (op?.op) {
    case 'add': { const r = E.addPart(m, op); return r.error ? r : { model: r.model, line: `${r.id} (${op.type}) added` }; }
    // (a breadboard with the parts on it; the wires' ends with the part unless keep is false, as the editor's Keep connections, #4059)
    case 'move': { const r = E.movePart(m, op.id, op.at, { keep: op.keep !== false }); return r.error ? r : { model: r.model, line: `${op.id} moved` }; }
    case 'rotate': { const r = E.rotatePart(m, op.id, op.by ?? 1, { keep: op.keep !== false }); return r.error ? r : { model: r.model, line: `${op.id} turned` }; }
    // (the editor's Copy and Paste, #4066)
    case 'copy': {
      const clip = E.copyParts(m, op.id);
      if (clip.error) return clip;
      const r = E.pasteParts(m, clip, op.by ?? [2, 2]);
      return r.error ? r : { model: r.model, line: `${op.id} copied: ${r.ids.join(', ')}` };
    }
    case 'delete': { const r = E.deleteItem(m, op.id); return r.error ? r : { model: r.model, line: `${op.id} deleted` }; }
    case 'wire': { const r = E.addWire(m, op); return r.error ? r : { model: r.model, line: `${r.id} wired from ${JSON.stringify(op.from)} to ${JSON.stringify(op.to)}` }; }
    case 'set': {
      const props = Object.fromEntries(['label', 'color', 'on', 'hz'].filter((k) => k in op).map((k) => [k, op[k]]));
      const r = E.setPartProps(m, op.id, props);
      return r.error ? r : { model: r.model, line: `${op.id}: ${Object.entries(props).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}` };
    }
    // (the editor's ⋮ Curved wires, #4064)
    case 'wires': { const r = E.setWireStyle(m, op.style); return r.error ? r : { model: r.model, line: `the wires drawn ${op.style}` }; }
    default: return { error: `op: one of ${OPS.join(', ')}` };
  }
}

export const CIRCUIT_TOOLS = [
  {
    name: 'circuit_parts', title: 'The parts of a digital circuit',
    description: 'The library of a circuit\'s parts (.circ.json, docs/CIRCUITS.md): each part\'s type, title, kind (breadboard, supply, input, pull, output, probe, ic), its pins (number, name, direction: in, out, vcc, gnd, pass, weak, probe, oc, nc; their place dx, dy from its pin 1 in 0.1 inch grid steps, unturned), an IC\'s chip, its gates and its typical delay (ns). Given one part\'s type: its details too (info: what it does, an IC\'s family, package, supply pins, logic, delay, open-collector outputs, how an input left open reads; each pin\'s role), as the editor\'s Part info. A breadboard\'s holes: a1 to j30 (a full one\'s to j63; a–e one strip per column, f–j another), its rails tp, tn (top +, −), bn, bp (bottom −, +), 1 to 30 (a full one\'s to 63, split after 31).',
    inputSchema: { type: 'object', properties: { type: STR('One part\'s type (7400, led…); default: every part.') }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ type } = {}) {
      const { partsList } = await import('../core/circuit-parts.js');
      const all = partsList();
      const list = type == null ? all : all.filter((p) => p.type === String(type));
      if (!list.length) throw toolError(`no part '${type}' (the parts: ${all.map((p) => p.type).join(', ')})`);
      const text = list.map((p) => `${p.type}: ${p.title}${p.chip ? ` (${p.chip}, ${p.tpd} ns)` : ''}${p.pins.length ? `; pins ${p.pins.map((q) => `${q.n} ${q.name} ${q.dir}`).join(', ')}` : ''}${p.gates ? `; gates ${p.gates.join('; ')}` : ''}`);
      if (type == null) return { text: text.join('\n'), data: { parts: list } };
      // (one part: its details too, as the editor's Part info, #4126)
      const info = (await import('../core/circuit-part-info.js')).partInfo(String(type));
      const lines = [info.about, info.chip && `Chip ${info.chip}, ${info.family}, ${info.package}; supply ${info.power}`, ...(info.logic || []),
        info.delay && `Typical delay ${info.delay} ns`, info.openCollector && 'Outputs: open collector', info.openInput && `An input left open reads ${info.openInput}`,
        `Pins: ${info.pins.map((q) => `${q.n} ${q.name} (${q.role})`).join(', ')}`].filter(Boolean);
      return { text: [text[0], ...lines].join('\n'), data: { parts: list, info } };
    },
  },
  {
    name: 'edit_circuit', title: 'Edit a digital circuit',
    description: 'Edit a circuit (.circ.json) as its editor does, by a list of operations applied in order (one refused: nothing written, the reason given): { op: "add", type, at, rot (quarter turns clockwise), label, id } (a part, its pin 1 at the place; a breadboard: its hole a1), { op: "move", id, at, keep }, { op: "rotate", id, by, keep } (a breadboard with the parts plugged into it; the wires\' ends on the part\'s pins and holes follow it unless keep is false), { op: "copy", id, by: [dx, dy] } (the part, a breadboard with its parts and the wires between them, copied by dx, dy grid steps, default [2, 2], new ids), { op: "delete", id } (a part or a wire; a part\'s wires stay), { op: "wires", style: "curved" | "straight" } (how the wires are drawn: smooth curves through their bends, as the editor\'s Curved wires; the connections the same), { op: "wire", from, to, via: [[x, y]…], color, id } (a wire between two places; its ends join the holes, pins and wire ends on their points), { op: "set", id, label, color, on, hz } (a switch\'s, a button\'s, a clock\'s, an LED\'s or a display\'s label is its ports\' name, <label>_<k> for each of several: a DIP switch\'s levers, a display\'s segments a–g and dp, an LED bar\'s 1–10; a single port\'s label name[k] its bit k of the vector port name, as a board\'s led[0], sw[0], btn[0] for an FPGA project\'s top, its bits 0 to the last; an LED\'s or a display\'s colour; a switch\'s position as saved, a DIP switch\'s a list or { lever, on }; a clock\'s frequency in Hz, its live rate). A place: a grid point [x, y], a hole (BB1.f10) or a pin (U1.3). The circuit is written, its HDL file made again, and its check\'s errors and warnings returned. The parts: circuit_parts.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The circuit: a .circ.json file of the project.'),
      operations: { type: 'array', maxItems: 200, items: { type: 'object', properties: { op: { type: 'string', enum: OPS }, at: POINT, from: POINT, to: POINT } }, description: 'The operations, in order.' },
    }, required: ['project', 'path', 'operations'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, path: rel, operations }) {
      await readProject(name);
      if (!/\.circ\.json$/i.test(rel)) throw toolError(`${rel}: not a circuit (.circ.json)`);
      if (!Array.isArray(operations) || !operations.length) throw toolError('operations: a list of { op, … }');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const C = await import('../core/circuit.js');
      const E = await import('../core/circuit-edit.js');
      let m;
      try { m = C.normalizeCircuit(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const lines = [];
      for (const [k, op] of operations.entries()) {
        const r = await apply(E, m, op);
        if (r.error) throw toolError(`operation ${k} (${op?.op ?? '?'}): ${r.error} (nothing written)`);
        m = r.model;
        lines.push(r.line);
      }
      await P.writeFile(name, rel, JSON.stringify(m, null, 2));
      const { syncDrawing } = await import('./drawing-sync.js');
      const sync = await syncDrawing(P, name, rel);
      const { checkDrawing } = await import('./mcp-check.js');
      const check = await checkDrawing(rel, m);
      return { text: [...lines, ...check.lines, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, parts: m.parts.length, wires: m.wires.length, errors: check.errors, warnings: check.warnings, ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
