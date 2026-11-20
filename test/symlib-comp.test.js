// The palette's compositions (#4806): the comparators (#4810, core/symlib-comp.js). Their levels (COMP8 = 2 × COMP4 +
// AND2, COMP4 = 4 × XNOR2 + AND4; LT the borrow of an SUB n, the sign bits inverted when signed); every operation, width,
// signed or not, a pin per bit or not: the top's ports the symbol's pins, each level a clean schematic whose HDL compiles
// and elaborates with no warnings in VHDL and in Verilog; proved equivalent to the HDL Silinx generates for the symbol
// (Yosys) in both languages, and simulated against a model of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composition, compositionHdl, compositionModules, levelLine } from '../core/symlib.js';
import { newDoc, netlist, symbolPins, generateHdl, portBox, symbolBox } from '../core/schdoc.js';
import { wireStats } from '../core/schbeautify.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { verifyEquivalence } from '../core/verify.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const LANGS = ['vhdl', 'verilog'];
const ext = lang => (lang === 'vhdl' ? 'vhd' : 'v');
const B = [false, true];
const OPS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'eq,lt,gt', 'eq,ne,lt,le,gt,ge'];
// every operation, signed or not, a pin per bit or not, at a few widths
const variants = () => [1, 2, 5, 8, 17].flatMap(width => OPS.flatMap(op => B.flatMap(signed => B.map(bits => ['compare', { width, op, signed, bits }]))));

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

test('#4810 the levels: EQ of COMP4 blocks and an AND, LT the borrow of an SUB n, the sign bits inverted, the others from them', () => {
  const lines = (p) => composition('compare', p).modules.map(levelLine);
  assert.deepEqual(lines({ width: 8, op: 'eq' }), ['COMP8_EQ = COMP8 + BUF', 'COMP8 = 2 × COMP4 + AND2', 'COMP4 = 4 × XNOR2 + AND4']);
  assert.deepEqual(lines({ width: 64, op: 'ne' }), ['COMP64_NE = COMP64 + INV', 'COMP64 = 4 × COMP16 + AND4', 'COMP16 = 4 × COMP4 + AND4', 'COMP4 = 4 × XNOR2 + AND4']);
  assert.deepEqual(lines({ width: 5, op: 'eq' }).slice(1, 2), ['COMP5 = COMP4 + COMP1 + AND2']);
  assert.deepEqual(lines({ width: 1, op: 'eq' }), ['COMP1_EQ = COMP1 + BUF', 'COMP1 = XNOR2']);
  assert.deepEqual(lines({ width: 16, op: 'lt' }).slice(0, 2), ['COMP16_LT = SUB16_NOBI + BUF', 'SUB16_NOBI = ADD16 + 2 × INV + VCC'], 'A < B: the borrow of A − B');
  assert.deepEqual(lines({ width: 8, op: 'eq,lt,gt', signed: true })[0], 'COMP8_EQ_LT_GT_S = 3 × INV + COMP8 + SUB8_NOBI + 2 × BUF + OR2', 'signed: the sign bits inverted; GT = not (LT or EQ)');
  assert.deepEqual(lines({ width: 4, op: 'ge', bits: true })[0], 'COMP4_GE_BITS = SUB4_NOBI + INV', 'a pin per bit: joined into buses');
  assert.equal(composition('compare', { width: 4, op: 'ge', bits: true }).modules[0].doc.symbols.filter((s) => s.type === 'busjoin').length, 2);
});

test('#4810 every option: the top\'s ports the symbol\'s pins, each level clean, its HDL with no warnings (VHDL, Verilog)', () => {
  const done = new Set();
  for (const [type, p] of variants()) {
    const what = `${type} ${JSON.stringify(p)}`, c = composition(type, p);
    const pins = symbolPins({ type, x: 0, y: 0, rot: 0, mirror: false, params: p }).map(q => `${q.name}:${q.dir}:${q.width || 1}`);
    assert.deepEqual(c.modules[0].ports.map(q => `${q.name}:${q.dir}:${q.width}`).sort(), pins.sort(), what);
    const mods = compositionModules(c);
    for (const m of c.modules) {
      if (done.has(m.name)) continue;
      done.add(m.name);
      assert.deepEqual(netlist(m.doc, { modules: mods }).diagnostics, [], `${what}: ${m.name}`);
      const st = wireStats(m.doc, mods);
      assert.deepEqual([st.clashes, st.diagonals, st.crossings], [{}, 0, m.name === 'FA1' ? 3 : 0], `${what}: ${m.name}`);   // (FA1: #4807's)
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

test('#4810 proved equivalent to the symbol\'s HDL: every operation, signed and not, a pin per bit (VHDL, Verilog)', async () => {
  const cases = [...[1, 2, 4, 5, 8, 16, 17].map(width => ['compare', { width, op: 'eq,ne,lt,le,gt,ge' }]),
    ...[1, 2, 5, 8, 16].map(width => ['compare', { width, op: 'eq,ne,lt,le,gt,ge', signed: true }]),
    ['compare', { width: 32, op: 'lt,gt', signed: true }], ['compare', { width: 6, op: 'le,ge', bits: true }], ['compare', { width: 3, op: 'gt', signed: true, bits: true }], ['compare', { width: 64, op: 'ne' }]];
  for (const [type, p] of cases) for (const lang of LANGS) {
    const r = await prove(type, p, lang);
    assert.deepEqual([r.status, r.errors || []], ['proved', []], `${type} ${JSON.stringify(p)} ${lang}`);
  }
});

test('#4810 the proof bites: a signed comparator without its sign bits inverted is not equivalent', async () => {
  for (const lang of LANGS) {
    const noFlip = code => code.replace(lang === 'vhdl' ? /(\w+) <= not A\(3\);/ : /assign (\w+) = ~A\[3\];/, lang === 'vhdl' ? '$1 <= A(3);' : 'assign $1 = A[3];');
    const r = await prove('compare', { width: 4, op: 'lt', signed: true }, lang, noFlip);
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

const rng = (seed = 3) => bits => {
  let v = 0n;
  for (let i = 0; i < bits; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; v = (v << 1n) | BigInt((seed >> 16) & 1); }
  return v;
};
const bin = (v, w) => BigInt.asUintN(w, BigInt(v)).toString(2).padStart(w, '0');
const sel = (v, n, bus) => (bus ? v.S : [...Array(n).keys()].reduce((a, j) => a | (v[`S${j}`] << BigInt(j)), 0n));

const val = (v, g, n, bits) => (bits ? [...Array(n).keys()].reduce((x, i) => x | (v[`${g}${i}`] << BigInt(i)), 0n) : v[g]);
const signedOf = (x, n) => (x >> BigInt(n - 1) ? x - (1n << BigInt(n)) : x);
const CMP = { eq: (a, b) => a === b, ne: (a, b) => a !== b, lt: (a, b) => a < b, le: (a, b) => a <= b, gt: (a, b) => a > b, ge: (a, b) => a >= b };

test('#4810 simulated on random operands against a model (unsigned and two\'s complement), in VHDL and in Verilog', () => {
  const cases = [{ width: 8, op: 'eq,ne,lt,le,gt,ge' }, { width: 8, op: 'eq,ne,lt,le,gt,ge', signed: true }, { width: 5, op: 'lt,gt', signed: true, bits: true }, { width: 1, op: 'lt,ge', signed: true }, { width: 17, op: 'le' }];
  for (const p of cases) {
    const c = composition('compare', p), n = p.width, ports = c.modules[0].ports, r = rng(n);
    const vectors = Array.from({ length: 24 }, (_, k) => Object.fromEntries(ports.filter(q => q.dir === 'in').map(q => [q.name, r(q.width)])));
    // (equal operands too: every fourth vector's B its A)
    vectors.forEach((v, k) => { if (k % 4 === 0) for (const q of ports.filter(x => x.dir === 'in' && x.name.startsWith('B'))) v[q.name] = v[`A${q.name.slice(1)}`]; });
    const want = vectors.map(v => {
      let a = val(v, 'A', n, p.bits && n > 1), b = val(v, 'B', n, p.bits && n > 1);
      if (p.signed) { a = signedOf(a, n); b = signedOf(b, n); }
      return ports.filter(q => q.dir === 'out').map(q => (CMP[q.name === 'O' ? p.op : q.name.toLowerCase()](a, b) ? '1' : '0')).join(' ');
    });
    for (const lang of LANGS) {
      const s = simulate([{ path: `c.${ext(lang)}`, text: compositionHdl(c, lang).code }, { path: `tb.${ext(lang)}`, text: bench(c.top, ports, vectors, lang) }], 'tb', { until: 1e8 });
      assert.deepEqual(s.errors, [], `${lang}`);
      assert.deepEqual(s.sim.log.map(l => l.text.replace(/['"]/g, '').trim()), want, `${JSON.stringify(p)} ${lang}`);
    }
  }
});
