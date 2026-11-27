// The examples' registers that ISE's XST would leave unconnected (#5654): a register whose bits feed nothing, or one
// XST moves into the multipliers it feeds but still reads elsewhere, warns Xst:2677 ("Node <…> of sequential type is
// unconnected"), and the examples build in ISE with no warnings. Yosys trims such bits silently, so the open flows'
// tests do not see them: these check the sources. ISE's own runs: test/ise/examples.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cToHdl } from '../core/c-hdl.js';
import { isPsPath } from '../core/zynq-ps.js';

const read = (f) => fs.readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8');

// stopwatch's to_decimal (#4877 registered its value before the multipliers): one register shared by the three
// multipliers and read for its last 4 bits left x_4 .. x_13 unconnected on the Spartan-3E's and the Spartan-3A's
test('#5654 stopwatch: each register of to_decimal that a multiplier reads is read by that multiplier alone', () => {
  const text = read('stopwatch/src/to_decimal.vhd').replace(/--.*$/gm, '');
  const body = text.slice(text.indexOf('rising_edge'));
  const operands = [...body.matchAll(/quotient\((\w+),/g)].map((m) => m[1]);
  assert.deepEqual(operands, ['x1', 'x2', 'x3']);
  for (const x of operands) {
    assert.match(body, new RegExp(`\\b${x} <= value;`), x);   // the value, registered whole
    assert.equal(body.match(new RegExp(`\\b${x}\\b`, 'g')).length, 2, `${x}: written once, read by its multiplier alone`);
  }
  // the value's last 4 bits: a register of their own
  assert.match(body, /\bx0 <= value\(3 downto 0\);/);
  assert.match(body, /\bv {2}<= x0;/);
});

// lock's typed.cpp: a register of the four digits shifted left kept the oldest digit's bits, shifted out at the next
// call (ap_r_digits_12 .. _15 unconnected on every board); its static variable is the last three digits
test('#5654 lock: typed\'s registers, in VHDL and in Verilog: the last three digits (12 bits) and shown\'s', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cToHdl(read('lock/src/typed.cpp'), { file: 'src/typed.cpp', lang });
    assert.deepEqual(r.diagnostics, [], lang);
    const regs = lang === 'vhdl'
      ? [...r.hdl.matchAll(/signal (ap_r_\w+) : unsigned\((\d+) downto 0\)/g)].map((m) => [m[1], +m[2] + 1])
      : [...r.hdl.matchAll(/reg \[(\d+):0\] (ap_r_\w+);/g)].map((m) => [m[2], +m[1] + 1]);
    // (running by itself since #5841: its arguments read each cycle, no register of them)
    assert.deepEqual(regs, [['ap_r_shown_reg', 16], ['ap_r_last', 12], ['ap_r_shown_vld_reg', 1]], lang);
  }
});

// The examples' C and C++ modules as XST reads them (#5841): lock's penalty kept its table of constants in registers only
// the reset loads (Xst:1710, 1895, 2404: "FF/Latch <ap_r_SECONDS_…> has a constant value"), typed widened a signal only
// to shift its top bits out (Xst:646: "Signal <ap_t11<15:12>> is assigned but never used"), and the top left their
// ap_done, ap_idle and ap_ready open (Xst:753: "Unconnected output port"). Each mirrored here on the generated HDL.
// (the HLS's sources: not a Zynq's PS program, the C of a node's or a Board project's ps/ folder, which the PL's build
// leaves out, core/zynq-ps.js)
const SOURCES = execFileSync('git', ['ls-files', 'examples/*.c', 'examples/*.cpp'], { encoding: 'utf8', cwd: new URL('..', import.meta.url) }).trim().split('\n')
  .map((f) => f.slice('examples/'.length)).filter((f) => { const rel = f.split('/').slice(1); return !isPsPath(rel.join('/')) && !isPsPath(rel.slice(1).join('/')); });

/** The registers of a module's HDL that only the reset writes (constant flip-flops, XST's Xst:1710, 1895, 2404). */
export function constantRegisters(hdl, lang) {
  const regs = lang === 'vhdl' ? [...hdl.matchAll(/signal (ap_r_\w+) :/g)].map((m) => m[1]) : [...hdl.matchAll(/reg (?:signed )?\[\d+:0\] (ap_r_\w+);/g)].map((m) => m[1]);
  return regs.filter((r) => (hdl.match(new RegExp(`\\b${r} <=`, 'g')) || []).length < 2);
}

/** The bits of a generated VHDL module's signals that nothing reads (XST's Xst:646), as <name<hi:lo>>: a signal read
 *  whole, by a slice (x(h downto l), x(i)), or shifted left by a constant into a signal as wide (its top bits out). */
export function unreadBits(hdl) {
  const width = new Map([...hdl.matchAll(/signal (\w+) : (?:unsigned|signed)\((\d+) downto 0\)/g)].map((m) => [m[1], +m[2] + 1]));
  const read = new Map([...width.keys()].map((n) => [n, new Set()]));
  const all = (n, lo, hi) => { for (let k = lo; k <= hi; k++) read.get(n).add(k); };
  const body = hdl.slice(hdl.indexOf('\nbegin'));
  for (const line of body.split('\n')) {
    const lhs = /^\s*(\w+)(?:\(\d+\))? <= (.*)$/.exec(line);
    let rhs = lhs ? lhs[2] : line;
    // a constant shift left into a signal of the same width: the operand's top bits not read
    rhs = rhs.replace(/shift_left\((\w+), (\d+)\)/g, (m, n, k) => {
      if (width.has(n) && lhs && width.get(lhs[1]) === width.get(n)) { all(n, 0, width.get(n) - 1 - +k); return ''; }
      return m;
    });
    rhs = rhs.replace(/\b(\w+)\((\d+) downto (\d+)\)/g, (m, n, h, l) => { if (width.has(n)) { all(n, +l, +h); return ''; } return m; });
    rhs = rhs.replace(/\b(\w+)\((\d+)\)/g, (m, n, i) => { if (width.has(n)) { all(n, +i, +i); return ''; } return m; });
    for (const n of width.keys()) if (new RegExp(`\\b${n}\\b`).test(rhs)) all(n, 0, width.get(n) - 1);
  }
  const out = [];
  for (const [n, w] of width) {
    const miss = Array.from({ length: w }, (_, k) => k).filter((k) => !read.get(n).has(k));
    if (miss.length) out.push(`${n}<${Math.max(...miss)}:${Math.min(...miss)}>`);
  }
  return out;
}

test('#5841 the mirrors: a register only the reset writes, a signal\'s bits shifted out, found', () => {
  const vhdl = `architecture behav of m is
  signal ap_r_k : unsigned(3 downto 0);
  signal ap_r_v : unsigned(3 downto 0);
  signal ap_t1 : unsigned(15 downto 0);
  signal ap_t2 : unsigned(15 downto 0);
  signal ap_t3 : unsigned(11 downto 0);
begin
  ap_t1 <= unsigned(resize(ap_t3, 16));
  ap_t2 <= shift_left(ap_t1, 4);
  process (ap_clk) begin if rising_edge(ap_clk) then if ap_rst = '1' then ap_r_k <= "0011"; ap_r_v <= "0000";
  else ap_r_v <= ap_t2(3 downto 0) + ap_r_k; end if; end if; end process;
  y <= std_logic_vector(ap_t2(15 downto 4)) & std_logic_vector(ap_r_v);
end behav;`;
  assert.deepEqual(constantRegisters(vhdl, 'vhdl'), ['ap_r_k']);
  assert.deepEqual(unreadBits(vhdl), ['ap_t1<15:12>']);
  assert.deepEqual(unreadBits(vhdl.replace('shift_left(ap_t1, 4)', 'shift_left(resize(ap_t3, 16), 4)').replace('  ap_t1 <= unsigned(resize(ap_t3, 16));\n', '')), ['ap_t1<15:0>']);
});

test('#5841 the examples\' C and C++ modules: no register of a constant value, no bit of a signal unread; their block protocol\'s outputs not left open', () => {
  assert.ok(SOURCES.includes('lock/src/penalty.c') && SOURCES.includes('lock/src/typed.cpp'), SOURCES.join(' '));
  assert.ok(!SOURCES.some((f) => /\/ps\//.test(f)), SOURCES.join(' '));   // (uart-zynq's zybo/ps/main.c: the PS's)
  for (const f of SOURCES) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cToHdl(read(f), { file: f, lang });
      assert.deepEqual(r.diagnostics, [], `${f} ${lang}`);
      assert.deepEqual(constantRegisters(r.hdl, lang), [], `${f} ${lang}: registers of a constant value`);
      if (lang === 'vhdl') assert.deepEqual(unreadBits(r.hdl), [], `${f}: signals' bits never read`);
    }
  }
  // lock's two: penalty logic alone, typed running by itself, neither with a block protocol to connect
  const ports = (f) => cToHdl(read(f), { file: f, lang: 'vhdl' }).ports.map((p) => p.name);
  assert.deepEqual(ports('lock/src/penalty.c'), ['fails', 'ap_return']);
  assert.deepEqual(ports('lock/src/typed.cpp'), ['ap_clk', 'ap_rst', 'call', 'clear', 'digit', 'shown', 'shown_ap_vld']);
  const tops = execFileSync('git', ['ls-files', 'examples/*.vhd', 'examples/*.v'], { encoding: 'utf8', cwd: new URL('..', import.meta.url) }).trim().split('\n');
  for (const t of tops) {
    const text = read(t.slice('examples/'.length)).replace(/--.*$|\/\/.*$/gm, '');
    assert.doesNotMatch(text, /\bap_(done|idle|ready)\s*=>\s*open\b|\.ap_(done|idle|ready)\(\s*\)/i, t);
  }
});
