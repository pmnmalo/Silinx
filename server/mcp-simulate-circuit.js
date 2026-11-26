// The MCP server's simulate_drawing of a digital circuit (server/mcp-simulate-drawing.js, #3897, docs/CIRCUITS.md), as
// its editor's Try it runs it (core/circuit-sim.js): from time 0, its switches as saved and its buttons released;
// per step, its inputs set by their ports' names (a switch, a button, a DIP switch's lever <label>_<k>, a clock's level:
// one not given keeps its place, as on the bench), then the circuit run until it is quiet (at most 1 µs); the lamps (an
// LED, a display's segments, an LED bar's lights: their ports), the logic probes' levels, the time, the shorts and an
// oscillation, as the console says.
import { toolError } from './mcp-util.js';

/** The steps of a circuit `m` (its JSON) simulated: { lines, rows, warnings }; `hdl`: the project's { modules, runner }
 *  (core/drawing-sync.js projectHdl), its KiCad parts modelled by a module run live (#4284). */
export async function simulateCircuitFile(m0, steps, base, hdl = {}, { ngspice = false } = {}) {
  const { normalizeCircuit, circuitPorts } = await import('../core/circuit.js');
  const { checkCircuit } = await import('../core/circuit-check.js');
  const { createCircuitSim, runMessages } = await import('../core/circuit-sim.js');
  const m = normalizeCircuit(m0);
  const checked = checkCircuit(m, undefined, hdl), errs = checked.filter((d) => d.severity === 'error');
  if (errs.length) throw toolError([...errs.map((d) => `ERROR: ${d.message}`), 'Correct the errors of the circuit to simulate it.'].join('\n'));
  if (!Array.isArray(steps) || !steps.length) throw toolError('cycles: one object per step, its switches and buttons by their labels, e.g. [{ "a": 1 }, { "a": 0, "b": 1 }]');
  const { inputs } = circuitPorts(m);
  const at = (i) => { const v = sim.inputs()[i.part]; return (Array.isArray(v) ? v[i.index] : v) ? 1 : 0; };
  const byName = new Map(inputs.map((x) => [x.name.toLowerCase(), x]));
  // (its oscilloscopes recording it, #5383: each step their measurements over their screen, from its trigger)
  const { createScopeRecorder } = await import('../core/circuit-scope.js');
  const { measureText } = await import('../core/scope.js');
  const rec = createScopeRecorder(m);
  let sim = null;
  sim = createCircuitSim(m, { runner: hdl.runner ?? null, onUpdate: (t) => sim && rec.sample(sim, t) });
  rec.sample(sim, sim.time);
  // (its analog side recorded from time 0 for ngspice, #5386)
  if (ngspice) { if (!sim.analog) throw toolError('ngspice: the circuit has no analog part (a resistor, a capacitor, an LED…): nothing for it to simulate'); sim.recordSpice(); }
  const scopeData = () => Object.fromEntries(rec.scopes.map((s) => { const sc = rec.screen(s.id, s.part, sim.time * 1e-9); return [s.id, sc.m.map((x, k) => (x && sc.ch[k].on ? x : null))]; }));
  const scopeText = () => Object.entries(scopeData()).map(([id, ms]) => ms.map((x, k) => { if (!x) return ''; const t = measureText(x); return `; ${id} CH${k + 1} f ${t.frequency}, T ${t.period}, D ${t.duty}, Vpp ${t.vpp}, Vavg ${t.mean}`; }).join('')).join('');
  const leds = () => sim.outputs();
  // (a modelled part whose module cannot run live: said, its pins driving nothing, #4284)
  const notLive = checked.filter((d) => d.severity === 'warning' && /cannot run in Try it/.test(d.message)).map((d) => d.message);
  const lines = [`${base} from time 0, ${steps.length} step(s):`, ...notLive.map((w) => `WARNING: ${w}`)], rows = [], warnings = [...notLive];
  const first = sim.run();
  // (a device's own warnings too, once each, as Try it's console says them: a servo's pulses, a stepper's stalls, #5476)
  let said = 0;
  const note = (r) => { const dev = sim.servoWarnings(), w = [...runMessages(sim, r), ...dev.slice(said).map((x) => `WARNING: ${x}`)]; said = dev.length; warnings.push(...w); return w; };
  // (the logic probes' levels, by label or id: 0, 1, Z open, X; said when the circuit has any, #3900)
  const probeName = new Map(m.parts.filter((p) => p.type === 'probe').map((p) => [p.id, p.label || p.id]));
  const probes = () => Object.fromEntries(Object.entries(sim.probes()).map(([id, v]) => [probeName.get(id), v]));
  const probeText = () => (probeName.size ? `; probes ${Object.entries(probes()).map(([k, v]) => `${k}=${v}`).join(' ')}` : '') + lcdText() + oledText() + sensorText() + servoText() + encoderText() + buzzerText() + stepperText() + sdText() + sonarText() + pirText() + dhtText() + analogText() + scopeText();
  // (an analog circuit, #5382: each voltmeter's reading, each LED's current, an LDR's or a thermistor's resistance now)
  const { formatSi } = await import('../core/circuit-analog-parts.js');
  const mA = (v) => (Array.isArray(v) ? v.map(mA) : Math.round(v * 100) / 100);
  const meters = () => Object.fromEntries(Object.entries(sim.meters()).map(([id, v]) => [id, Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null]));
  const analogText = () => Object.entries(meters()).map(([id, v]) => `; ${id} ${v == null ? 'no reading' : formatSi(v, 'V')}`).join('')
    + (sim.analog ? Object.entries(sim.lampCurrents()).map(([id, v]) => `; ${id} ${[v].flat().map((x) => `${mA(x)} mA`).join(' ')}`).join('') : '');
  // (an ultrasonic sensor, #5456: its distance set by its id, cm; a step's after_us, the time let pass before its inputs
  // are set, its echo meanwhile)
  // (a part that senses more than one, #5470: each by <id>.<prop>, a DHT's DHT1.temp and DHT1.hum)
  const { partDef, sensePin } = await import('../core/circuit-parts.js');
  const sensing = new Map(m.parts.flatMap((p) => (partDef(p.type)?.sense ?? []).map((x) => [sensePin(p, x).toLowerCase(), { p, x }])));
  // (a temperature and humidity sensor, #5470: what it senses, its reads answered)
  const dhtText = () => Object.entries(sim.dhts()).map(([id, s]) => `; ${id} ${s.temp} °C, ${s.hum} %, ${s.reads} read(s) answered`).join('');
  const sonarText = () => Object.entries(sim.sonars()).map(([id, s]) => `; ${id} ${s.cm} cm${s.measuring ? ', measuring' : ''}${s.echo == null ? '' : `, its last echo ${s.echo} µs`}`).join('');
  // (a motion sensor, #5463: its OUT, blind after it)
  const pirText = () => Object.entries(sim.pirs()).map(([id, s]) => `; ${id} ${s.out ? 'OUT 1' : s.blind ? 'OUT 0, blind' : 'OUT 0'}`).join('');
  // (an SD card, #5477: its state, each block written and its first bytes as text)
  const { sdText: blockText } = await import('../core/circuit-sd.js');
  const sdText = () => Object.entries(sim.sds()).map(([id, s]) => `; ${id} ${s.stage}${s.written.map((n) => `, block ${n} ${blockText(sim.sdBlock(id, n))}`).join('')}`).join('');
  // (a stepper motor, #5476: its steps from the start, its shaft's angle)
  const stepperText = () => Object.entries(sim.steppers()).map(([id, s]) => `; ${id} at ${s.steps} half steps (${s.angle}°)`).join('');
  // (a buzzer, #5454: its tone, or silent)
  const buzzerText = () => Object.entries(sim.buzzers()).map(([id, s]) => `; ${id} ${s.sounding ? `${s.hz} Hz` : 'silent'}`).join('');
  // (a servo's arm, #5347)
  const servoText = () => Object.entries(sim.servos()).map(([id, s]) => `; ${id} at ${Math.round(s.angle)}°`).join('');
  // (a temperature sensor's temperature and OS, #5342)
  const sensorText = () => Object.entries(sim.sensors()).map(([id, s]) => `; ${id} ${s.temp.toFixed(1)} °C, OS ${s.os ? 'active' : 'inactive'}`).join('');
  const sensorIds = new Map(m.parts.filter((p) => p.type === 'lm75').map((p) => [p.id.toLowerCase(), p.id]));
  // (a rotary encoder, #5451: turned by its id, ±detents, its quadrature a quarter at a time; its detents from the start)
  const { encoderTurn, ENCODER_STEP_NS } = await import('../core/circuit-encoder.js');
  const encoders = new Map(m.parts.filter((p) => p.type === 'rotary-encoder').map((p) => [p.id.toLowerCase(), p.id])), detents = {};
  const encoderText = () => Object.entries(detents).map(([id, n]) => `; ${id} at detent ${n}`).join('');
  // (a character LCD's lines, #5330: off, or its two lines as it shows them)
  const oledText = () => Object.entries(sim.oleds()).map(([id, s]) => `; ${id} ${s.on ? `on, ${s.lit} pixel(s) lit` : 'off'}`).join('');
  const lcdText = () => Object.entries(sim.lcds()).map(([id, s]) => `; ${id} ${s.on ? s.lines.map((l) => `|${l}|`).join('') : 'off'}`).join('');
  lines.push(`start: t = ${first.time} ns; LEDs ${Object.entries(leds()).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'}${probeText()}`, ...note(first));
  for (const [k, step] of steps.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw toolError(`step ${k}: an object of inputs ({ name: 0 | 1 })`);
    if ('after_us' in step) {
      const us = Number(step.after_us);
      if (!Number.isFinite(us) || us < 0 || us > 1e6) throw toolError(`step ${k}: after_us = ${JSON.stringify(step.after_us)}: the time let pass before its inputs, 0 to 1000000 µs`);
      note(sim.advance(us * 1000));
    }
    for (const [n, v] of Object.entries(step)) {
      if (n === 'after_us') continue;
      if (sensing.has(n.toLowerCase())) {
        const { p, x } = sensing.get(n.toLowerCase()), val = Number(v);
        if (!Number.isFinite(val) || val < x.min || val > x.max) throw toolError(`step ${k}: ${n} = ${JSON.stringify(v)}: ${x.label.toLowerCase()} from ${x.min} to ${x.max}`);
        sim.setSensed(p.id, x.prop, val);
        continue;
      }
      // (a temperature sensor's temperature, by its id: °C, #5342)
      if (sensorIds.has(n.toLowerCase())) { if (!Number.isFinite(Number(v))) throw toolError(`step ${k}: ${n} = ${JSON.stringify(v)}: a temperature (°C)`); sim.setTemp(sensorIds.get(n.toLowerCase()), Number(v)); continue; }
      if (encoders.has(n.toLowerCase())) {
        const id = encoders.get(n.toLowerCase());
        if (!Number.isInteger(Number(v)) || !Number(v)) throw toolError(`step ${k}: ${n} = ${JSON.stringify(v)}: a turn, its detents (positive clockwise, negative anticlockwise)`);
        for (const [a, b] of encoderTurn(Number(v))) { sim.set(id, a, 0); sim.set(id, b, 1); note(sim.advance(ENCODER_STEP_NS)); }
        detents[id] = (detents[id] ?? 0) + Number(v);
        continue;
      }
      const x = byName.get(n.toLowerCase());
      if (!x) throw toolError(`step ${k}: '${n}' is not an input of the circuit (its inputs: ${inputs.map((i) => i.name).join(', ') || 'none'})`);
      if (![0, 1, '0', '1'].includes(v)) throw toolError(`step ${k}: ${n} = ${JSON.stringify(v)}: 0 or 1`);
      sim.set(x.part, String(v) === '1', x.index);
    }
    const r = sim.run();
    const outs = leds();
    lines.push(`step ${k}: inputs ${inputs.map((i) => `${i.name}=${at(i)}`).join(' ') || 'none'}; t = ${r.time} ns${r.quiet ? '' : ' (still changing)'}; LEDs ${Object.entries(outs).map(([a, b]) => `${a}=${b}`).join(' ') || 'none'}${probeText()}`, ...note(r));
    const lcds = Object.fromEntries(Object.entries(sim.lcds()).map(([id, s]) => [id, s.on ? s.lines : null]));
    const oleds = Object.fromEntries(Object.entries(sim.oleds()).map(([id, s]) => [id, s.on ? { lit: s.lit, rows: s.rows } : null]));
    rows.push({ step: k, time: r.time, quiet: r.quiet, inputs: Object.fromEntries(inputs.map((i) => [i.name, at(i)])), leds: Object.fromEntries(Object.entries(outs).map(([a, b]) => [a, Number(b)])), ...(probeName.size ? { probes: probes() } : {}), ...(Object.keys(meters()).length ? { volts: meters() } : {}), ...(rec.scopes.length ? { scopes: scopeData() } : {}), ...(sim.analog ? { mA: Object.fromEntries(Object.entries(sim.lampCurrents()).map(([id, v]) => [id, mA(v)])) } : {}), ...(Object.keys(lcds).length ? { lcds } : {}), ...(Object.keys(oleds).length ? { oleds } : {}) });
  }
  // (ngspice, #5386: the run's analog side again, one way, the digital outputs as Silinx simulated them)
  let spice = null;
  if (ngspice) {
    const { spiceNetlist, readSpiceResult, spiceReadings } = await import('../core/circuit-spice.js');
    const { runNgspice } = await import('./ngspice.js');
    const n = spiceNetlist(sim.spiceRecord(), { title: base });
    const r = await runNgspice(n.text, { log: (l) => lines.push(l) });
    const said = [...n.warnings, ...[...new Set(r.errors)].map((e) => `ngspice: ${e}`)];
    for (const x of said) lines.push(`WARNING: ${x}`);
    warnings.push(...said);
    const read = spiceReadings(m, sim, readSpiceResult(r.result, n.nodes));
    lines.push(...read.lines);
    spice = { meters: read.meters, scopes: read.scopes, points: r.result.data[0]?.values.length ?? 0 };
  }
  return { lines, rows, warnings, ...(spice ? { spice } : {}) };
}
