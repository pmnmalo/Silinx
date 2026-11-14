// core/schmarker-many.js (#4000): I/O markers added at once to every open end of a schematic, as the Add I/O Marker
// tool's rectangle and the MCP's add_markers do: the next free default names (a name taken skipped, any letter case;
// a gap filled first), a bus pin's width, the pins' directions (a bidirectional one: io1), a wire end's direction from
// the pins on its net (none: skipped, said), one marker per net, a named net's name; an instance's pins only; the
// console's lines; and the HDL of a schematic made this way compiled, elaborated and simulated in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, normalizeDoc, normModules, netlist, generateHdl, symbolPins } from '../core/schdoc.js';
import { planMarkers, addMarkers, markersText } from '../core/schmarker-many.js';
import { simulate } from '../core/compile.js';

const P = (x, y) => ({ x, y });
const ALL = { x: 0, y: 0, w: 2000, h: 2000 };
const sym = (id, type, x, y, name, params = {}, rot = 0) => ({ id, type, x, y, rot, mirror: false, name, params });
const port = (id, name, dir, x, y, width = 1) => ({ id, name, dir, width, x, y });
// U1, a 2-input AND at (200, 100): I0 (200, 110), I1 (200, 130), O (280, 120); U2, an 8-bit inverter at (200, 300):
// I (200, 310), O (280, 310)
function sheet(lang = 'vhdl', more = {}) {
  const doc = { ...newDoc('top', lang), ...more };
  doc.symbols = [sym('S1', 'and2', 200, 100, 'U1'), sym('S2', 'inv', 200, 300, 'U2', { width: 8 }), ...(more.symbols || [])];
  return normalizeDoc(doc);
}
const names = plan => plan.markers.map(m => `${m.at}:${m.name}:${m.dir}:${m.width}`);

test('#4000 the default names: in1, in2… out1… in the drawing\'s order; a name taken by a marker, a net name or an instance skipped, in any case', () => {
  assert.deepEqual(names(planMarkers(sheet(), { rect: ALL })), ['U1.I0:in1:in:1', 'U1.I1:in2:in:1', 'U1.O:out1:out:1', 'U2.I:in3:in:8', 'U2.O:out2:out:8']);
  // in1 taken (a marker elsewhere): in2 first
  const taken = sheet('vhdl', { ports: [port('P1', 'in1', 'in', 600, 600)] });
  assert.deepEqual(names(planMarkers(taken, { rect: { x: 150, y: 50, w: 200, h: 300 } })), ['U1.I0:in2:in:1', 'U1.I1:in3:in:1', 'U1.O:out1:out:1', 'U2.I:in4:in:8', 'U2.O:out2:out:8']);
  // a gap, in1 and in3 taken: filled first (in2), then after in3 (in4), as one marker's default name (#680)
  const gap = sheet('vhdl', { ports: [port('P1', 'in1', 'in', 600, 600), port('P2', 'in3', 'in', 600, 700)] });
  assert.deepEqual(planMarkers(gap, { rect: { x: 150, y: 50, w: 200, h: 300 } }).markers.map(m => m.name), ['in2', 'in4', 'out1', 'in5', 'out2']);
  // a net name IN1 (another letter case), an instance named Out1: skipped; in Verilog too (the names VHDL would clash on)
  for (const lang of ['vhdl', 'verilog']) {
    const d = sheet(lang, { symbols: [sym('S3', 'buf', 600, 600, 'Out1')], wires: [{ id: 'W1', points: [P(700, 800), P(800, 800)] }], labels: [{ id: 'L1', x: 750, y: 800, net: 'IN1' }] });
    assert.deepEqual(planMarkers(d, { rect: { x: 150, y: 50, w: 200, h: 300 } }).markers.map(m => m.name), ['in2', 'in3', 'out2', 'in4', 'out3'], lang);
  }
});

test('#4000 the pins\' directions and widths: a bidirectional pin io1, a bus pin its width; turned the way the pin points; connected pins left out', () => {
  const modules = normModules([{ name: 'pad', ports: [{ name: 'd', dir: 'in', width: 4 }, { name: 'q', dir: 'inout', width: 1 }] }]);
  const doc = normalizeDoc({ ...newDoc('top', 'vhdl'), symbols: [sym('S1', 'module', 100, 100, 'X1', { module: 'pad' }), sym('S2', 'and2', 400, 100, 'U1', {}, 90)] }, { modules });
  const pins = symbolPins(doc.symbols[1], modules);
  const plan = planMarkers(doc, { rect: ALL, modules });
  assert.deepEqual(names(plan), ['X1.d:in1:in:4', 'X1.q:io1:inout:1', 'U1.I0:in2:in:1', 'U1.I1:in3:in:1', 'U1.O:out1:out:1']);
  // (the AND turned a quarter: its inputs point up, N, its output down, S, #2926)
  assert.deepEqual(plan.markers.slice(2).map(m => [m.x, m.y, m.side]), pins.map(p => [p.x, p.y, p.side]));
  assert.deepEqual(plan.markers.slice(2).map(m => m.side), ['N', 'N', 'S']);
  assert.equal(plan.markers[0].side, undefined, 'an input pin pointing W: the default side');
  // a pin on a wire, on a marker or on another pin: not open; outside the rectangle: left out
  const d2 = normalizeDoc({ ...newDoc('top', 'vhdl'), symbols: [sym('S1', 'and2', 200, 100, 'U1'), sym('S2', 'inv', 280, 110, 'U2')],
    ports: [port('P1', 'a', 'in', 200, 110)], wires: [{ id: 'W1', points: [P(200, 130), P(200, 200), P(500, 200)] }] });
  // (U2.I on U1.O at 280, 120; U1.I0 on the marker a; U1.I1 on W1, whose far end is open: an input, U1.I1's)
  const r = planMarkers(d2, { rect: ALL });
  assert.deepEqual(names(r), ['U2.O:out1:out:1', 'the wire end at 500, 200:in1:in:1']);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(names(planMarkers(d2, { rect: { x: 400, y: 150, w: 200, h: 100 } })), ['the wire end at 500, 200:in1:in:1'], 'the wire end only');
  assert.deepEqual(planMarkers(d2, { rect: { x: 1000, y: 1000, w: 10, h: 10 } }), { markers: [], skipped: [] }, 'nothing there');
});

test('#4000 the wires\' open ends: the direction of the pins on their net, one marker per net, a named net\'s name; skipped ends said', () => {
  const doc = normalizeDoc({ ...newDoc('top', 'vhdl'), symbols: [sym('S1', 'and2', 200, 100, 'U1'), sym('S2', 'inv', 200, 300, 'U2', { width: 8 })],
    ports: [port('P1', 'y', 'out', 400, 500, 8)],
    wires: [
      { id: 'W1', points: [P(280, 120), P(340, 120)] },                 // U1.O -> an open end: an output, its default side
      { id: 'W2', points: [P(280, 120), P(280, 60)] },                  // U1.O again: the same net, skipped
      { id: 'W3', points: [P(200, 110), P(160, 110)] },                 // U1.I0 -> an input
      { id: 'W4', points: [P(200, 130), P(200, 180)] },                 // U1.I1 -> down: an input turned S
      { id: 'W5', points: [P(200, 310), P(120, 310)] },                 // U2.I(7:0), named d(7:0): its name and width
      { id: 'W6', points: [P(600, 100), P(700, 100)] },                 // nothing on it: skipped, both ends
      { id: 'W7', points: [P(280, 310), P(400, 310), P(400, 500)] },    // U2.O to the marker y, and on to an open end
      { id: 'W8', points: [P(400, 500), P(500, 500)] },
    ],
    labels: [{ id: 'L1', x: 160, y: 310, net: 'd(7:0)' }] });
  const plan = planMarkers(doc, { rect: ALL });
  assert.deepEqual(plan.markers.map(m => `${m.at}:${m.name}:${m.dir}:${m.width}:${m.side || ''}`), [
    'the wire end at 340, 120:out1:out:1:', 'the wire end at 160, 110:in1:in:1:', 'the wire end at 200, 180:in2:in:1:S', 'the wire end at 120, 310:d:in:8:']);
  assert.deepEqual(plan.skipped, [
    { at: 'the wire end at 280, 60', why: 'its net already gets a marker (out1)' },
    { at: 'the wire end at 600, 100', why: 'its direction is unknown (no symbol\'s pin on its net)' },
    { at: 'the wire end at 700, 100', why: 'its direction is unknown (no symbol\'s pin on its net)' },
    { at: 'the wire end at 500, 500', why: 'its net already has an I/O marker (y)' }]);
  assert.deepEqual(markersText(plan), ['4 I/O markers added: out1, in1, in2, d(7:0)',
    'WARNING: no I/O marker on the wire end at 280, 60: its net already gets a marker (out1)',
    'WARNING: no I/O marker on the wire end at 600, 100: its direction is unknown (no symbol\'s pin on its net)',
    'WARNING: no I/O marker on the wire end at 700, 100: its direction is unknown (no symbol\'s pin on its net)',
    'WARNING: no I/O marker on the wire end at 500, 500: its net already has an I/O marker (y)']);
  // added: their ids after the highest, the drawing then with no warning but W6's (a wire on nothing)
  const added = addMarkers(doc, plan.markers);
  assert.deepEqual(added.map(p => p.id), ['P2', 'P3', 'P4', 'P5']);
  assert.ok(added.every(p => !('at' in p)));
  const nl = netlist(normalizeDoc(doc));
  assert.deepEqual(nl.diagnostics.map(d => d.message), ['dangling wire not connected to any pin'], 'W6 alone');
  assert.equal(nl.portNet.get('P5'), nl.wireNet.get('W5'), 'd joins its net');
});

test('#4000 an instance\'s open pins only (its wires\' ends not); the console\'s lines of one marker and of none', () => {
  const doc = sheet('vhdl', { wires: [{ id: 'W1', points: [P(200, 110), P(160, 110)] }] });
  const plan = planMarkers(doc, { instance: 'u1' });
  assert.deepEqual(names(plan), ['U1.I1:in1:in:1', 'U1.O:out1:out:1']);
  assert.deepEqual(markersText(planMarkers(doc, { instance: 'U2', rect: { x: 270, y: 300, w: 20, h: 20 } })), ['1 I/O marker added: out1(7:0)']);
  assert.deepEqual(markersText(planMarkers(doc, { instance: 'nope' })), ['No I/O marker added: no open pin or wire end there']);
});

test('#4000 a schematic made this way: its HDL compiled, elaborated and simulated in VHDL and in Verilog, no warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet(lang);
    addMarkers(doc, planMarkers(doc, { rect: ALL }).markers);
    const d = normalizeDoc(doc);
    assert.deepEqual(netlist(d).diagnostics.map(x => x.message), [], `${lang}: no warnings`);
    const g = generateHdl(d, { lang });
    assert.deepEqual(g.diagnostics, [], lang);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const tb = lang === 'vhdl'
      ? 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n  signal in1, in2, out1 : std_logic := \'0\';\n  signal in3, out2 : std_logic_vector(7 downto 0) := (others => \'0\');\nbegin\n  uut: entity work.top port map (in1 => in1, in2 => in2, out1 => out1, in3 => in3, out2 => out2);\n  process begin\n    in1 <= \'1\'; in2 <= \'0\'; in3 <= x"5A"; wait for 10 ns;\n    assert out1 = \'0\' and out2 = x"A5" report "wrong" severity error;\n    in2 <= \'1\'; wait for 10 ns;\n    assert out1 = \'1\' report "and wrong" severity error;\n    report "done"; wait;\n  end process;\nend t;\n'
      : '`timescale 1ns/1ps\nmodule tb;\n  reg in1 = 0, in2 = 0;\n  reg [7:0] in3 = 0;\n  wire out1;\n  wire [7:0] out2;\n  top uut (.in1(in1), .in2(in2), .out1(out1), .in3(in3), .out2(out2));\n  initial begin\n    in1 = 1; in2 = 0; in3 = 8\'h5A; #10;\n    if (out1 !== 1\'b0 || out2 !== 8\'hA5) $error("wrong");\n    in2 = 1; #10;\n    if (out1 !== 1\'b1) $error("and wrong");\n    $display("done"); $finish;\n  end\nendmodule\n';
    const r = simulate([{ path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => `${e.severity}: ${e.message}`), [], `${lang}: compiled and elaborated with no warnings`);
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], `${lang}: ${log.join('\n')}`);
    assert.ok(log.some(l => /done/.test(l)), `${lang}: ran to the end`);
  }
});
