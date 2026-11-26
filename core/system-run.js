// Silinx - Simulate System (#4701, docs/SYSTEMS.md): a System project's System made ready to run, then its run said,
// one set of steps and messages for the System's simulation view (web/js/system-sim-view.js) and the MCP server's
// simulate of a System (server/mcp-system-sim.js). Ready: the plan (core/system-build.js), each FPGA node's module compiled for the compiled engine
// (`netlist(module)`: its word-level netlist, by Yosys, the caller's), each microcontroller's firmware read
// (`firmware(path)`); said: each wire's decoded bytes, the terminals' text, the nodes' and the decoders' warnings.
// Isomorphic ES module, no DOM.
import { systemPlan, buildSystem, wireFrames } from './system-build.js';
import { compiledNodeModel } from './system-sim-compiled.js';
import { loadAvr8js } from './system-sim-avr.js';
import { loadRp2040 } from './system-sim-rp2040.js';
import { BrokerNode, messageText } from './system-mqtt.js';
import { mcuBoard } from './system-doc.js';
import { linkTraffic, usText, decodeSpi, spiWarnings, decodeI2c, i2cWarnings, wiredAnd } from './system-decode.js';
import { regAccesses, accessText } from './regmap-decode.js';
import { normalizeCircuit } from './circuit.js';
import { sdText } from './circuit-sd.js';

/** A run's time as Simulate System says it: ms or s. */
export const runTimeText = ps => (ps >= 1e12 ? `${+(ps / 1e12).toFixed(3)} s` : `${+(ps / 1e9).toFixed(3)} ms`);

/**
 * What the run needs, read where the System is (the page, the MCP server): { plan, netlists: { id: { json, top } },
 * firmware: { id: { name, data } }, regmaps: { id: map } }, or { error } (a node that cannot be simulated, a module that
 * does not compile, a firmware not read). ports: { module: [{ name, dir, width }] }; regmap(module): the register map
 * the module is made from or instances (core/regmap.js regmapFor), or null (#5288: its link's accesses said); circuit(path):
 * a circuit node's .circ.json's text (#5215).
 */
export async function systemInputs(sys, { ports = {}, netlist, firmware, regmap = null, circuit = null }) {
  const circuits = {};
  for (const n of sys.nodes.filter(x => x.kind === 'circuit' && x.circuit)) {
    try { circuits[n.id] = normalizeCircuit(JSON.parse(await circuit(n.circuit))); } catch (e) { return { error: `${n.id}: its circuit ${n.circuit} cannot be read: ${e.message}` }; }
  }
  const plan = systemPlan(sys, { ports, circuits });
  if (plan.errors.length) return { error: plan.errors.join('; ') };
  const netlists = {}, fw = {};
  for (const f of plan.fpga) {
    // (the node's id too: its model's netlist, its RTL's else, #5612)
    try { netlists[f.id] = await netlist(f.module, f.id); } catch (e) { return { error: `${f.id}: its module ${f.module} does not compile: ${e.message}` }; }
  }
  for (const n of sys.nodes.filter(x => x.kind === 'mcu')) {
    try { fw[n.id] = { name: n.firmware, data: await firmware(n.firmware) }; } catch (e) { return { error: `${n.id}: its firmware ${n.firmware} cannot be read: ${e.message}` }; }
  }
  const regmaps = {};
  for (const f of plan.fpga) { const m = regmap ? await regmap(f.module) : null; if (m) regmaps[f.id] = m; }
  return { plan, netlists, firmware: fw, regmaps };
}

/** The run built from its inputs (systemInputs'), where it runs (a Web Worker, the MCP server): { plan, sim, terminals,
 *  wires }, or { error }. */
export function systemFromInputs(sys, { plan, netlists, firmware, regmaps = {} }) {
  const fpga = {};
  for (const f of plan.fpga) {
    const n = netlists[f.id];
    try { fpga[f.id] = compiledNodeModel(n.json, { top: n.top, clock: f.clock.port, pins: f.pins }); } catch (e) { return { error: `${f.id}: ${e.message}` }; }
  }
  try { return { plan, regmaps, ...buildSystem(sys, plan, { fpga, firmware }) }; } catch (e) { return { error: e.message }; }
}

/** The microcontrollers' engines of the System `sys` loaded here (avr8js for an Arduino; rp2040js and MicroPython's
 *  firmware for a Pico, #5494). */
export async function loadEngines(sys) {
  const arch = new Set(sys.nodes.filter(n => n.kind === 'mcu').map(n => mcuBoard(n.board)?.arch));
  if (arch.has('avr')) await loadAvr8js();
  if (arch.has('rp2040')) await loadRp2040();
}

/** The System ready to run here: systemInputs, then systemFromInputs. */
export async function prepareSystem(sys, opts) {
  const inputs = await systemInputs(sys, opts);
  if (inputs.error) return inputs;
  try { await loadEngines(sys); } catch (e) { return { error: e.message }; }
  return systemFromInputs(sys, inputs);
}

/** A terminal's caption: its id and its UART's baud and frame (`u`: its interface); a Pico's REPL (`<id>.repl`) its USB's. */
export const termCaption = (id, u) => (/\.repl$/.test(id) ? `${id.slice(0, -5)} · MicroPython REPL (USB)` : u?.kind === 'mqtt' ? `${id} · MQTT broker` : `${id} · ${u?.baud ?? 9600} ${u?.frame ?? '8N1'}`);

/** Bytes as a terminal shows them: the printable characters, CR LF and tab as they are, the others as \xNN. */
export const bytesText = bytes => bytes.map(({ byte: b }) => (b >= 0x20 && b < 0x7f) || b === 10 || b === 13 || b === 9 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`).join('');

/**
 * What a run said: { now, traffic: [{ wire, link, from, to, baud, frame, bytes }], terminals: { id: text }, circuits:
 * { id: { lamp: { on, times } } } (#5215), warnings, errors, lines } (lines: the console's, a wire's bytes as its text).
 */
export function systemReport({ sim, wires, terminals, regmaps = {} }) {
  // (an MQTT link's wires: their messages are its broker's traffic, #5500)
  const traffic = linkTraffic(sim, { frames: wireFrames(wires) }).map((t, i) => ({ wire: t.link, link: wires[i].link, from: wires[i].from, to: wires[i].to, baud: wires[i].baud ?? null, frame: wires[i].frame ?? null, kind: t.kind, bytes: t.bytes, decoded: t.warnings, changes: t.changes, mqtt: wires[i].kind === 'mqtt' })).filter(t => !t.mqtt).map(({ mqtt, ...t }) => t);
  const brokers = [...sim.nodes].filter(([, a]) => a instanceof BrokerNode);
  // (an SPI link's transfers, from its four wires, #5214)
  const spi = spiTraffic(sim, wires), i2c = i2cTraffic(sim, wires);
  // (a link to an FPGA node made from a register map: its accesses, #5288)
  const regs = regTraffic(sim, wires, regmaps, spi, i2c);
  const warnings = [...sim.messages('warning'), ...traffic.flatMap(t => t.decoded), ...spi.flatMap(s => s.decoded), ...i2c.flatMap(s => s.decoded), ...regs.flatMap(r => r.warnings)];
  const errors = sim.messages('error');
  const term = Object.fromEntries([...terminals].map(([id, n]) => [id, bytesText(n.received)]));
  const lines = [`Simulate System: ${runTimeText(sim.now)} simulated${sim.finished ? `, stopped by ${sim.finished.node} (${sim.finished.why})` : ''}.`];
  // (a circuit node's wires' latency, its SPI parts', #5384)
  for (const said of new Set(wires.map(w => w.said).filter(Boolean))) lines.push(`circuit ${said}`);
  for (const t of traffic) {
    if (t.kind !== 'uart') { lines.push(`${t.wire} (${t.from} → ${t.to}): ${t.changes} change(s)`); continue; }
    lines.push(`${t.wire} (${t.from} → ${t.to}, ${t.baud} ${t.frame}): ${t.bytes.length} byte(s)${t.bytes.length ? `, the first at ${usText(t.bytes[0].t)}: ${JSON.stringify(bytesText(t.bytes))}` : ''}`);
  }
  for (const s of spi) lines.push(`${s.link} (SPI ${s.from} → ${s.to}, ${s.hz} Hz mode ${s.mode}): ${s.transfers.length} transfer(s)${s.transfers.length ? `: MOSI ${s.transfers.slice(0, 16).map(x => hexByte(x.mosi)).join(' ')}; MISO ${s.transfers.slice(0, 16).map(x => hexByte(x.miso)).join(' ')}` : ''}`);
  for (const s of i2c) lines.push(`${s.link} (I²C ${s.from} → ${s.to}, ${s.hz} Hz): ${s.transfers.length} transfer(s)${s.transfers.length ? `: ${s.transfers.slice(0, 16).map(i2cText).join('; ')}` : ''}`);
  for (const r of regs) lines.push(`${r.link} (registers of ${r.map}): ${r.accesses.length} access(es)${r.accesses.length ? `: ${r.accesses.slice(0, 16).map(a => a.text).join('; ')}` : ''}`);
  for (const [id, text] of Object.entries(term)) if (!brokers.some(([b]) => b === id)) lines.push(`terminal ${id}: ${JSON.stringify(text)}`);
  // (an MQTT broker's traffic, #5500: each message, its time)
  const mqtt = Object.fromEntries(brokers.map(([id, b]) => [id, b.traffic.map(e => ({ t: e.t, client: e.client, dir: e.dir, ...e.message }))]));
  for (const [id, b] of brokers) lines.push(`broker ${id}: ${b.traffic.length} message(s)${b.traffic.length ? `: ${b.traffic.slice(0, 24).map(e => `${usText(e.t)} ${messageText(e)}`).join('; ')}` : ''}`, ...b.unheard().map(u => `broker ${id}: ${u.replace(/^MQTT: /, '')}`));   // (a filter nobody published to so far: said with the run, not warned at each step of it)
  // (a circuit node's lamps: lit now or not, the times each lit, #5215)
  const circuits = Object.fromEntries([...sim.nodes].filter(([, a]) => a.lamps).map(([id, a]) => [id, a.lamps()]));
  // (its character LCDs' lines, #5330)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.lcds)) for (const [k, s] of Object.entries(a.lcds())) lines.push(`circuit ${id}: ${k} ${s.on ? s.lines.map((l) => `|${l}|`).join('') : 'off'}`);
  // (its graphic OLEDs', #5336)
  // (its buzzers, #5454: sounding, and at what)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.buzzers)) for (const [k, s] of Object.entries(a.buzzers())) lines.push(`circuit ${id}: ${k} ${s.sounding ? `sounds at ${s.hz} Hz` : 'is silent'}`);
  // (its stepper motors, #5476: where their shafts are)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.steppers)) for (const [k, s] of Object.entries(a.steppers())) lines.push(`circuit ${id}: ${k} at ${s.steps} half steps (${s.angle}°)`);
  // (its SD cards, #5477: their state, each block written and its first bytes' text)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.sds)) for (const [k, s] of Object.entries(a.sds())) lines.push(`circuit ${id}: ${k} ${s.stage}${s.written.map((n) => `; block ${n}: ${sdText(a.sdBlock(k, n))}`).join('')}`);
  // (its ultrasonic sensors, #5456: the distance, the last echo)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.sonars)) for (const [k, s] of Object.entries(a.sonars())) lines.push(`circuit ${id}: ${k} ${s.cm} cm, ${s.echo == null ? 'no echo yet' : `its last echo ${s.echo} µs`}`);
  // (its motion sensors, #5463: their OUT)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.pirs)) for (const [k, s] of Object.entries(a.pirs())) lines.push(`circuit ${id}: ${k} ${s.out ? 'sees movement (OUT 1)' : s.blind ? 'blind (OUT 0)' : 'sees no movement (OUT 0)'}`);
  // (its temperature and humidity sensors, #5470: what they sense, their reads answered)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.dhts)) for (const [k, s] of Object.entries(a.dhts())) lines.push(`circuit ${id}: ${k} ${s.temp} °C, ${s.hum} %, ${s.reads} read(s) answered`);
  // (its servos, #5347: where their arms are)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.servos)) for (const [k, s] of Object.entries(a.servos())) lines.push(`circuit ${id}: ${k} at ${Math.round(s.angle)}°${s.width == null ? '' : `, its last pulse ${+s.width.toFixed(2)} ms`}`);
  // (its temperature sensors, #5342)
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.sensors)) for (const [k, s] of Object.entries(a.sensors())) lines.push(`circuit ${id}: ${k} ${s.temp.toFixed(1)} °C, OS ${s.os ? 'active' : 'inactive'}`);
  for (const [id, a] of [...sim.nodes].filter(([, x]) => x.oleds)) for (const [k, s] of Object.entries(a.oleds())) lines.push(`circuit ${id}: ${k} ${s.on ? `on, ${s.lit} pixel(s) lit` : 'off'}`);
  for (const [id, ls] of Object.entries(circuits)) lines.push(`circuit ${id}: ${Object.entries(ls).map(([k, l]) => `${k} ${l.on ? 'on' : 'off'}${l.times ? `, lit ${l.times} time(s)` : ', never lit'}`).join('; ') || 'no lamps'}`);
  for (const w of warnings) lines.push(`WARNING: ${w}`);
  for (const e of errors) lines.push(`ERROR: ${e}`);
  return { now: sim.now, traffic, spi, i2c, regs, terminals: term, circuits, ...(brokers.length ? { mqtt } : {}), warnings, errors, lines };
}

const hexByte = b => b.toString(16).toUpperCase().padStart(2, '0');
// an I²C transfer as the console says it: W 42: 05 (the address, its bytes; NACK where one was not acknowledged)
const i2cText = x => `${x.read ? 'R' : 'W'} ${hexByte(x.addr)}${x.ack ? '' : ' NACK'}${x.data.length ? `: ${x.data.map(d => `${hexByte(d.byte)}${d.ack ? '' : ' NACK'}`).join(' ')}` : ''}`;
// each SPI link's transfers (its wires `<link>_sck`…): [{ link, from, to, hz, mode, transfers, decoded }]
function spiTraffic(sim, wires) {
  const out = [];
  for (const link of new Set(wires.filter(w => w.kind === 'spi').map(w => w.link))) {
    const ws = Object.fromEntries(wires.filter(w => w.link === link).map(w => [w.line, w]));
    const sent = k => (ws[k] ? sim.links.get(ws[k].name).sent : null);
    const r = decodeSpi({ sck: sent('sck'), mosi: sent('mosi'), miso: sent('miso'), ss: sent('ss') }, { mode: ws.sck.mode });
    out.push({ link, from: ws.sck.from.split('.')[0], to: ws.sck.to.split('.')[0], hz: ws.sck.hz, mode: ws.sck.mode, transfers: r.transfers, decoded: spiWarnings(link, { hz: r.hz, declared: ws.sck.hz }) });
  }
  return out;
}

// each I²C link's transfers (its wires `<link>_scl`, `<link>_sda`, `<link>_sda_back`, SDA both ends'): [{ link, from, to,
// hz, transfers, decoded }]
function i2cTraffic(sim, wires) {
  const out = [];
  for (const link of new Set(wires.filter(w => w.kind === 'i2c').map(w => w.link))) {
    const ws = Object.fromEntries(wires.filter(w => w.link === link).map(w => [w.line, w]));
    const sent = k => (ws[k] ? sim.links.get(ws[k].name).sent : []);
    const r = decodeI2c({ scl: sent('scl'), sda: wiredAnd(sent('sda'), sent('sda_back')) });
    const w = ws.scl ?? ws.sda;
    out.push({ link, from: w.from.split('.')[0], to: w.to.split('.')[0], hz: w.hz, transfers: r.transfers, decoded: i2cWarnings(link, { hz: r.hz, declared: w.hz, transfers: r.transfers }) });
  }
  return out;
}

// each SPI or I²C link whose peripheral is an FPGA node made from a register map: its accesses ([{ link, map, accesses:
// [{ t, op, reg, value, partial, text }], warnings }])
function regTraffic(sim, wires, regmaps, spi, i2c) {
  const out = [];
  for (const s of [...spi.map(x => ({ ...x, kind: 'spi' })), ...i2c.map(x => ({ ...x, kind: 'i2c' }))]) {
    const m = regmaps[s.to];
    if (!m || m.bus !== s.kind) continue;
    const ss = s.kind === 'spi' ? sim.links.get(wires.find(w => w.link === s.link && w.line === 'ss')?.name)?.sent ?? null : null;
    const r = regAccesses(m, s.kind === 'spi' ? { spi: s.transfers, ss } : { i2c: s.transfers });
    out.push({ link: s.link, map: m.name, accesses: r.accesses.map(a => ({ ...a, text: accessText(m, a) })), warnings: r.warnings.map(w => `${s.link}: ${w}`) });
  }
  return out;
}
