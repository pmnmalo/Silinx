// Silinx - Simulate System (#4701, docs/CODESIGN.md): a co-design project's System made ready to run, then its run said,
// one set of steps and messages for the System's simulation view (web/js/system-sim-view.js) and the MCP server's
// simulate of a System (server/mcp-system-sim.js). Ready: the plan (core/system-build.js), each FPGA node's module compiled for the compiled engine
// (`netlist(module)`: its word-level netlist, by Yosys, the caller's), each microcontroller's firmware read
// (`firmware(path)`); said: each wire's decoded bytes, the terminals' text, the nodes' and the decoders' warnings.
// Isomorphic ES module, no DOM.
import { systemPlan, buildSystem, wireFrames } from './system-build.js';
import { compiledNodeModel } from './system-sim-compiled.js';
import { loadAvr8js } from './system-sim-avr.js';
import { linkTraffic, usText, decodeSpi, spiWarnings } from './system-decode.js';

/** A run's time as Simulate System says it: ms or s. */
export const runTimeText = ps => (ps >= 1e12 ? `${+(ps / 1e12).toFixed(3)} s` : `${+(ps / 1e9).toFixed(3)} ms`);

/**
 * What the run needs, read where the System is (the page, the MCP server): { plan, netlists: { id: { json, top } },
 * firmware: { id: { name, data } } }, or { error } (a node that cannot be simulated, a module that does not compile, a
 * firmware not read). ports: { module: [{ name, dir, width }] }.
 */
export async function systemInputs(sys, { ports = {}, netlist, firmware }) {
  const plan = systemPlan(sys, { ports });
  if (plan.errors.length) return { error: plan.errors.join('; ') };
  const netlists = {}, fw = {};
  for (const f of plan.fpga) {
    try { netlists[f.id] = await netlist(f.module); } catch (e) { return { error: `${f.id}: its module ${f.module} does not compile: ${e.message}` }; }
  }
  for (const n of sys.nodes.filter(x => x.kind === 'mcu')) {
    try { fw[n.id] = { name: n.firmware, data: await firmware(n.firmware) }; } catch (e) { return { error: `${n.id}: its firmware ${n.firmware} cannot be read: ${e.message}` }; }
  }
  return { plan, netlists, firmware: fw };
}

/** The run built from its inputs (systemInputs'), where it runs (a Web Worker, the MCP server): { plan, sim, terminals,
 *  wires }, or { error }. */
export function systemFromInputs(sys, { plan, netlists, firmware }) {
  const fpga = {};
  for (const f of plan.fpga) {
    const n = netlists[f.id];
    try { fpga[f.id] = compiledNodeModel(n.json, { top: n.top, clock: f.clock.port, pins: f.pins }); } catch (e) { return { error: `${f.id}: ${e.message}` }; }
  }
  try { return { plan, ...buildSystem(sys, plan, { fpga, firmware }) }; } catch (e) { return { error: e.message }; }
}

/** The System ready to run here: systemInputs, then systemFromInputs. */
export async function prepareSystem(sys, opts) {
  const inputs = await systemInputs(sys, opts);
  if (sys.nodes.some(n => n.kind === 'mcu')) await loadAvr8js();
  return inputs.error ? inputs : systemFromInputs(sys, inputs);
}

/** Bytes as a terminal shows them: the printable characters, CR LF and tab as they are, the others as \xNN. */
export const bytesText = bytes => bytes.map(({ byte: b }) => (b >= 0x20 && b < 0x7f) || b === 10 || b === 13 || b === 9 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`).join('');

/**
 * What a run said: { now, traffic: [{ wire, link, from, to, baud, frame, bytes }], terminals: { id: text }, warnings,
 * errors, lines } (lines: the console's, a wire's bytes as its text).
 */
export function systemReport({ sim, wires, terminals }) {
  const traffic = linkTraffic(sim, { frames: wireFrames(wires) }).map((t, i) => ({ wire: t.link, link: wires[i].link, from: wires[i].from, to: wires[i].to, baud: wires[i].baud ?? null, frame: wires[i].frame ?? null, kind: t.kind, bytes: t.bytes, decoded: t.warnings, changes: t.changes }));
  // (an SPI link's transfers, from its four wires, #5214)
  const spi = spiTraffic(sim, wires);
  const warnings = [...sim.messages('warning'), ...traffic.flatMap(t => t.decoded), ...spi.flatMap(s => s.decoded)];
  const errors = sim.messages('error');
  const term = Object.fromEntries([...terminals].map(([id, n]) => [id, bytesText(n.received)]));
  const lines = [`Simulate System: ${runTimeText(sim.now)} simulated${sim.finished ? `, stopped by ${sim.finished.node} (${sim.finished.why})` : ''}.`];
  for (const t of traffic) {
    if (t.kind !== 'uart') { lines.push(`${t.wire} (${t.from} → ${t.to}): ${t.changes} change(s)`); continue; }
    lines.push(`${t.wire} (${t.from} → ${t.to}, ${t.baud} ${t.frame}): ${t.bytes.length} byte(s)${t.bytes.length ? `, the first at ${usText(t.bytes[0].t)}: ${JSON.stringify(bytesText(t.bytes))}` : ''}`);
  }
  for (const s of spi) lines.push(`${s.link} (SPI ${s.from} → ${s.to}, ${s.hz} Hz mode ${s.mode}): ${s.transfers.length} transfer(s)${s.transfers.length ? `: MOSI ${s.transfers.slice(0, 16).map(x => hexByte(x.mosi)).join(' ')}; MISO ${s.transfers.slice(0, 16).map(x => hexByte(x.miso)).join(' ')}` : ''}`);
  for (const [id, text] of Object.entries(term)) lines.push(`terminal ${id}: ${JSON.stringify(text)}`);
  for (const w of warnings) lines.push(`WARNING: ${w}`);
  for (const e of errors) lines.push(`ERROR: ${e}`);
  return { now: sim.now, traffic, spi, terminals: term, warnings, errors, lines };
}

const hexByte = b => b.toString(16).toUpperCase().padStart(2, '0');
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
