// The HDL generated from a circuit (#3897, #3899, docs/CIRCUITS.md): one module named after the circuit, its inputs (a
// switch's level, a button pressed, a DIP switch's levers, a clock) and its outputs (an LED lit, a display's segments,
// an LED bar's lights: '1' while lit); each net a resolved signal (std_logic, a Verilog wire), the supply's '1' and
// '0'; a pulled net (a pull-up or -down) its strong drivers' level, or the pull's while they leave it at 'Z' (written
// so, not as 'H' / 'L': the same in both languages); each IC an instance of its own entity (core/circuit-hdl-ics.js),
// written in the same file and named after the circuit (<circuit>_sn74ls00: two circuits of a project never define the
// same entity). A closed contact copies its driven side's net to its other side (one between two driven nets is an
// error of the check, core/circuit-check.js). Isomorphic module.
import { partDef, supplyPins } from './circuit-parts.js';
import { circuitNets } from './circuit-net.js';
import { normalizeCircuit, circuitPorts } from './circuit.js';
import { partInputs, partLamps, portRef, portDecls } from './circuit-io.js';
import { circuitErrors } from './circuit-check.js';
import { pinPort, icPorts, vhdlIc, verilogIc, vhdlDigital, verilogDigital } from './circuit-hdl-ics.js';
import { digitalTop } from './circuit-digital.js';
import { vhdlEntity, vlogModule } from './hdl-emit.js';
import { coreText, verilogCoreDigital } from './circuit-hdl-core.js';
import { vhdlLcd, verilogLcd, lcdEntity, LCD_PORTS } from './circuit-hdl-lcd.js';
import { vhdlOled, verilogOled, oledEntity } from './circuit-hdl-oled.js';
import { vhdlLm75, verilogLm75, lm75Entity } from './circuit-hdl-lm75.js';
import { vhdlServo, verilogServo, servoEntity } from './circuit-hdl-servo.js';
import { vhdlBuzzer, verilogBuzzer, buzzerEntity } from './circuit-hdl-buzzer.js';
import { vhdlSonar, verilogSonar, sonarEntity } from './circuit-hdl-sonar.js';
import { vhdlPir, verilogPir, pirEntity } from './circuit-hdl-pir.js';
import { vhdlStepper, verilogStepper, stepperEntity } from './circuit-hdl-stepper.js';
import { vhdlSd, verilogSd, sdEntity } from './circuit-hdl-sd.js';
import { vhdlDht, verilogDht, dhtEntity } from './circuit-hdl-dht.js';

// (a KiCad part modelled by a module of the project, #4283: that module)
const entityOf = (m, d) => (d.kind === 'model' ? d.module : `${m.name}_${d.chip.toLowerCase()}`);
// (a part as the header names it: an IC's chip; a project's KiCad part's number, #4280, and its library IC's)
const partLabel = (d) => (!d.kicad ? d.chip : d.behaves ? `${d.kicad.value}, as the ${d.chip}` : d.kind === 'model' ? `${d.kicad.value}, by its module ${d.module}` : `${d.kicad.value}, drawn only`);
const isSupply = (q) => !!q.supply || q.name === '+' || q.name === '-';   // (a board's 5V and GND too, #5215)
const WHILE = { level: 'on', momentary: 'pressed', clock: 'high' };
// (a character LCD's entity, #5330; another part: none)
const lcdOf = (m, p) => (partDef(p.type)?.kind === 'lcd' ? lcdEntity(m.name) : partDef(p.type)?.kind === 'oled' ? oledEntity(m.name) : partDef(p.type)?.kind === 'sensor' ? lm75Entity(m.name) : partDef(p.type)?.kind === 'servo' ? servoEntity(m.name) : partDef(p.type)?.kind === 'buzzer' ? buzzerEntity(m.name) : partDef(p.type)?.kind === 'sonar' ? sonarEntity(m.name) : partDef(p.type)?.kind === 'pir' ? pirEntity(m.name) : partDef(p.type)?.kind === 'dht' ? dhtEntity(m.name) : partDef(p.type)?.kind === 'stepper' ? stepperEntity(m.name) : partDef(p.type)?.kind === 'sd' ? sdEntity(m.name) : null);
// (its generics: its id; a temperature sensor's saved temperature too, in half-degrees, #5342)
// (an LM75's temperature, #5342; an ultrasonic sensor's distance, #5456: its generics)
const genericsOf = (p, V) => {
  const d = partDef(p.type), k = d?.kind;
  // (an LM75's temperature, #5342; an ultrasonic sensor's distance, #5456; a motion sensor's hold time, ms, and its
  // jumper, #5463; a temperature and humidity sensor's model and what it senses, in tenths, #5470)
  const g = [['id', `"${p.label || p.id}"`], ...(k === 'sensor' ? [['temp', Math.round((p.temp ?? 25) * 2)]] : []), ...(k === 'sonar' ? [['cm', p.cm ?? 100]] : []),
    ...(k === 'pir' ? [['hold_ms', (p.hold ?? 3) * 1000], ['retrig', p.retrigger === false ? 0 : 1]] : []),
    ...(k === 'dht' ? [['model', d.variant], ['temp10', Math.round((p.temp ?? 25) * 10)], ['hum10', Math.round((p.hum ?? 50) * 10)]] : [])];
  return g.map(([n, v]) => (V ? `${n} => ${v}` : `.${n.toUpperCase()}(${v})`)).join(', ');
};

/** The circuit's HDL: { filename, code, module }, or an Error with its diagnostics when it has errors. */
export function generateCircuit(model, lang, { source } = {}) {
  const m = normalizeCircuit(model);
  lang = lang === 'verilog' || (!lang && m.lang === 'verilog') ? 'verilog' : 'vhdl';
  const errs = circuitErrors(m);
  if (errs.length) { const e = new Error(`The circuit '${m.name}' has ${errs.length} error(s):\n${errs.map((d) => `  - ${d.message}`).join('\n')}`); e.diagnostics = errs; throw e; }
  const V = lang === 'vhdl', c = V ? '--' : '//';
  const ports = circuitPorts(m);
  const plan = netPlan(m, V, ports);
  // (each entity once: a project's KiCad part that behaves as a library IC is that IC's, #4280)
  const types = [...new Map(m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic').map((d) => [entityOf(m, d).toLowerCase(), d])).values()];

  const L = [];
  const rule = c + '='.repeat(78);
  L.push(rule, `${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`, `${c} Description : the digital circuit ${source || `${m.name}.circ.json`}`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx circuit editor (edit the circuit, not this file)`,
    `${c} Parts       : ${m.parts.filter((p) => ['ic', 'drawn', 'model'].includes(partDef(p.type)?.kind)).map((p) => `${p.id} (${partLabel(partDef(p.type))})`).join(', ') || 'no ICs'}`,
    `${c} Inputs      : ${ports.inputs.map((x) => `${x.name} (${x.part}, '1' while ${WHILE[x.kind]})`).join(', ') || 'none'}`,
    `${c} Outputs     : ${ports.outputs.map((x) => `${x.name} (${x.part}, '1' while lit)`).join(', ') || 'none'}`, rule, '');
  // two models in one file (#3901): the simulation's (behind `synthesis translate_off`: the simulator reads it, a synthesis
  // tool does not) and the digital one a synthesis tool builds (core/circuit-digital.js); in VHDL two architectures,
  // the simulation's analysed last (its default), in Verilog a macro defined behind the fence
  const OFF = `${c} synthesis translate_off`, ON = `${c} synthesis translate_on`, SIM = `SILINX_SIM_${m.name.toUpperCase()}`;
  if (!V) L.push('`timescale 1ns / 1ps', '', OFF, `\`define ${SIM}`, ON, '');
  for (const d of types) {
    const T = [];
    // (an IC written once in VHDL, #4397: its core first, which both its models instantiate)
    if (d.core) coreText(L, entityOf(m, d), d, V);
    (V ? vhdlIc : verilogIc)(T, entityOf(m, d), d);
    if (!d.model && !d.seq && !d.core) { L.push(OFF, ...T.slice(0, -1), ON, ''); continue; }   // (a gate IC: the digital body inlines its gates)
    if (V) {
      const a = T.findIndex((l) => l.startsWith('architecture model of'));
      L.push(...T.slice(0, a)); vhdlDigital(L, entityOf(m, d), d); L.push(OFF, ...T.slice(a, -1), ON, '');
    } else {
      const h = T.findIndex((l) => l.startsWith('module ')), e = T.lastIndexOf('endmodule');
      L.push(...T.slice(0, h + 1), `\`ifdef ${SIM}`, ...T.slice(h + 1, e), '`else', ...(d.core ? verilogCoreDigital(d, entityOf(m, d)) : verilogDigital(d)), '`endif', 'endmodule', '');
    }
  }

  // (a character LCD's entity, #5330: simulation only, its lines reported)
  const lcds = m.parts.filter((p) => partDef(p.type)?.kind === 'lcd');
  if (lcds.length) { const T = []; (V ? vhdlLcd : verilogLcd)(T, lcdEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }
  // (a graphic OLED's, #5336: its I²C peripheral and its controller, simulation only)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'oled')) { const T = []; (V ? vhdlOled : verilogOled)(T, oledEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }
  if (m.parts.some((p) => partDef(p.type)?.kind === 'sensor')) { const T = []; (V ? vhdlLm75 : verilogLm75)(T, lm75Entity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }
  if (m.parts.some((p) => partDef(p.type)?.kind === 'servo')) { const T = []; (V ? vhdlServo : verilogServo)(T, servoEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }
  if (m.parts.some((p) => partDef(p.type)?.kind === 'buzzer')) { const T = []; (V ? vhdlBuzzer : verilogBuzzer)(T, buzzerEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }   // (#5454)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'sonar')) { const T = []; (V ? vhdlSonar : verilogSonar)(T, sonarEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }   // (#5456)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'pir')) { const T = []; (V ? vhdlPir : verilogPir)(T, pirEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }   // (#5463)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'dht')) { const T = []; (V ? vhdlDht : verilogDht)(T, dhtEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }   // (#5470)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'stepper')) { const T = []; (V ? vhdlStepper : verilogStepper)(T, stepperEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }   // (#5476)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'sd')) { const T = []; (V ? vhdlSd : verilogSd)(T, sdEntity(m.name)); L.push(OFF, ...T.slice(0, -1), ON, ''); }   // (#5477)

  // the circuit's module: its ports (a bus's bits one vector, led[0]…), its two bodies
  const decls = portDecls(ports);
  // (a module's instance, #4283: its pins that are ports)
  const lcdMap = (p) => LCD_PORTS.map((k) => [k, plan.pinNet(p.id, partDef(p.type).pins.find((q) => q.name.toLowerCase() === k).n)]);
  // (an OLED's SDA: its driven side, `sda`, and the net read, `sda_rd`)
  const oledMap = (p) => { const n = (k) => partDef(p.type).pins.find((q) => q.name === k).n; return [['gnd', plan.pinNet(p.id, n('GND'))], ['vcc', plan.pinNet(p.id, n('VCC'))], ['scl', plan.pinNet(p.id, n('SCL'))], ['sda_rd', plan.pinNet(p.id, n('SDA'))], ['sda', plan.pinNet(p.id, n('SDA'), 'oc')]]; };
  // (a temperature sensor, #5342: SDA's two sides as the OLED's, its OS driven, its address pins read)
  // (a servo, #5347: its power and its signal read)
  const servoMap = (p) => ['GND', 'VCC', 'SIG'].map((k) => [k.toLowerCase(), plan.pinNet(p.id, partDef(p.type).pins.find((q) => q.name === k).n)]);
  // (a buzzer, #5454: its + and its −)
  const buzzerMap = (p) => [['pos', plan.pinNet(p.id, 1)], ['neg', plan.pinNet(p.id, 2)]];
  const lm75Map = (p) => { const n = (k) => partDef(p.type).pins.find((q) => q.name === k).n; return [...oledMap(p), ...['A0', 'A1', 'A2'].map((k) => [k.toLowerCase(), plan.pinNet(p.id, n(k))]), ['os', plan.pinNet(p.id, n('OS'), 'oc')]]; };
  const icMap = (p) => (partDef(p.type).kind === 'lcd' ? lcdMap(p) : partDef(p.type).kind === 'oled' ? oledMap(p) : partDef(p.type).kind === 'sensor' ? lm75Map(p) : partDef(p.type).kind === 'servo' ? servoMap(p) : partDef(p.type).kind === 'buzzer' ? buzzerMap(p) : partDef(p.type).kind === 'sonar' ? sonarMap(p) : partDef(p.type).kind === 'pir' ? pirMap(p) : partDef(p.type).kind === 'dht' ? dhtMap(p) : partDef(p.type).kind === 'stepper' ? stepperMap(p) : partDef(p.type).kind === 'sd' ? sdMap(p) : (partDef(p.type).kind === 'model' ? partDef(p.type).pins.filter((q) => q.port) : icPorts(partDef(p.type))).map((q) => [pinPort(q), plan.pinNet(p.id, q.n, q.dir)]));
  // (an ultrasonic sensor, #5456: its power and its trigger read, its echo driven)
  // (a motion sensor, #5463: its power read, its input someone moving, its OUT driven)
  // (a temperature and humidity sensor, #5470: its DATA read, `data_rd`, and driven open drain, `data`)
  const dhtMap = (p) => [['vcc', plan.pinNet(p.id, 1)], ['gnd', plan.pinNet(p.id, 4)], ['data_rd', plan.pinNet(p.id, 2)], ['data', plan.pinNet(p.id, 2, 'oc')]];
  // (an SD card, #5477: its power, SCK, MOSI and CS read, MISO driven)
  const sdMap = (p) => { const n = (k) => partDef(p.type).pins.find((q) => q.name === k).n; return [...['VCC', 'GND', 'SCK', 'MOSI', 'CS'].map((k) => [k.toLowerCase(), plan.pinNet(p.id, n(k))]), ['miso', plan.pinNet(p.id, n('MISO'), 'out')]]; };
  // (a stepper motor, #5476: its power and its four inputs read)
  const stepperMap = (p) => { const n = (k) => partDef(p.type).pins.find((q) => q.name === k).n; return ['VCC', 'GND', 'IN1', 'IN2', 'IN3', 'IN4'].map((k) => [k.toLowerCase(), plan.pinNet(p.id, n(k))]); };
  const pirMap = (p) => [['vcc', plan.pinNet(p.id, 1)], ['gnd', plan.pinNet(p.id, 3)], ['motion', portRef(partInputs(p)[0].port, V)], ['q', plan.pinNet(p.id, 2, 'out')]];
  const sonarMap = (p) => [['vcc', plan.pinNet(p.id, 1)], ['gnd', plan.pinNet(p.id, 4)], ['trig', plan.pinNet(p.id, 2)], ['echo', plan.pinNet(p.id, 3, 'out')]];
  const lamps = m.parts.flatMap((p) => partLamps(p).map((x) => [portRef(x.port, V), plan.pinNet(p.id, x.a), plan.pinNet(p.id, x.k)]));
  const dig = digitalTop(m, V, (d) => entityOf(m, d));
  if (V) {
    const ps = decls.map((x) => ({ name: x.name, dir: x.dir, type: x.width == null ? 'std_logic' : `std_logic_vector(${x.width - 1} downto 0)` }));
    L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', ...vhdlEntity(m.name, { ports: ps.length ? ps : null }));
    L.push('', `architecture digital of ${m.name} is`, ...dig.decl.map((x) => `  ${x}`), 'begin', ...dig.body.map((x) => `  ${x}`), 'end architecture digital;', '',
      OFF, `architecture circuit of ${m.name} is`);
    if (plan.signals.length) L.push(`  signal ${plan.signals.join(', ')} : std_logic := 'X';`);   // (unknown at first: no instant read as floating)
    if (plan.watched.length) L.push('  -- silinx: ignore unused-signal (watched by a logic probe)', `  signal ${plan.watched.join(', ')} : std_logic := 'X';`);
    L.push('begin');
    for (const [n, e, why] of plan.assigns) L.push(`  ${n} <= ${e};   -- ${why}`);
    for (const p of m.parts) if (plan.inst.has(p.id)) L.push(`  ${plan.inst.get(p.id)} : entity work.${lcdOf(m, p) ?? entityOf(m, partDef(p.type))}${lcdOf(m, p) ? ` generic map (${genericsOf(p, true)})` : ''} port map (${icMap(p).map(([a, b]) => `${a} => ${b}`).join(', ')});`);
    for (const [o, a, k] of lamps) L.push(`  ${o} <= '1' when to_x01(${a}) = '1' and to_x01(${k}) = '0' else '0';`);
    L.push('end architecture circuit;', ON);
  } else {
    const ps = decls.map((x) => ({ name: x.name, dir: x.dir === 'in' ? 'in' : 'out', range: x.width == null ? '' : `[${x.width - 1}:0] ` }));
    L.push(...vlogModule(m.name, { inline: true, ports: ps }), `\`ifdef ${SIM}`);
    if (plan.signals.length) L.push(`  wire ${plan.signals.join(', ')};`);
    if (plan.watched.length) L.push('  // silinx: ignore unused-signal (watched by a logic probe)', `  wire ${plan.watched.join(', ')};`);
    for (const [n, e, why] of plan.assigns) L.push(`  assign ${n} = ${e};   // ${why}`);
    for (const p of m.parts) if (plan.inst.has(p.id)) L.push(`  ${lcdOf(m, p) ?? entityOf(m, partDef(p.type))}${lcdOf(m, p) ? ` #(${genericsOf(p, false)})` : ''} ${plan.inst.get(p.id)} (${icMap(p).map(([a, b]) => `.${a}(${b})`).join(', ')});`);
    for (const [o, a, k] of lamps) L.push(`  assign ${o} = (${a} === 1'b1) && (${k} === 1'b0);`);
    L.push('`else', ...dig.decl.map((x) => `  ${x}`), ...dig.body.map((x) => `  ${x}`), '`endif', 'endmodule');
  }
  return { filename: `${m.name}.${V ? 'vhd' : 'v'}`, code: L.join('\n') + '\n', module: m.name, probes: plan.probes };
}

/**
 * The nets as signals: { signals, assigns: [[target, expression, comment]], inst: Map(part → instance name),
 * pinNet(part, pin, dir) → what a pin's port maps to }. A net is driven (the supply, an output, a switch, a pull) and read
 * (an input, an IC's power pin, a lamp, a contact from its driven side); a net nothing reads is no signal (an output
 * left open, the supply's rails unused), nor one of one pin and no wire (an input reading 'Z'). A pulled net n has its
 * strong drivers on n_d, and n is n_d, or the pull's level while n_d is 'Z'.
 */
function netPlan(m, V, ports) {
  const nets = circuitNets(m);
  const used = new Set([m.name, ...portDecls(ports).map((x) => x.name)].map((s) => s.toLowerCase()));
  for (const d of m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic' || d?.kind === 'model')) used.add(entityOf(m, d).toLowerCase());
  const fresh = (base) => { let s = base, k = 1; while (used.has(s.toLowerCase())) s = `${base}_${++k}`; used.add(s.toLowerCase()); return s; };
  const typeOf = new Map(m.parts.map((p) => [p.id, p.type]));
  const strong = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || q.dir === 'oc' || isSupply(q)));
  const pulls = nets.nets.map((net) => [...new Set(net.pins.filter((q) => q.dir === 'weak').map((q) => partDef(typeOf.get(q.part)).pulls[0].value))]);
  const driven = strong.map((s, i) => s || pulls[i].length > 0);
  // (a transceiver's pin, #4397: read as it is driven)
  const read = nets.nets.map((net) => net.pins.some((q) => q.dir === 'in' || q.io || ((q.dir === 'vcc' || q.dir === 'gnd') && !isSupply(q))));
  // (a net a logic probe watches is a signal too, for the waveforms, #3900; one nothing else reads: watched only)
  const probed = nets.nets.map((net) => net.pins.some((q) => q.dir === 'probe'));
  // (a contact copies a strongly driven net to its other side, a pulled one's too: a pull-down and a button to +)
  // (a net driven both ways first: a contact from GND to an open-drain line with its pull-up, #5470)
  const hard = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || isSupply(q)));
  const from = (k) => (hard[k.a] && !hard[k.b] ? k.a : hard[k.b] && !hard[k.a] ? k.b : strong[k.a] && !strong[k.b] ? k.a : strong[k.b] && !strong[k.a] ? k.b : !driven[k.a] && driven[k.b] ? k.b : driven[k.a] && !driven[k.b] ? k.a : null);
  for (const k of nets.contacts) { const f = from(k); if (f != null && read[f === k.a ? k.b : k.a]) read[f] = true; }
  const watchedOnly = probed.map((p, i) => p && !read[i]);
  probed.forEach((p, i) => { if (p) read[i] = true; });
  const name = [], drv = [];
  nets.nets.forEach((net, i) => {
    if (!read[i] || (net.pins.length === 1 && !net.wires.length)) return;
    name[i] = fresh(`n${name.filter(Boolean).length + 1}`);
    drv[i] = pulls[i].length ? fresh(`${name[i]}_d`) : name[i];
  });
  // (a character LCD too, #5330: its entity's instance, simulation only)
  if (m.parts.some((p) => partDef(p.type)?.kind === 'lcd')) used.add(lcdEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'oled')) used.add(oledEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'sensor')) used.add(lm75Entity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'servo')) used.add(servoEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'buzzer')) used.add(buzzerEntity(m.name).toLowerCase());
  const inst = new Map(m.parts.filter((p) => ['ic', 'model', 'lcd', 'oled', 'sensor', 'servo', 'buzzer', 'sonar', 'pir', 'dht', 'stepper', 'sd'].includes(partDef(p.type)?.kind)).map((p) => [p.id, fresh(`u_${p.id}`)]));
  if (m.parts.some((p) => partDef(p.type)?.kind === 'sonar')) used.add(sonarEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'pir')) used.add(pirEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'dht')) used.add(dhtEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'stepper')) used.add(stepperEntity(m.name).toLowerCase());
  if (m.parts.some((p) => partDef(p.type)?.kind === 'sd')) used.add(sdEntity(m.name).toLowerCase());
  const Z = V ? "'Z'" : "1'bz", lit = (v) => (V ? `'${v}'` : `1'b${v.toLowerCase()}`);
  const netOf = (id, n) => nets.pinNet.get(`${id}.${n}`);
  // (an output drives the net's strong side, an input reads the net)
  const isOut = (dir) => dir === 'out' || dir === 'oc';
  const pinNet = (id, n, dir = 'in') => { const i = netOf(id, n); return (isOut(dir) ? drv[i] : name[i]) ?? (isOut(dir) ? (V ? 'open' : '') : Z); };

  const assigns = [], targets = new Set();
  const add = (i, e, why) => { if (drv[i]) { assigns.push([drv[i], e, why]); targets.add(i); } };
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    // (the supply's terminals; a board's 5V, 3V3 and GND, #5215, its pins joined inside it driven once)
    for (const x of supplyPins(d)) if (!targets.has(netOf(p.id, x.n))) add(netOf(p.id, x.n), lit(x.value), d.kind === 'supply' ? `${p.id} ${x.value === '1' ? '+' : '−'}` : `${p.id} ${d.pins.find((q) => q.n === x.n).name}`);
    const inputs = partInputs(p);
    for (const s of d.sources || []) add(netOf(p.id, s.pin), portRef(inputs[s.input].port, V), p.id);
    for (const ct of nets.contacts.filter((x) => x.part === p.id)) {
      const f = from(ct);   // (both strongly driven: an error of the check; neither driven: nothing to copy)
      if (f == null) continue;
      const to = f === ct.a ? ct.b : ct.a, port = portRef(inputs[ct.input].port, V);
      if (name[f]) add(to, V ? `${name[f]} when ${port} = '${ct.when ? 1 : 0}' else 'Z'` : `${ct.when ? port : `!${port}`} ? ${name[f]} : 1'bz`, `${p.id} ${p.type === 'button' || p.type === 'keypad-4x4' || (p.type === 'rotary-encoder' && ct.input === 2) ? 'pressed' : p.type === 'rotary-encoder' ? 'turned' : ct.when ? 'on' : 'off'}`);
    }
  }
  nets.nets.forEach((net, i) => {
    if (!name[i]) return;
    const icOut = net.pins.some((q) => isOut(q.dir) && ['ic', 'model', 'sonar', 'pir', 'sd'].includes(partDef(typeOf.get(q.part))?.kind));   // (an ultrasonic sensor's echo, #5456; a PIR's OUT, #5463; an SD card's MISO, #5477)
    // a pulled net: its strong side's level, or the pull's (two pulls of opposite levels: X)
    if (pulls[i].length) {
      if (!targets.has(i) && !icOut) assigns.push([drv[i], Z, 'no strong driver']);
      const pv = pulls[i].length > 1 ? 'X' : pulls[i][0];
      assigns.push([name[i], V ? `${lit(pv)} when ${drv[i]} = 'Z' else ${drv[i]}` : `(${drv[i]} === 1'bz) ? ${lit(pv)} : ${drv[i]}`, `pulled ${pv === '1' ? 'up' : pv === '0' ? 'down' : 'both ways'}`]);
    } else if (!driven[i] && !targets.has(i)) assigns.push([name[i], Z, 'floating: a 74LS input reads it high, a 4000 input X']);
  });
  const watched = new Set(name.filter((n, i) => n && watchedOnly[i]));
  const signals = [...new Set([...name, ...drv].filter((n) => n && !watched.has(n)))];
  const probes = m.parts.filter((p) => p.type === 'probe').map((p) => ({ part: p.id, label: p.label || p.id, signal: name[netOf(p.id, 1)] ?? null }));
  return { signals, watched: [...watched], assigns, inst, pinNet, probes };
}
