// The MCP server's tools of a digital circuit (server/mcp.js, #2674, #3897, docs/CIRCUITS.md): circuit_parts (the parts'
// library: each part's pins, its logic and its delay, core/circuit-parts.js) and edit_circuit (parts added, moved,
// turned, deleted, wired, their properties set, as the editor does: core/circuit-edit.js, the same checks and messages);
// the circuit written as its editor saves it, its HDL file made again, its check's messages returned. Its Check is
// check_drawing's, its simulation simulate_drawing's (server/mcp-simulate-circuit.js). A project's KiCad parts (#4280,
// core/circuit-kicad.js): import_part (server/mcp-kicad.js), and circuit_parts and edit_circuit with them.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

const POINT = { description: 'A place: a grid point [x, y] (0.1 inch steps), a breadboard\'s hole (BB1.f10, BB1.tp3) or a part\'s pin (U1.3, S1.out, D1.A).' };
const OPS = ['add', 'move', 'rotate', 'copy', 'delete', 'wire', 'reconnect', 'reshape', 'set', 'wires'];

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
    // (in the circuit's style, as the editor draws it, #4083: routed when orthogonal, its route said)
    case 'wire': {
      const r = (await import('../core/circuit-route.js')).addStyledWire(m, op);
      if (r.error) return r;
      const w = r.model.wires.find((x) => x.id === r.id);
      return { model: r.model, line: `${r.id} wired from ${JSON.stringify(op.from)} to ${JSON.stringify(op.to)}${m.wireStyle === 'orthogonal' ? `, routed ${JSON.stringify(w.points)}` : ''}${r.warning ? ` (WARNING: ${r.warning})` : ''}` };
    }
    // (the editor's wire handles, #4930, #4931: an end dragged to another place, the bends set)
    case 'reconnect': {
      const r = (await import('../core/circuit-wire-edit.js')).moveWireEnd(m, op.id, op.end, op.at);
      return r.error ? r : { model: r.model, line: `${op.id}'s ${op.end} reconnected to ${JSON.stringify(op.at)}` };
    }
    case 'reshape': {
      const r = (await import('../core/circuit-wire-edit.js')).setWireBends(m, op.id, op.via);
      return r.error ? r : { model: r.model, line: `${op.id} reshaped: ${JSON.stringify(r.model.wires.find((w) => w.id.toLowerCase() === String(op.id).toLowerCase()).points)}` };
    }
    case 'set': {
      const props = Object.fromEntries(['label', 'color', 'on', 'hz', 'temp', 'hum', 'cm', 'hold', 'retrigger', 'ohms', 'farads', 'pos', 'lux'].filter((k) => k in op).map((k) => [k, op[k]]));
      const r = E.setProps(m, op.id, props);   // (a part's, or a wire's colour, #4121)
      return r.error ? r : { model: r.model, line: `${op.id}: ${Object.entries(props).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}` };
    }
    // (the editor's ⋮ Wires, #4064, #4080)
    case 'wires': { const r = E.setWireStyle(m, op.style); return r.error ? r : { model: r.model, line: `the wires drawn ${op.style}` }; }
    default: return { error: `op: one of ${OPS.join(', ')}` };
  }
}

// the parts `query` finds (#4495): every word of it in a part's type, title, chip or function, or the function's
// Portuguese (a KiCad part's by the vocabulary); its case and accents aside
async function findParts(all, query) {
  const { foldText, functionPt } = await import('../core/part-function.js');
  const words = foldText(query).split(/\s+/).filter(Boolean);
  return all.filter((p) => {
    const text = foldText(`${p.type} ${p.title} ${p.chip ?? ''} ${p.kicad?.value ?? ''} ${p.function ?? ''} ${p.kicad && p.function ? functionPt(p.function) ?? '' : ''}`);
    return words.every((w) => text.includes(w));
  });
}

export const CIRCUIT_TOOLS = [
  {
    name: 'circuit_parts', title: 'The parts of a digital circuit',
    description: 'The library of a circuit\'s parts (.circ.json): each part\'s type, title, kind (breadboard, supply, input, pull, output, probe, ic), its pins (number, name, direction, place dx, dy from pin 1 in 0.1 inch steps, unturned), an IC\'s chip, gates and typical delay (ns); a KiCad part\'s function. query: the parts found by their words. One part\'s type: its details too (info: what it does, family, package, supply pins, logic, delay, open-collector outputs, open inputs, each pin\'s role), as the editor\'s Part info. A breadboard\'s holes: a1 to j30 (a full one\'s to j63; a–e one strip per column, f–j another), its rails tp, tn, bn, bp 1 to 30 (to 63).',
    inputSchema: { type: 'object', properties: { type: STR('One part\'s type (7400, led…, a project\'s KiCad part parts/<library>.kicad_sym#<symbol>); default: every part.'),
      project: STR('A project whose own KiCad parts (its parts/ folder, import_part) are listed too, after the library\'s; default: the library\'s only.'),
      query: STR('Words to find in the parts\' types, titles, chips and functions (English or Portuguese: inverter, flip-flop, monoestável), as the Parts panel\'s search; default: every part.') }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ type, project: name, query } = {}) {
      const { partsList, setProjectParts } = await import('../core/circuit-parts.js');
      let kicad = null;
      if (name != null) { await readProject(name); kicad = await (await import('../core/circuit-kicad.js')).useProjectParts(P, name); } else setProjectParts([]);
      const all = partsList();
      if (type != null && query != null) throw toolError('query: not with type');
      const list = type != null ? all.filter((p) => p.type === String(type)) : query != null ? await findParts(all, query) : all;
      if (!list.length && query != null) return { text: `No part matches '${query}'.`, data: { parts: [] } };
      if (!list.length) throw toolError(`no part '${type}' (the parts: ${all.map((p) => p.type).join(', ')})`);
      const as = (p) => (!p.kicad ? '' : p.behavesAs ? ` [KiCad ${p.kicad.value}, as the ${p.behavesAs}]` : ` [KiCad ${p.kicad.value}, drawn only]`);
      // (a KiCad part: what it is, #4495, when its title does not say it)
      const fn = (p) => (p.kicad && p.function && p.function.toLowerCase() !== p.title.toLowerCase() ? ` — ${p.function}` : '');
      const text = list.map((p) => `${p.type}: ${p.title}${fn(p)}${as(p)}${p.chip ? ` (${p.chip}, ${p.tpd} ns)` : ''}${p.pins.length ? `; pins ${p.pins.map((q) => `${q.n} ${q.name} ${q.dir}`).join(', ')}` : ''}${p.gates ? `; gates ${p.gates.join('; ')}` : ''}`);
      // (a project's symbols that are no part, and its libraries not read)
      const more = kicad && type == null ? [...kicad.skipped.map((x) => `${x.type}: not a part: ${x.reason}`), ...kicad.notes.map((x) => `WARNING: ${x}`), ...kicad.errors.map((x) => `ERROR: ${x}`)] : [];
      const extra = kicad ? { project: name, skipped: kicad.skipped, notes: kicad.notes, errors: kicad.errors } : {};
      const untrusted = kicad?.defs.length || more.length ? 'the project\'s KiCad parts: their names and texts' : undefined;
      if (type == null) return { text: [...text, ...more].join('\n'), data: { parts: list, ...extra }, untrusted };
      // (one part: its details too, as the editor's Part info, #4126)
      const info = (await import('../core/circuit-part-info.js')).partInfo(String(type));
      const k = info.kicad, src = k && [k.source && `from ${k.source}`, k.author && `by ${k.author}`, k.licence && `licence ${k.licence}`].filter(Boolean).join(', ');
      const lines = [info.about, k && `KiCad symbol ${k.symbol} of ${k.library}${k.datasheet ? `; datasheet ${k.datasheet}` : ''}${src ? `; ${src}` : ''}`, info.chip && `Chip ${info.chip}, ${info.family}, ${info.package}; supply ${info.power}`, ...(info.logic || []),
        info.delay && `Typical delay ${info.delay} ns`, info.openCollector && 'Outputs: open collector', info.openInput && `An input left open reads ${info.openInput}`,
        `Pins: ${info.pins.map((q) => `${q.n} ${q.name} (${q.role})`).join(', ')}`].filter(Boolean);
      return { text: [text[0], ...lines].join('\n'), data: { parts: list, info, ...extra }, untrusted };
    },
  },
  {
    name: 'edit_circuit', title: 'Edit a digital circuit',
    description: 'Edit a circuit (.circ.json) as its editor does, operations in order (one refused: nothing written): add { type, at, rot, label, id } (pin 1 at the place; a breadboard: hole a1); move { id, at, keep }; rotate { id, by, keep } (wire ends follow unless keep is false); copy { id, by }; delete { id } (a part\'s wires stay); wires { style: direct | orthogonal | curved }; wire { from, to, via, color, id }; reconnect { id, end, at } (a wire\'s end moved); reshape { id, via } (its bends); set { id, label, color, on, hz, temp, hum, cm, hold, retrigger, ohms, farads, pos, lux } (ohms, farads as "4k7"). Written, its HDL made again, its check\'s errors and warnings returned. The parts: circuit_parts.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The circuit: a .circ.json file of the project.'),
      operations: { type: 'array', maxItems: 200, items: { type: 'object', properties: { op: { type: 'string', enum: OPS }, at: POINT, from: POINT, to: POINT } }, description: 'rot, rotate\'s by: quarter turns clockwise; copy\'s by: [dx, dy]; set: a switch\'s on (a DIP\'s a list or { lever, on }), a clock\'s hz, a colour (red, black, blue, green, yellow, orange, white, purple; a wire\'s default red to VCC, black to GND, or blue).' },
    }, required: ['project', 'path', 'operations'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, path: rel, operations }) {
      await readProject(name);
      if (!/\.circ\.json$/i.test(rel)) throw toolError(`${rel}: not a circuit (.circ.json)`);
      if (!Array.isArray(operations) || !operations.length) throw toolError('operations: a list of { op, … }');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const C = await import('../core/circuit.js');
      const E = await import('../core/circuit-edit.js');
      await (await import('../core/circuit-kicad.js')).useProjectParts(P, name);   // (its KiCad parts, #4280)
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
      const check = await checkDrawing(rel, m, await (await import('./drawing-sync.js')).projectHdl(P, name));
      return { text: [...lines, ...check.lines, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, parts: m.parts.length, wires: m.wires.length, errors: check.errors, warnings: check.warnings, ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
