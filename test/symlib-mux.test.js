// The palette's compositions (#4806): the multiplexers, decoders, demultiplexers and encoders (#4809, core/symlib-mux.js,
// core/symlib-enc.js). Their levels (M8_1 = 2 × M4_1 + M2_1, D3_8E = D1_2E + 2 × D2_4E, a demultiplexer a decoder
// enabled by its data, PENC8_3 = 2 × PENC4_2 + M2_1's); every option: the top's ports the symbol's pins, each level a
// clean schematic whose HDL compiles and elaborates with no warnings in VHDL and in Verilog; proved equivalent to the
// HDL Silinx generates for the symbol (Yosys) in both languages, and simulated against a model of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composition, compositionHdl, compositionModules, hasComposition, levelLine } from '../core/symlib.js';
import { newDoc, netlist, symbolPins, generateHdl, portBox, symbolBox } from '../core/schdoc.js';
import { wireStats } from '../core/schbeautify.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { verifyEquivalence } from '../core/verify.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const LANGS = ['vhdl', 'verilog'];
const ext = lang => (lang === 'vhdl' ? 'vhd' : 'v');
const MUXES = ['mux2', 'mux4', 'mux8', 'mux16'];
const B = [false, true];
// every option of each family, at a few widths
const variants = () => [
  ...MUXES.flatMap(t => [1, 2, 5, 8].flatMap(w => B.flatMap(en => B.flatMap(selBus => B.map(bits => [t, { width: w, en, selBus, bits }]))))),
  ...[1, 2, 3, 4, 5].flatMap(n => B.flatMap(en => B.map(bus => ['decoder', { n, en, bus }]))),
  ...[1, 2, 3, 4].flatMap(sel => [1, 3, 8].flatMap(w => B.flatMap(en => B.flatMap(selBus => B.map(bits => ['demux', { width: w, sel, en, selBus, bits }]))))),
  ...[2, 3, 4, 5].flatMap(n => ['priority', 'one-hot'].flatMap(mode => B.map(bus => ['encoder', { n, mode, bus }]))),
];

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

test('#4809 the levels: a multiplexer a tree of M2_1, a decoder of D1_2E, a demultiplexer a decoder, an encoder two halves', () => {
  const lines = (t, p) => composition(t, p).modules.map(levelLine);
  assert.deepEqual(lines('mux2', { width: 1 }), ['M2_1 = 2 × AND2 + INV + OR2']);
  assert.deepEqual(lines('mux8', { width: 1, en: true }), ['M8_1E = M8_1 + AND2', 'M8_1 = 2 × M4_1 + M2_1', 'M4_1 = 3 × M2_1', 'M2_1 = 2 × AND2 + INV + OR2']);
  assert.deepEqual(lines('mux4', { width: 8, en: true }).slice(0, 3), ['M4_1E_X8 = 2 × M4_1E_X4', 'M4_1E_X4 = 4 × M4_1E', 'M4_1E = M4_1 + AND2'], 'a bus: a bit each, four to a drawing');
  assert.deepEqual(lines('mux16', { width: 64 })[0], 'M16_1_X64 = 4 × M16_1_X16');
  assert.deepEqual(lines('mux4', { width: 2, selBus: true })[0], 'M4_1_X2_SB = 2 × M4_1');
  assert.deepEqual(lines('mux4', { width: 1, selBus: true })[0], 'M4_1_X1_SB = M4_1', 'the select a bus: joined by its bits');
  assert.deepEqual(lines('decoder', { n: 3, en: true }), ['D3_8E = 2 × D2_4E + D1_2E', 'D2_4E = 3 × D1_2E', 'D1_2E = 2 × AND2 + INV']);
  assert.deepEqual(lines('decoder', { n: 2, en: false }).slice(0, 1), ['D2_4 = D2_4E + VCC'], 'no enable: E at 1');
  assert.deepEqual(lines('decoder', { n: 2, en: true, bus: true }).slice(0, 1), ['D2_4E_BUS = D2_4E']);
  assert.deepEqual(lines('demux', { width: 1, sel: 2, en: true }).slice(0, 2), ['DMX1_4E = D2_4E + AND2', 'D2_4E = 3 × D1_2E']);
  assert.deepEqual(lines('demux', { width: 1, sel: 1 }), ['DMX1_2 = D1_2E', 'D1_2E = 2 × AND2 + INV'], 'the data the decoder\'s enable');
  assert.deepEqual(lines('encoder', { n: 2, mode: 'priority' }), ['PENC4_2 = 2 × OR2 + INV + AND2 + OR4']);
  assert.deepEqual(lines('encoder', { n: 3, mode: 'priority' }).slice(0, 1), ['PENC8_3 = 2 × PENC4_2 + 2 × M2_1 + BUF + OR2']);
  assert.deepEqual(lines('encoder', { n: 4, mode: 'one-hot' }).slice(0, 3), ['ENC16_4 = 2 × ENC8_3 + 4 × OR2 + BUF', 'ENC8_3 = 2 × ENC4_2 + 3 × OR2 + BUF', 'ENC4_2 = 2 × OR2 + OR4']);
  assert.deepEqual(['mux2', 'mux16', 'decoder', 'demux', 'encoder', 'compare', 'counter'].map(hasComposition), [true, true, true, true, true, false, false]);
  assert.equal(composition('decoder', { n: 9 }).top, 'D5_32E', 'n within the symbol\'s limits');
});

test('#4809 every option: the top\'s ports the symbol\'s pins, each level clean, its HDL with no warnings (VHDL, Verilog)', () => {
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
      assert.deepEqual([st.clashes, st.diagonals, st.crossings], [{}, 0, 0], `${what}: ${m.name}`);
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

test('#4809 proved equivalent to the symbol\'s HDL: every size, the enables, a bus, the selects as a bus, a pin per bit (VHDL, Verilog)', async () => {
  const cases = [
    ...MUXES.flatMap(t => [['mux', { width: 1, en: false }], ['mux', { width: 1, en: true }]].map(([, p]) => [t, p])),
    ['mux4', { width: 5, en: true }], ['mux8', { width: 3, selBus: true }], ['mux2', { width: 2, en: true, bits: true }], ['mux16', { width: 2, en: true, selBus: true, bits: true }],
    ...[1, 2, 3, 4, 5].map(n => ['decoder', { n, en: true }]), ['decoder', { n: 3, en: false }], ['decoder', { n: 4, en: true, bus: true }], ['decoder', { n: 1, en: false, bus: true }],
    ...[1, 2, 3, 4].map(sel => ['demux', { width: 1, sel, en: true }]), ['demux', { width: 3, sel: 2 }], ['demux', { width: 2, sel: 3, en: true, selBus: true, bits: true }],
    ...[2, 3, 4, 5].flatMap(n => [['encoder', { n, mode: 'priority' }], ['encoder', { n, mode: 'one-hot' }]]), ['encoder', { n: 3, mode: 'priority', bus: true }],
  ];
  for (const [type, p] of cases) for (const lang of LANGS) {
    const r = await prove(type, p, lang);
    assert.deepEqual([r.status, r.errors || []], ['proved', []], `${type} ${JSON.stringify(p)} ${lang}`);
  }
});

test('#4809 the proof bites: an M2_1 whose OR is an AND, a D1_2E without its inverter, are not equivalent', async () => {
  for (const lang of LANGS) {
    const or2and = code => code.replace(lang === 'vhdl' ? /O <= (\w+) or (\w+);/ : /assign O = (\w+) \| (\w+);/, lang === 'vhdl' ? 'O <= $1 and $2;' : 'assign O = $1 & $2;');
    assert.equal((await prove('mux4', { width: 1 }, lang, or2and)).status, 'failed', `${lang}: M2_1`);
    const noInv = code => code.replace(lang === 'vhdl' ? /(\w+) <= not A0;/ : /assign (\w+) = ~A0;/, lang === 'vhdl' ? '$1 <= A0;' : 'assign $1 = A0;');
    assert.equal((await prove('decoder', { n: 2, en: true }, lang, noInv)).status, 'failed', `${lang}: D1_2E`);
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

// the symbols' functions, on their bus pins (a model of the datasheets): { output: BigInt }
const MODEL = {
  mux: (p, k, v) => ({ O: p.en && !v.E ? 0n : v[`D${sel(v, Math.log2(k), p.selBus && k > 2)}`] }),
  decoder: (p, v) => {
    const a = p.bus ? v.A : [...Array(p.n).keys()].reduce((x, j) => x | (v[`A${j}`] << BigInt(j)), 0n), on = !p.en || v.E;
    return p.bus ? { D: on ? 1n << a : 0n } : Object.fromEntries([...Array(1 << p.n).keys()].map(i => [`D${i}`, on && BigInt(i) === a ? 1n : 0n]));
  },
  demux: (p, v) => { const s = sel(v, p.sel, p.selBus && p.sel > 1), on = !p.en || v.E; return Object.fromEntries([...Array(1 << p.sel).keys()].map(i => [`O${i}`, on && BigInt(i) === s ? v.D : 0n])); },
  encoder: (p, v) => {
    const m = 1 << p.n, set = [...Array(m).keys()].filter(i => (p.bus ? (v.I >> BigInt(i)) & 1n : v[`I${i}`]));
    const a = BigInt(p.mode === 'one-hot' ? set.reduce((x, i) => x | i, 0) : set.length ? Math.max(...set) : 0), V = set.length ? 1n : 0n;
    return p.bus ? { A: a, V } : { ...Object.fromEntries([...Array(p.n).keys()].map(j => [`A${j}`, (a >> BigInt(j)) & 1n])), V };
  },
};

test('#4809 simulated on random inputs against a model (O = D<S>, D<A> = E, O<S> = D, the highest input\'s index), in VHDL and in Verilog', () => {
  const cases = [['mux4', { width: 8, en: true }], ['mux8', { width: 3, selBus: true }], ['mux16', { width: 1, en: true }],
    ['decoder', { n: 3, en: true }], ['decoder', { n: 4, en: false, bus: true }], ['demux', { width: 4, sel: 2, en: true }], ['demux', { width: 1, sel: 3, selBus: true }],
    ['encoder', { n: 3, mode: 'priority' }], ['encoder', { n: 4, mode: 'one-hot', bus: true }], ['encoder', { n: 5, mode: 'priority' }]];
  for (const [type, p0] of cases) {
    const c = composition(type, p0), p = { en: false, selBus: false, bus: false, ...p0 }, ports = c.modules[0].ports, r = rng(7);
    const vectors = Array.from({ length: 24 }, () => Object.fromEntries(ports.filter(q => q.dir === 'in').map(q => [q.name, r(q.width)])));
    // (an encoder's inputs: few at 1, so that the lower ones count too)
    if (type === 'encoder') for (const v of vectors) for (const k of Object.keys(v)) v[k] &= r(p.bus ? 1 << p.n : 1) & r(p.bus ? 1 << p.n : 1);
    const model = type.startsWith('mux') ? v => MODEL.mux(p, { mux2: 2, mux4: 4, mux8: 8, mux16: 16 }[type], v) : v => MODEL[type](p, v);
    const want = vectors.map(v => { const o = model(v); return ports.filter(q => q.dir === 'out').map(q => bin(o[q.name], q.width)).join(' '); });
    for (const lang of LANGS) {
      const s = simulate([{ path: `c.${ext(lang)}`, text: compositionHdl(c, lang).code }, { path: `tb.${ext(lang)}`, text: bench(c.top, ports, vectors, lang) }], 'tb', { until: 1e8 });
      assert.deepEqual(s.errors, [], `${type} ${lang}`);
      assert.deepEqual(s.sim.log.map(l => l.text.replace(/['"]/g, '').trim()), want, `${type} ${JSON.stringify(p0)} ${lang}`);
    }
  }
});
