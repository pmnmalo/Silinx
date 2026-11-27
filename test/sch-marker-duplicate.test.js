// #4998: an I/O marker is a port of the module, drawn once. Two markers of one name (a marker duplicated, L_1, renamed L
// and joined) are one error each extra one, saying how to use the port in other places (a net name of its name), not
// three (the duplicate, the net's two drivers, the markers on the same net) for every extra one; the Join of a marker to
// a net named by another marker is not offered (core/schmarker.js markerJoin), its rename refused with that reason
// (core/schname.js renameError); a net name of the marker's name joins it, one port, in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins } from '../core/schdoc.js';
import { markerJoin } from '../core/schmarker.js';
import { renameError } from '../core/schname.js';
import { simulate } from '../core/compile.js';

const P = (x, y) => ({ x, y });
const and2 = (id, name, x, y) => ({ id, type: 'and2', x, y, rot: 0, mirror: false, name, params: {} });
// U1 and U2 (AND2), each of L (its I0) and a or b (its I1), into y and z; the second L: a marker (dup) or a net name
function sheet(lang, second = 'marker', dir = 'in') {
  const doc = normalizeDoc({ ...newDoc('top', lang), symbols: [and2('S1', 'U1', 200, 100), and2('S2', 'U2', 200, 300)] });
  const [A0, A1, AO] = symbolPins(doc.symbols[0], {}), [B0, B1, BO] = symbolPins(doc.symbols[1], {});
  doc.ports = [{ id: 'P1', name: 'L', dir, width: 1, x: A0.x - 40, y: A0.y }, { id: 'P3', name: 'a', dir: 'in', width: 1, x: A1.x, y: A1.y },
    { id: 'P4', name: 'b', dir: 'in', width: 1, x: B1.x, y: B1.y }, { id: 'P5', name: 'y', dir: 'out', width: 1, x: AO.x, y: AO.y }, { id: 'P6', name: 'z', dir: 'out', width: 1, x: BO.x, y: BO.y }];
  doc.wires = [{ id: 'W1', points: [P(A0.x - 40, A0.y), P(A0.x, A0.y)] }, { id: 'W2', points: [P(B0.x - 40, B0.y), P(B0.x, B0.y)] }];
  if (second === 'marker') doc.ports.push({ id: 'P2', name: 'L', dir, width: 1, x: B0.x - 40, y: B0.y });
  else if (second === 'copy') doc.ports.push({ id: 'P2', name: 'L_1', dir, width: 1, x: B0.x - 40, y: B0.y });
  else doc.labels = [{ id: 'L1', x: B0.x - 20, y: B0.y, net: 'L' }];
  return normalizeDoc(doc);
}
const DUP = "duplicate I/O marker 'L': an I/O marker is a port of the module, drawn once; to use L in other places, give those wires the net name L and delete this marker";

test('#4998 two input markers of one name: one error, saying how, in the netlist and the HDL, VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet(lang);
    assert.deepEqual(netlist(doc).diagnostics.map(d => [d.severity, d.message]), [['error', DUP]], lang);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => [d.severity, d.message]), [['error', DUP]], `${lang}: HDL`);
    assert.deepEqual(netlist(doc).diagnostics[0].ref, { kind: 'port', id: 'P2' });
    // two output markers of one name the same (not an assignment of the port to itself)
    const out = generateHdl(sheet(lang, 'marker', 'out'), { lang });
    assert.ok(out.diagnostics.some(d => d.message === DUP), `${lang}: outputs`);
    assert.ok(!/\bL <= L;|assign L = L;/.test(out.code || ''), `${lang}: no L = L`);
  }
});

test('#4998 markerJoin: a net named by a marker of that name is not joined; a net name\'s is; renameError says why', () => {
  const doc = sheet('vhdl', 'copy');
  const nl = netlist(doc);
  const own = nl.nets.find(n => n.ports.includes('P2'));
  assert.equal(markerJoin(doc, nl, 'L', own), null);
  assert.equal(markerJoin(doc, nl, 'l', own), null, 'any letter case in VHDL');
  assert.equal(renameError(doc, 'port', 'P2', 'L'), "'L' is already the name of another I/O marker: an I/O marker is a port of the module, drawn once; to use L in other places, give those wires the net name L. Choose another name.");
  assert.equal(renameError(doc, 'label', 'L9', 'L'), null);
  assert.equal(renameError(doc, 'sym', 'S1', 'L'), "'L' is already the name of an I/O marker: choose another name.");
  // a net named by a net name (no marker of that name): joined, as before (#2170)
  const lab = sheet('vhdl', 'label');
  lab.labels.push({ id: 'L2', x: 600, y: 600, net: 'k' });
  lab.wires.push({ id: 'W3', points: [P(580, 600), P(640, 600)] });
  const nl2 = netlist(normalizeDoc(lab));
  assert.equal(markerJoin(lab, nl2, 'k')?.name, 'k');
});

test('#4998 the way: a net name L on the other wire: one net, one port L, no errors; simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet(lang, 'label');
    const nl = netlist(doc);
    assert.deepEqual(nl.diagnostics, [], lang);
    assert.equal(nl.wireNet.get('W1'), nl.wireNet.get('W2'), `${lang}: one net`);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics, [], `${lang}: HDL`);
    assert.equal((g.code.match(lang === 'vhdl' ? /\bL : in std_logic\b/g : /\binput (wire )?L\b/g) || []).length, 1, `${lang}: one port L`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const tb = lang === 'vhdl'
      ? 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture s of tb is\n  signal L, a, b, y, z : std_logic := \'0\';\nbegin\n  uut: entity work.top port map (L => L, a => a, b => b, y => y, z => z);\n  process begin\n    L <= \'1\'; a <= \'1\'; b <= \'1\'; wait for 10 ns;\n    assert y = \'1\' and z = \'1\' report "L into both" severity failure;\n    L <= \'0\'; wait for 10 ns;\n    assert y = \'0\' and z = \'0\' report "L into both" severity failure;\n    report "done"; wait;\n  end process;\nend s;\n'
      : 'module tb;\n  reg L = 0, a = 0, b = 0; wire y, z;\n  top uut(.L(L), .a(a), .b(b), .y(y), .z(z));\n  initial begin\n    L = 1; a = 1; b = 1; #10;\n    if (!(y && z)) $fatal(1, "L into both");\n    L = 0; #10;\n    if (y || z) $fatal(1, "L into both");\n    $display("done"); $finish;\n  end\nendmodule\n';
    const r = simulate([{ path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => `${e.severity}: ${e.message}`), [], `${lang}: compiled and elaborated with no warnings`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], lang);
    assert.ok(r.sim.log.some(l => /done/.test(l.text)), `${lang}: ran to the end`);
  }
});
