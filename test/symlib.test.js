// The palette's compositions (#4806, core/symlib.js): the adders and subtractors (#4807, core/symlib-add.js). Every
// width and option: the levels it is made of (ADD8 = 2 × ADD4, ADD4 = 4 × FA1, FA1 = gates), its top's ports the
// symbol's pins, each level a clean schematic (no warnings, no clash, nothing off the sheet or overlapping) whose HDL
// compiles and elaborates with no warnings in VHDL and in Verilog; proved equivalent to the HDL Silinx generates for
// the symbol (verifyEquivalence, Yosys), in both languages, and simulated against a model of it on random operands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composition, compositionHdl, hasComposition, levelLine, levelParts } from '../core/symlib.js';
import { addBlocks } from '../core/symlib-add.js';
import { newDoc, netlist, symbolPins, generateHdl, portBox, symbolBox } from '../core/schdoc.js';
import { wireStats } from '../core/schbeautify.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { verifyEquivalence } from '../core/verify.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const LANGS = ['vhdl', 'verilog'];
const ext = lang => (lang === 'vhdl' ? 'vhd' : 'v');
const opts = (type, w, a, b, bits) => (type === 'add' ? { width: w, cin: a, cout: b, bits } : { width: w, bin: a, bout: b, bits });
const every = (types, widths) => types.flatMap(t => widths.flatMap(w => [false, true].flatMap(a => [false, true].flatMap(b => [false, true].map(bits => [t, opts(t, w, a, b, bits)])))));
const modulesOf = c => Object.fromEntries(c.modules.map(m => [m.name, { name: m.name, ports: m.ports.map(({ side, ...q }) => q), symbol: m.symbol }]));

// a one-symbol schematic of the palette's symbol, its markers on its pins: the HDL Silinx generates for it (the reference)
function reference(type, params, lang) {
  const doc = newDoc('beh', lang);
  const s = { id: 'S1', type, x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params };
  doc.symbols.push(s);
  for (const q of symbolPins(s)) doc.ports.push({ id: `P${doc.ports.length + 1}`, name: q.name, dir: q.dir, width: q.width || 1, x: q.x, y: q.y });
  const g = generateHdl(doc, { lang });
  assert.deepEqual(g.diagnostics, [], `${type} ${lang}: the reference`);
  return g.code;
}

test('#4807 the levels: ADD n of at most four blocks (FA1, ADD4, ADD16 …), SUB n an adder with B inverted; no other family yet', () => {
  assert.deepEqual(addBlocks(10), [{ w: 4, lsb: 0 }, { w: 4, lsb: 4 }, { w: 2, lsb: 8 }]);
  const lines = (t, p) => composition(t, p).modules.map(levelLine);
  assert.deepEqual(lines('add', { width: 8, cin: true, cout: true }), ['ADD8 = 2 × ADD4', 'ADD4 = 4 × FA1', 'FA1 = 2 × XOR2 + 2 × AND2 + OR2']);
  assert.deepEqual(lines('add', { width: 1, cin: true, cout: true }), ['FA1 = 2 × XOR2 + 2 × AND2 + OR2'], 'ADD1 is FA1');
  assert.deepEqual(lines('add', { width: 10 }), ['ADD10_NOCI_NOCO = ADD2 + 2 × ADD4 + GND', 'ADD2 = 2 × FA1', 'FA1 = 2 × XOR2 + 2 × AND2 + OR2', 'ADD4 = 4 × FA1']);
  assert.deepEqual(lines('add', { width: 1024, cin: true, cout: true }), ['ADD1024 = 4 × ADD256', 'ADD256 = 4 × ADD64', 'ADD64 = 4 × ADD16', 'ADD16 = 4 × ADD4', 'ADD4 = 4 × FA1', 'FA1 = 2 × XOR2 + 2 × AND2 + OR2']);
  assert.deepEqual(lines('add', { width: 32, cin: true, cout: true }).slice(0, 2), ['ADD32 = 2 × ADD16', 'ADD16 = 4 × ADD4']);
  assert.deepEqual(lines('sub', { width: 8, bin: true, bout: true }), ['SUB8 = ADD8 + 3 × INV', 'ADD8 = 2 × ADD4', 'ADD4 = 4 × FA1', 'FA1 = 2 × XOR2 + 2 × AND2 + OR2']);
  assert.deepEqual(lines('sub', { width: 3 }), ['SUB3_NOBI_NOBO = ADD3 + INV + VCC', 'ADD3 = 3 × FA1', 'FA1 = 2 × XOR2 + 2 × AND2 + OR2'], 'no borrow in: the carry in is 1');
  assert.deepEqual(lines('add', { width: 4, cin: true, cout: true, bits: true }).slice(0, 2), ['ADD4_BITS = ADD4', 'ADD4 = 4 × FA1'], 'a pin per bit: the bus form between joins and taps');
  const c = composition('add', { width: 16 });
  assert.equal(c.symbol, 'ADD16');
  assert.deepEqual(levelParts(c.modules[0]), [{ name: 'ADD4', count: 4, module: true }, { name: 'GND', count: 1, module: false }]);
  assert.deepEqual(['add', 'sub', 'and2', 'fdce', 'register'].map(hasComposition), [true, true, false, false, false]);
  assert.equal(composition('register', {}), null);
  assert.equal(composition('add', { width: 5, cin: true }).top, 'ADD5_NOCO', 'the defaults for the parameters left out');
});

test('#4807 every width and option: the top\'s ports the symbol\'s pins, each level clean, its HDL with no warnings (VHDL, Verilog)', () => {
  const done = new Set();
  for (const [type, p] of every(['add', 'sub'], [1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 32, 33])) {
    const what = `${type} ${JSON.stringify(p)}`, c = composition(type, p);
    const pins = symbolPins({ type, x: 0, y: 0, rot: 0, mirror: false, params: p }).map(q => `${q.name}:${q.dir}:${q.width || 1}`);
    assert.deepEqual(c.modules[0].ports.map(q => `${q.name}:${q.dir}:${q.width}`).sort(), pins.sort(), what);
    const mods = modulesOf(c);
    for (const m of c.modules) {
      if (done.has(m.name)) continue;
      done.add(m.name);
      assert.deepEqual(netlist(m.doc, { modules: mods }).diagnostics, [], `${what}: ${m.name}`);
      const st = wireStats(m.doc, mods);
      // (FA1: the Schematic Wizard's full adder, its fan-outs crossing)
      assert.deepEqual([st.clashes, st.diagonals, st.crossings], [{}, 0, m.name === 'FA1' ? 3 : 0], `${what}: ${m.name}`);
      const boxes = [...m.doc.ports.map(portBox), ...m.doc.symbols.map(s => symbolBox(s, mods))];
      for (const b of boxes) assert.ok(b.x >= 10 && b.y >= 10 && b.x + b.w <= m.doc.sheet.w - 10 && b.y + b.h <= m.doc.sheet.h - 10, `${m.name}: on the sheet ${JSON.stringify(b)}`);
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${m.name}: overlap ${JSON.stringify([a, b])}`)));
    }
    for (const lang of LANGS) {
      const h = compositionHdl(c, lang);
      assert.deepEqual(h.diagnostics, [], `${what} ${lang}`);
      const lib = compile([{ path: `c.${ext(lang)}`, lang, text: h.code }]);
      const design = elaborate(lib, c.top);
      assert.deepEqual([...lib.errors, ...design.diags, ...designChecks(lib, design, { lint: true })].map(d => `${d.severity}: ${d.message}`), [], `${what} ${lang}`);
    }
  }
});

// the composition against the symbol's own HDL, in `lang`: verifyEquivalence's result
async function prove(type, p, lang, mutate = x => x) {
  const c = composition(type, p);
  const src = [{ path: `src/c.${ext(lang)}`, lang, text: mutate(compositionHdl(c, lang).code) }, { path: `src/r.${ext(lang)}`, lang, text: reference(type, p, lang) }];
  return verifyEquivalence(src, { top: c.top, reference: 'beh', depth: 1, run: yosysNode });
}

test('#4807 proved equivalent to the symbol\'s HDL: every option at 8 bits, the widths around the blocks\' sizes, in VHDL and in Verilog', async () => {
  const cases = [...every(['add', 'sub'], [8]),
    ...[1, 2, 3, 4, 5, 9, 16, 17, 33, 64].map(w => ['add', opts('add', w, true, true, false)]),
    ...[1, 4, 12, 32].map(w => ['sub', opts('sub', w, true, true, false)]),
    ['add', opts('add', 13, false, false, false)], ['sub', opts('sub', 6, false, true, true)]];
  for (const [type, p] of cases) for (const lang of LANGS) {
    const r = await prove(type, p, lang);
    assert.deepEqual([r.status, r.errors || []], ['proved', []], `${type} ${JSON.stringify(p)} ${lang}`);
  }
});

test('#4807 the proof bites: an FA1 whose carry is an AND of its half adders\' is not equivalent', async () => {
  const p = opts('add', 4, true, true, false);
  for (const lang of LANGS) {
    const r = await prove('add', p, lang, code => code.replace(lang === 'vhdl' ? /CO <= (\w+) or (\w+);/ : /assign CO = (\w+) \| (\w+);/, lang === 'vhdl' ? 'CO <= $1 and $2;' : 'assign CO = $1 & $2;'));
    assert.equal(r.status, 'failed', lang);
  }
});

// a test bench of module `top` (its ports): each vector its inputs set, then its outputs printed in binary
function bench(top, ports, vectors, lang) {
  const ins = ports.filter(q => q.dir === 'in'), outs = ports.filter(q => q.dir === 'out');
  const bits = (v, w) => BigInt.asUintN(w, BigInt(v)).toString(2).padStart(w, '0');
  if (lang === 'vhdl') {
    const type = q => (q.width > 1 ? `std_logic_vector(${q.width - 1} downto 0)` : 'std_logic');
    const lit = (v, w) => (w > 1 ? `"${bits(v, w)}"` : `'${bits(v, 1)}'`);
    const show = q => (q.width > 1 ? `to_string(${q.name})` : `std_logic'image(${q.name})`);
    return `library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is\n${ports.map(q => ` signal ${q.name} : ${type(q)};`).join('\n')}\nbegin\n u : entity work.${top} port map (${ports.map(q => `${q.name} => ${q.name}`).join(', ')});\n process begin\n${vectors.map(v => `${ins.map(q => ` ${q.name} <= ${lit(v[q.name], q.width)};`).join('')} wait for 1 ns; report ${outs.map(show).join(' & " " & ')};`).join('\n')}\n wait;\n end process;\nend;`;
  }
  const decl = (q, k) => `${k} ${q.width > 1 ? `[${q.width - 1}:0] ` : ''}${q.name};`;
  return `module tb;\n${ins.map(q => decl(q, 'reg')).join(' ')} ${outs.map(q => decl(q, 'wire')).join(' ')}\n ${top} u(${ports.map(q => `.${q.name}(${q.name})`).join(', ')});\n initial begin\n${vectors.map(v => `${ins.map(q => ` ${q.name} = ${q.width}'b${bits(v[q.name], q.width)};`).join('')} #1; $display("${outs.map(() => '%b').join(' ')}", ${outs.map(q => q.name).join(', ')});`).join('\n')}\n end\nendmodule`;
}

// a repeatable pseudo-random generator
const rng = (seed = 7) => bits => {
  let v = 0n;
  for (let i = 0; i < bits; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; v = (v << 1n) | BigInt((seed >> 16) & 1); }
  return v;
};
const bin = (v, w) => BigInt.asUintN(w, BigInt(v)).toString(2).padStart(w, '0');

test('#4807 simulated on random operands against a model (A + B + CI; A − B − BI, its borrow), in VHDL and in Verilog', () => {
  const cases = [['add', opts('add', 8, true, true, false)], ['add', opts('add', 13, false, false, false)], ['add', opts('add', 4, true, false, true)],
    ['sub', opts('sub', 8, true, true, false)], ['sub', opts('sub', 5, false, true, false)], ['sub', opts('sub', 3, true, true, true)]];
  for (const [type, p] of cases) {
    const n = p.width, c = composition(type, p), ports = c.modules[0].ports, r = rng(n);
    const ci = type === 'add' ? 'CI' : 'BI', co = type === 'add' ? 'CO' : 'BO', out = type === 'add' ? 'S' : 'D';
    const vectors = Array.from({ length: 24 }, () => ({ A: r(n), B: r(n), [ci]: r(1) }));
    // (a pin per bit: each operand's bits on their own pins)
    if (p.bits) for (const v of vectors) for (let i = 0; i < n; i++) { v[`A${i}`] = (v.A >> BigInt(i)) & 1n; v[`B${i}`] = (v.B >> BigInt(i)) & 1n; }
    const want = vectors.map(v => {
      const cin = (type === 'add' ? p.cin : p.bin) ? v[ci] : 0n;
      const t = type === 'add' ? v.A + v.B + cin : v.A - v.B - cin;
      const res = bin(t, n), carry = type === 'add' ? (t >> BigInt(n)) & 1n : (t < 0n ? 1n : 0n);
      return ports.filter(q => q.dir === 'out').map(q => (q.name === co ? String(carry) : q.name === out ? res : res[n - 1 - Number(q.name.slice(1))])).join(' ');
    });
    for (const lang of LANGS) {
      const s = simulate([{ path: `c.${ext(lang)}`, text: compositionHdl(c, lang).code }, { path: `tb.${ext(lang)}`, text: bench(c.top, ports, vectors, lang) }], 'tb', { until: 1e8 });
      assert.deepEqual(s.errors, [], `${type} ${lang}`);
      assert.deepEqual(s.sim.log.map(l => l.text.replace(/['"]/g, '').trim()), want, `${type} ${JSON.stringify(p)} ${lang}`);
    }
  }
});
