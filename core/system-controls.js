// Silinx - a System's controls (#5602, moved from server/mcp-system-sim.js for #5581's stimulus file): the MCP simulate's
// `controls` ([{ node, control, on | value, at_ns }]) resolved against the System's emulated boards (core/system-emu.js
// emulationBoards): an FPGA board's switch or button, a circuit's switch, button or sensor (#5322, #5342, #5456), an
// Explorer 16/32's button, R6 or TC1047A (#5484). Isomorphic module (browser + Node).
import { pinOf } from './system-emu.js';
import { partDef } from './circuit-parts.js';

/** The controls' steps, by time: [{ t (ps), b (the board), pin, on (its level or value) }], each set at t as its click does
 *  (core/system-emu.js setBoardInput); `end` the run's time (ps). Throws an Error naming the control that cannot be. */
export function controlSteps(boards, controls, end) {
  return (Array.isArray(controls) ? controls : []).map((c, i) => {
    const t = Number(c?.at_ns ?? 0) * 1e3;
    // (a circuit's switch or button: its part's id, a DIP switch's lever DIP1:2, #5322)
    const cb = boards.find(x => x.id === c?.node && x.kind === 'circuit');
    if (cb) {
      if (!cb.inputs.some(x => x.pin === String(c.control ?? ''))) throw new Error(`controls[${i}]: no switch or button '${c.control}' in the circuit ${cb.id} (${cb.inputs.map(x => x.pin).join(', ') || 'none'})`);
      if (!(t >= 0) || t > end) throw new Error(`controls[${i}]: at_ns from 0 to the run's time`);
      // (a temperature sensor's: its value, °C, #5342)
      if (cb.inputs.find(x => x.pin === String(c.control)).kind === 'temp') {
        if (!Number.isFinite(Number(c.value))) throw new Error(`controls[${i}]: ${c.control}'s value: a temperature (°C)`);
        return { t, b: cb, pin: String(c.control), on: Number(c.value) };
      }
      // (what a part senses: its value in its unit and range, an ultrasonic sensor's distance, #5456)
      const ci = cb.inputs.find(x => x.pin === String(c.control)), sense = ci.kind === 'sense' && partDef(cb.model.parts.find(p => p.id === ci.part).type).sense.find(x => x.prop === ci.prop);
      if (sense) {
        const v = Number(c.value);
        if (!Number.isFinite(v) || v < sense.min || v > sense.max) throw new Error(`controls[${i}]: ${c.control}'s value: ${sense.label.toLowerCase()} from ${sense.min} to ${sense.max}`);
        return { t, b: cb, pin: String(c.control), on: v };
      }
      return { t, b: cb, pin: String(c.control), on: !!c.on };
    }
    // (an Explorer 16/32's button, on; R6, a share of its travel, or the TC1047A, °C: a value, #5484)
    const eb = boards.find(x => x.id === c?.node && x.arch === 'pic24');
    if (eb) {
      const ei = eb.inputs.find(x => x.pin === String(c.control ?? ''));
      if (!ei) throw new Error(`controls[${i}]: no button, potentiometer nor temperature sensor '${c.control}' on ${eb.id}'s Explorer 16/32 (${eb.inputs.map(x => x.pin).join(', ')})`);
      if (!(t >= 0) || t > end) throw new Error(`controls[${i}]: at_ns from 0 to the run's time`);
      if (ei.kind === 'button') return { t, b: eb, pin: ei.pin, on: c.on ? 1 : 0 };
      const v = Number(c.value);
      if (!Number.isFinite(v) || v < ei.min || v > ei.max) throw new Error(`controls[${i}]: ${ei.pin}'s value: ${ei.kind === 'pot' ? 'its travel' : 'a temperature (°C)'} from ${ei.min} to ${ei.max}`);
      return { t, b: eb, pin: ei.pin, on: v };
    }
    const b = boards.find(x => x.id === c?.node && x.kind === 'fpga');
    if (!b) throw new Error(`controls[${i}]: no FPGA node '${c?.node}' with a board, a circuit nor an Explorer 16/32, in the System`);
    const m = /^([a-z_]+?)(\d+)$/i.exec(String(c.control ?? ''));
    const x = m && b.wiring.bits.find(y => y.res.name === m[1].toLowerCase() && y.idx === Number(m[2]));
    if (!x || !b.inputs.some(i2 => i2.pin === pinOf(x))) throw new Error(`controls[${i}]: no switch or button '${c.control}' of ${b.id}'s board linked to its module (${b.inputs.map(i2 => `${i2.res}${i2.idx}`).join(', ') || 'none'})`);
    if (!(t >= 0) || t > end) throw new Error(`controls[${i}]: at_ns from 0 to the run's time`);
    return { t, b, pin: pinOf(x), on: !!c.on };
  }).sort((a, b) => a.t - b.t);
}
