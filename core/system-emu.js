// Silinx - the System Emulator's core (#5212, docs/SYSTEMS.md, Emulation): a System's boards emulated
// together by the co-simulation scheduler (core/system-sim.js). An FPGA node's board is the Board Emulator's
// (core/emulate.js boardWiring: its module's ports on its board's pins, the node's `pins`): its switches and buttons
// the module's inputs that no link drives, its LEDs and displays the outputs, watched (compiled with the link's pins,
// their changes kept by the scheduler's watch) and shown as the Board Emulator shows them (boardOutputs: each LED's
// brightness, each digit's segments, over the window since the last). A microcontroller's board: its pins' levels and
// its LED L (D13 on an Arduino), the fraction of the window it was on. A circuit node (#5322): its circuit drawn as the
// Circuit editor draws it, its switches and buttons set (setBoardInput: a part's id, a DIP switch's lever `S1:3`), its
// lamps and its inputs as they are at the window's end.
//
//   const boards = emulationBoards(sys, inputs);              // inputs: core/system-run.js systemInputs'
//   const r = systemFromInputs(sys, withBoards(inputs, boards)); watchBoards(r.sim, boards);
//   r.sim.run(t1); const shown = boardStates(r.sim, boards, t0, t1, prev);
//
// Isomorphic ES module, no DOM.
import { boardWiring, boardOutputs } from './emulate.js';
import { resolveBoard } from './devices.js';
import { mcuBoard } from './system-doc.js';
import { partInputs } from './circuit-io.js';
import { partDef, sensePin } from './circuit-parts.js';

// a netlist's top's ports: [{ name, dir, width }]
function portsOf(netlist) {
  const ports = netlist?.json?.modules?.[netlist.top]?.ports || {};
  return Object.entries(ports).map(([name, p]) => ({ name, dir: p.direction === 'input' ? 'in' : p.direction === 'output' ? 'out' : 'inout', width: p.bits.length }));
}
// a port as boardWiring reads it (its bits by position, the last at the left)
const portOf = p => ({ name: p.name, dir: p.dir, sig: { t: { w: p.width, left: p.width - 1, right: 0, desc: true, kind: 'logic', scalar: p.width === 1 } } });
// a wiring bit's pin of the node (core/system-sim.js's names: 'tx', 'led[3]')
export const pinOf = b => (b.sig.t.w === 1 ? b.port : `${b.port}[${b.pos}]`);

/**
 * The System's boards to emulate: [{ id, kind: 'fpga', board, wiring, inputs: [{ pin, kind, res, idx }], outputs: [pin] }
 * | { id, kind: 'mcu', board, outputs: [pin], led } | { id, kind: 'circuit', model, inputs: [{ pin, part, index, kind }],
 * outputs: [] }] (`inputs`: systemInputs'; an FPGA node with no board: none). An FPGA board's inputs are its switches'
 * and buttons' pins that no link drives; its outputs, its LEDs' and displays'. A circuit's inputs are its parts'
 * (switches, buttons, a DIP switch's levers: `S1`, `DIP1:2`; its clocks tick themselves).
 */
export function emulationBoards(sys, inputs) {
  const out = [];
  const driven = new Set(inputs.plan.wires.map(w => w.to));
  for (const n of sys.nodes) {
    if (n.kind === 'circuit') {
      const c = inputs.plan.circuits?.find(x => x.id === n.id);
      if (!c) continue;
      const ins = c.model.parts.flatMap(p => partInputs(p).filter(x => x.kind !== 'clock').map((x, i, all) => ({ pin: all.length > 1 ? `${p.id}:${x.index + 1}` : p.id, part: p.id, index: x.index, kind: x.kind })));
      // (a temperature sensor's temperature, #5342: its id, a value in °C)
      for (const p of c.model.parts.filter(x => x.type === 'lm75')) ins.push({ pin: p.id, part: p.id, index: 0, kind: 'temp' });
      // (what a part senses, #5456: an ultrasonic sensor's distance, its id, a value in its unit)
      for (const p of c.model.parts) for (const x of partDef(p.type)?.sense ?? []) ins.push({ pin: sensePin(p, x), part: p.id, index: 0, kind: 'sense', prop: x.prop });
      out.push({ id: n.id, kind: 'circuit', model: c.model, inputs: ins, outputs: [] });
      continue;
    }
    if (n.kind === 'mcu') {
      const b = mcuBoard(n.board);
      // (an Arduino's; the Explorer 16/32's drawing is #5484's next part: its PIC24 runs, its board not shown)
      if (b?.arch === 'avr') out.push({ id: n.id, kind: 'mcu', board: b, outputs: b.pins.filter(p => !/^A[67]$/.test(p)), led: 'D13' });
      continue;
    }
    if (n.kind !== 'fpga' || !n.board || !inputs.netlists[n.id]) continue;
    const r = resolveBoard(n.board, { variant: n.variant });
    if (!r) continue;
    const assignments = Object.fromEntries(Object.entries(n.pins || {}).map(([k, loc]) => [k, { loc }]));
    const wiring = boardWiring({ ports: portsOf(inputs.netlists[n.id]).map(portOf), assignments, board: r });
    const ins = wiring.bits.filter(b => b.dir === 'in' && (b.kind === 'sw' || b.kind === 'btn') && !driven.has(`${n.id}.${pinOf(b)}`) && !driven.has(`${n.id}.${b.port}`));
    const outs = wiring.bits.filter(b => b.dir === 'out' && ['led', 'seg', 'dp', 'an'].includes(b.kind));
    out.push({ id: n.id, kind: 'fpga', board: r, wiring,
      inputs: ins.map(b => ({ pin: pinOf(b), kind: b.kind, res: b.res.name, idx: b.idx, activeLow: !!b.res.extra?.activeLow })),
      outputs: [...new Set(outs.map(pinOf))] });
  }
  return out;
}

/** The inputs with each FPGA board's outputs compiled watched too (systemFromInputs then builds them so). */
export function withBoards(inputs, boards) {
  const extra = new Map(boards.filter(b => b.kind === 'fpga').map(b => [b.id, b.outputs]));
  return { ...inputs, plan: { ...inputs.plan, fpga: inputs.plan.fpga.map(f => ({ ...f, pins: [...new Set([...f.pins, ...(extra.get(f.id) || [])])] })) } };
}

/** The boards' outputs watched by the scheduler, and each FPGA board's switches and buttons at their resting level. */
export function watchBoards(sim, boards) {
  for (const b of boards) {
    sim.watch(b.id, b.outputs);
    if (b.kind === 'fpga') for (const i of b.inputs) sim.nodes.get(b.id).setPin(i.pin, i.activeLow ? 1 : 0);
  }
}

// a watched pin's changes as a waveform (core/emulate.js's: { t, v: [{ v }] }), its value at t0 first
function waveOf(trace) {
  const t = [], v = [];
  for (let k = 0; k < trace.length; k += 2) { t.push(trace[k]); v.push(trace[k + 1] == null ? null : { v: BigInt(trace[k + 1]) }); }
  return { t, v };
}
// the time in [t0, t1] a watched pin was at 1
function onTime(trace, t0, t1) {
  let total = 0;
  for (let k = 0; k < trace.length; k += 2) {
    const a = Math.max(trace[k], t0), b = Math.min(k + 2 < trace.length ? trace[k + 2] : t1, t1);
    if (trace[k + 1] === 1 && b > a) total += b - a;
  }
  return total;
}

/**
 * What each board shows over the window [t0, t1] (ps): { id: { leds, digits } (an FPGA board's, boardOutputs') |
 * { pins: { pin: 0|1|null }, led } (a microcontroller's: its LED's brightness) }; `prev`, the last window's (a digit's
 * persistence). The watched traces are then cut to their value at t1.
 */
export function boardStates(sim, boards, t0, t1, prev = {}) {
  const out = {};
  for (const b of boards) {
    const trace = p => sim.watched.get(`${b.id}.${p}`);
    if (b.kind === 'circuit') {
      // (its lamps and its inputs now, #5322)
      const node = sim.nodes.get(b.id);
      out[b.id] = { leds: node.sim.leds(), lcds: node.sim.lcds(), oleds: node.sim.oleds(), sensors: node.sim.sensors(), servos: node.sim.servos(), buzzers: node.sim.buzzers(), steppers: node.sim.steppers(), sds: node.sim.sds(), sonars: node.sim.sonars(), pirs: node.sim.pirs(), dhts: node.sim.dhts(), inputs: node.sim.inputs(), lit: Object.entries(node.sim.outputs()).filter(([, v]) => v === '1').map(([k]) => k) };
      continue;
    }
    if (b.kind === 'fpga') {
      // (each bit its own waveform: the wiring's bits as boardOutputs reads them, at position 0 of theirs)
      const bits = b.wiring.bits.map(x => (b.outputs.includes(pinOf(x)) ? { ...x, pos: 0, sig: { wave: waveOf(trace(pinOf(x))) } } : x));
      out[b.id] = boardOutputs({ ...b.wiring, bits }, t0, t1, prev[b.id] || null);
    } else {
      const span = t1 - t0;
      out[b.id] = { pins: Object.fromEntries(b.outputs.map(p => [p, trace(p).at(-1)])), led: span > 0 ? onTime(trace(b.led), t0, t1) / span : trace(b.led).at(-1) ?? 0 };
    }
    for (const p of b.outputs) { const tr = trace(p), v = tr.at(-1); tr.length = 0; tr.push(t1, v); }
  }
  return out;
}

/** An FPGA board's switch or button set (`value`: on 1, off 0; its pin at the level its board gives it); a circuit's
 *  switch or button (its part's id; a DIP switch's lever, `DIP1:2`). */
export function setBoardInput(sim, board, pin, value) {
  if (board.kind === 'circuit') {
    const c = board.inputs.find(x => x.pin === pin);
    if (!c) throw new Error(`'${pin}' is not a switch or a button of the circuit ${board.id}`);
    if (c.kind === 'temp') sim.nodes.get(board.id).setTemp(c.part, Number(value));   // (°C, #5342)
    else if (c.kind === 'sense') sim.nodes.get(board.id).setSensed(c.part, c.prop, Number(value));   // (#5456)
    else sim.nodes.get(board.id).setInput(c.part, value, c.index);
    return;
  }
  const i = board.inputs.find(x => x.pin === pin);
  if (!i) throw new Error(`'${pin}' is not a switch or a button of ${board.id}'s board`);
  sim.nodes.get(board.id).setPin(pin, (value ? 1 : 0) ^ (i.activeLow ? 1 : 0));
}
