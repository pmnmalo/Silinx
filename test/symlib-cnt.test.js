// The palette's compositions (#4806): the counters (#4811, core/symlib-cnt.js). Their levels (CB8CE = an FDCE of 8 bits
// and an INC8, INC8 = 2 × INC4, INC4 = 4 × HA, HA = XOR2 + AND2; a down counter's DEC of half subtractors); every
// width, enable, reset, direction, pin per bit: the top's ports the symbol's pins, each level a clean schematic whose
// HDL compiles and elaborates with no warnings in VHDL and in Verilog; proved equivalent to the HDL Silinx generates for
// the symbol (Yosys, sequentially) in both languages, and simulated clock edge by clock edge against a model of it.
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
const RESETS = ['none', 'async', 'sync'];
// every enable, reset, direction, pin per bit, at a few widths
const variants = () => [1, 2, 4, 5, 8, 16, 17].flatMap(width => B.flatMap(en => RESETS.flatMap(reset => ['up', 'down'].flatMap(dir => B.map(bits => ['counter', { width, en, reset, dir, bits }])))));

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

test('#4811 the levels: a register and an incrementer of half adders (a decrementer of half subtractors)', () => {
  const lines = (p) => composition('counter', p).modules.map(levelLine);
  assert.deepEqual(lines({ width: 8, en: true, reset: 'async', dir: 'up' }), ['CB8CE = INC8 + VCC + FDCE', 'INC8 = 2 × INC4', 'INC4 = 4 × HA', 'HA = XOR2 + AND2']);
  assert.deepEqual(lines({ width: 16, en: true, reset: 'sync', dir: 'down' }), ['CB16DRE = DEC16 + VCC + FDRE', 'DEC16 = 4 × DEC4', 'DEC4 = 4 × HS', 'HS = XOR2 + AND2 + INV']);
  assert.deepEqual(lines({ width: 1, en: false, reset: 'none', dir: 'up' }), ['CB1 = HA + VCC + FD', 'HA = XOR2 + AND2']);
  assert.deepEqual(lines({ width: 32, en: true, reset: 'none', dir: 'up' }).slice(0, 2), ['CB32E = INC32 + VCC + FDE', 'INC32 = 2 × INC16']);
  assert.deepEqual(lines({ width: 4, en: true, reset: 'async', dir: 'up', bits: true })[0], 'CB4CE_BITS = INC4 + VCC + FDCE', 'a pin per bit: the count\'s bus tapped');
  assert.equal(composition('counter', { width: 4, bits: true }).modules[0].doc.symbols.filter((s) => s.type === 'slice').length, 4);
});

test('#4811 every option: the top\'s ports the symbol\'s pins, each level clean, its HDL with no warnings (VHDL, Verilog)', () => {
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
  return verifyEquivalence(src, { top: c.top, reference: 'beh', depth: 8, run: yosysNode });
}

test('#4811 proved equivalent to the symbol\'s HDL, clock edge by clock edge: every reset, direction, enable (VHDL, Verilog)', async () => {
  const cases = [...[1, 4, 8, 17].map(width => ['counter', { width, en: true, reset: 'async', dir: 'up' }]),
    ...RESETS.flatMap(reset => ['up', 'down'].map(dir => ['counter', { width: 5, en: true, reset, dir }])),
    ['counter', { width: 16, en: false, reset: 'sync', dir: 'down' }], ['counter', { width: 6, en: true, reset: 'none', dir: 'up', bits: true }]];
  for (const [type, p] of cases) for (const lang of LANGS) {
    const r = await prove(type, p, lang);
    assert.deepEqual([r.status, r.errors || []], ['proved', []], `${type} ${JSON.stringify(p)} ${lang}`);
  }
});

test('#4811 the proof bites: a half subtractor whose borrow does not invert A is not equivalent', async () => {
  for (const lang of LANGS) {
    const noInv = code => code.replace(lang === 'vhdl' ? /(\w+) <= not A;/ : /assign (\w+) = ~A;/, lang === 'vhdl' ? '$1 <= A;' : 'assign $1 = A;');
    assert.equal((await prove('counter', { width: 4, en: true, reset: 'sync', dir: 'down' }, lang, noInv)).status, 'failed', lang);
  }
});

// a test bench of module `top`: each vector its controls set, then a clock pulse on C, then its outputs printed in binary
function bench(top, ports, vectors, lang) {
  const ins = ports.filter(q => q.dir === 'in' && q.name !== 'C'), outs = ports.filter(q => q.dir === 'out');
  const bits = (v, w) => BigInt.asUintN(w, BigInt(v)).toString(2).padStart(w, '0');
  if (lang === 'vhdl') {
    const type = q => (q.width > 1 ? `std_logic_vector(${q.width - 1} downto 0)` : 'std_logic');
    const show = q => (q.width > 1 ? `to_string(${q.name})` : `std_logic'image(${q.name})`);
    return `library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is\n${ports.map(q => ` signal ${q.name} : ${type(q)};`).join('\n')}\nbegin\n u : entity work.${top} port map (${ports.map(q => `${q.name} => ${q.name}`).join(', ')});\n process begin\n C <= '0';\n${vectors.map(v => `${ins.map(q => ` ${q.name} <= '${bits(v[q.name], 1)}';`).join('')} wait for 1 ns; C <= '1'; wait for 1 ns; C <= '0'; wait for 1 ns; report ${outs.map(show).join(' & " " & ')};`).join('\n')}\n wait;\n end process;\nend;`;
  }
  const decl = (q, k) => `${k} ${q.width > 1 ? `[${q.width - 1}:0] ` : ''}${q.name};`;
  return `module tb;\n${[...ins, { name: 'C', width: 1 }].map(q => decl(q, 'reg')).join(' ')} ${outs.map(q => decl(q, 'wire')).join(' ')}\n ${top} u(${ports.map(q => `.${q.name}(${q.name})`).join(', ')});\n initial begin\n C = 0;\n${vectors.map(v => `${ins.map(q => ` ${q.name} = 1'b${bits(v[q.name], 1)};`).join('')} #1; C = 1; #1; C = 0; #1; $display("${outs.map(() => '%b').join(' ')}", ${outs.map(q => q.name).join(', ')});`).join('\n')}\n end\nendmodule`;
}

const rng = (seed = 3) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed >> 16) & 1; };

test('#4811 simulated clock edge by clock edge against a model (Q ± 1 while CE, cleared by CLR or R, past its end), in VHDL and in Verilog', () => {
  const cases = [{ width: 4, en: true, reset: 'async', dir: 'up' }, { width: 3, en: true, reset: 'sync', dir: 'down' }, { width: 5, en: false, reset: 'none', dir: 'up', bits: true }, { width: 1, en: true, reset: 'sync', dir: 'up' }];
  for (const p of cases) {
    const c = composition('counter', p), n = p.width, M = (1n << BigInt(n)) - 1n, ports = c.modules[0].ports, r = rng(n);
    // (the clear or reset rarely, the enable mostly on: the count goes round)
    const vectors = Array.from({ length: 48 }, () => ({ CE: r() | r() | r() ? 1 : 0, CLR: r() & r() & r() & r() ? 1 : 0, R: r() & r() & r() & r() ? 1 : 0 }));
    let q = 0n;
    const want = vectors.map(v => {
      if ((p.reset === 'async' && v.CLR) || (p.reset === 'sync' && v.R)) q = 0n;
      else if (!p.en || v.CE) q = (p.dir === 'down' ? q - 1n : q + 1n) & M;
      const b = q.toString(2).padStart(n, '0');
      return p.bits && n > 1 ? [...Array(n).keys()].map(i => b[n - 1 - i]).join(' ') : b;
    });
    for (const lang of LANGS) {
      const s = simulate([{ path: `c.${ext(lang)}`, text: compositionHdl(c, lang).code }, { path: `tb.${ext(lang)}`, text: bench(c.top, ports, vectors, lang) }], 'tb', { until: 1e8 });
      assert.deepEqual(s.errors, [], `${lang}`);
      assert.deepEqual(s.sim.log.map(l => l.text.replace(/['"]/g, '').trim()), want, `${JSON.stringify(p)} ${lang}`);
    }
  }
});
