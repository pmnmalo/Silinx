// An ASM chart's register whose width is an expression of the chart's generics (#4378, core/asm-width.js): its syntax
// and value, the chart's Check (the exact errors and warnings), the generated VHDL and Verilog (compiled, elaborated,
// simulated at several generics' values, the same as a reference and as the chart's simulator), the chart recovered
// from them and from hand-written HDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, validate, generate } from '../core/asm.js';
import { clog2, evalWidth, parseWidth, registerWidth, widthCode, widthValue } from '../core/asm-width.js';
import { asmFromHdl, sameAsmStructure } from '../core/asm-from-hdl.js';
import { prepareAsmSim, asmSimReset, asmSimStep } from '../core/asm-sim.js';
import { compile, elaborate, simulate } from '../core/compile.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** A divider: cnt (clog2(N) bits) counts the enabled cycles, tc on the last; sh (N + 1 bits) fills with ones; y = cnt. */
const divider = () => ({
  version: 1, name: 'divider', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
  generics: [{ name: 'N', default: 5 }],
  inputs: [{ name: 'en', width: 1 }],
  outputs: [{ name: 'tc', width: 1, default: '0' }, { name: 'y', width: 4, default: '0' }, { name: 'top', width: 1, default: '0' }],
  registers: [{ name: 'cnt', width: 'clog2(N)', init: '0' }, { name: 'sh', width: 'N + 1', init: '0' }],
  nodes: [
    { id: 's1', type: 'state', name: 'COUNT', x: 200, y: 80, actions: ['y = cnt', 'top = sh[1]', 'sh = (sh << 1) | 1'] },
    { id: 'd1', type: 'decision', x: 200, y: 180, cond: 'en' },
    { id: 'd2', type: 'decision', x: 200, y: 280, cond: 'cnt == N - 1' },
    { id: 'o1', type: 'output', x: 120, y: 380, actions: ['tc', 'cnt = 0'] },
    { id: 'o2', type: 'output', x: 280, y: 380, actions: ['cnt = cnt + 1'] },
  ],
  edges: [{ from: 's1', to: 'd1' }, { from: 'd1', to: 'd2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
    { from: 'd2', to: 'o1', port: 'true' }, { from: 'd2', to: 'o2', port: 'false' }, { from: 'o1', to: 's1' }, { from: 'o2', to: 's1' }],
  initial: 's1',
});

/** The divider's outputs per cycle (tc_y_top, binary), before each clock edge, for the enables `ens` at the generic N. */
function reference(n, ens) {
  const wc = clog2(n), wsh = n + 1;
  let cnt = 0, sh = 0;
  return ens.map((en) => {
    const out = `${en && cnt === n - 1 ? 1 : 0}_${(cnt & 15).toString(2).padStart(4, '0')}_${(sh >> 1) & 1}`;
    sh = ((sh << 1) | 1) & ((1 << wsh) - 1);
    if (en) cnt = cnt === n - 1 ? 0 : (cnt + 1) & ((1 << wc) - 1);
    return out;
  });
}

const enables = Array.from({ length: 60 }, (_, k) => (k % 7 === 3 ? 0 : 1));

function runHdl(code, lang, n) {
  const nm = (s) => (lang === 'vhdl' ? s.toLowerCase() : s);
  const tb = ['module tb;', '  reg clk = 0; reg rst = 1; reg en = 0; wire tc, top; wire [3:0] y;',
    `  divider #(.${nm('N')}(${n})) dut(.clk(clk), .rst(rst), .en(en), .tc(tc), .y(y), .top(top));`,
    '  always #5 clk = ~clk;', '  initial begin', '    @(negedge clk) rst = 0;',
    ...enables.map((e) => `    en = ${e}; #2 $display("%b_%b_%b", tc, y, top); @(negedge clk);`), '    $finish;', '  end', 'endmodule'].join('\n');
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${lang} N=${n}: simulation errors`);
  assert.deepEqual(r.sim.log.filter((e) => e.kind === 'warning' || e.kind === 'error'), [], `${lang} N=${n}: no warnings`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
}

test('#4378 width expressions: syntax, value (clog2 against a reference), code', () => {
  for (let n = 0; n <= 5000; n++) assert.equal(clog2(n), Math.max(1, Math.ceil(Math.log2(Math.max(n, 1)))), `clog2(${n})`);
  assert.equal(clog2(2 ** 31 - 1), 31);
  const ev = (t, g = {}) => evalWidth(parseWidth(t).ast, (k) => g[k]);
  assert.equal(ev('clog2(DEBOUNCE)', { DEBOUNCE: 3 }), 2);
  assert.equal(ev('N + 1', { N: 7 }), 8);
  assert.equal(ev('2 * (N - 1) / 3', { N: 8 }), 4);
  assert.equal(ev('N - 1 - 1', { N: 8 }), 6);
  assert.equal(ev('CLOG2(N)*2', { N: 9 }), 8);
  assert.throws(() => ev('N - 9', { N: 8 }), /a negative value \(-1\)/);
  assert.throws(() => ev('8 / N', { N: 0 }), /a division by 0/);
  assert.equal(widthCode(parseWidth(' clog2( N+1 )*2 ').ast), 'clog2(N + 1) * 2');
  assert.equal(widthCode(parseWidth('(N-1)/2').ast), '(N - 1) / 2');
  assert.deepEqual(parseWidth('N +'), { error: 'the expression ends too soon' });
  assert.deepEqual(parseWidth('clog2(N'), { error: "')' expected" });
  assert.deepEqual(parseWidth('N % 2'), { error: "unexpected '%'" });
  assert.deepEqual(parseWidth('N N'), { error: "unexpected 'N'" });
  assert.deepEqual(parseWidth(''), { error: 'no expression' });
  // the model keeps a number as a number, an expression as its text
  assert.deepEqual(['8', ' 12 ', 'clog2(N) ', '', 7, null, 'x'].map((w) => widthValue(w)), [8, 12, 'clog2(N)', 1, 7, 0, 'x']);
  assert.deepEqual(normalizeModel(divider()).registers.map((r) => r.width), ['clog2(N)', 'N + 1']);
  assert.deepEqual(normalizeModel({ ...divider(), registers: [{ name: 'a', width: '6' }] }).registers[0].width, 6);
  assert.deepEqual(registerWidth({ name: 'r', width: 'clog2(N)' }, new Map([['N', 5]])), { width: 3, p: { text: 'clog2(N)', code: 'clog2(N)', clog2: true } });
});

test('#4378 width expressions: the chart\'s Check (its exact errors and warnings)', () => {
  assert.deepEqual(validate(divider()), []);
  const check = (edit) => { const m = divider(); edit(m); return validate(m).map((d) => `${d.severity}: ${d.message}`); };
  // (a register whose width is wrong is not declared: the boxes that use it say so, as with a wrong number)
  const undeclared = ["error: State 'COUNT' action 'y = cnt': 'cnt' is not a declared input, register or generic",
    "error: Decision 'cnt == N - 1': 'cnt' is not a declared input, register or generic",
    "error: Conditional output action 'cnt = 0': 'cnt' is not a declared output or register",
    "error: Conditional output action 'cnt = cnt + 1': 'cnt' is not a declared output or register"];
  const reg = (w) => (m) => { m.registers[0].width = w; };
  assert.deepEqual(check(reg(0)), ["error: Register 'cnt' has invalid width 0 (1..256)", ...undeclared]);
  assert.deepEqual(check(reg('clog2(N')), ["error: Register 'cnt': width 'clog2(N' is not a valid expression (')' expected): write a number or an expression of the generics, e.g. clog2(N) or N + 1", ...undeclared]);
  assert.deepEqual(check(reg('clog2(n)')), ["error: Register 'cnt': width 'clog2(n)': 'n' is not a generic of the chart (did you mean 'N'?)", ...undeclared]);
  assert.deepEqual(check(reg('M + 1')), ["error: Register 'cnt': width 'M + 1': 'M' is not a generic of the chart", ...undeclared]);
  assert.deepEqual(check(reg('N - 5')), ["error: Register 'cnt': width 'N - 5' is 0 at the generics' default values (1..256)", ...undeclared]);
  assert.deepEqual(check(reg('N * 60')), ["error: Register 'cnt': width 'N * 60' is 300 at the generics' default values (1..256)", ...undeclared]);
  assert.deepEqual(check(reg('N - 6')), ["error: Register 'cnt': width 'N - 6' is a negative value (-1) at the generics' default values", ...undeclared]);
  assert.deepEqual(check(reg('N / (N - 5)')), ["error: Register 'cnt': width 'N / (N - 5)' is a division by 0 at the generics' default values", ...undeclared]);
  // the width at the generics' default values: a literal wider than it
  assert.deepEqual(check((m) => { m.registers[0].init = '9'; }), ["warning: Register 'cnt': reset value '9' is truncated to 3 bit(s)"]);
  assert.deepEqual(check((m) => { m.nodes[3].actions = ['tc', 'cnt = 9']; }), ["warning: Conditional output action 'cnt = 9': value 9 is truncated to 3 bit(s)"]);
  assert.deepEqual(check((m) => { m.nodes[0].actions = ['y = cnt', 'top = sh[6]']; }), ["error: State 'COUNT' action 'top = sh[6]': 'sh' has 6 bits (5..0): index 6 is out of range"]);
  // such a value meets constants and values of its own width in + - & | ^ ~ << >>
  assert.deepEqual(check((m) => { m.nodes[4].actions = ['cnt = cnt + sh']; }),
    ["error: Conditional output action 'cnt = cnt + sh': '+' combines a value clog2(N) bits wide (a width given by generics) with a value N + 1 bits wide: in + - & | ^ ~ << >> it meets only constants and values of the same width (compare it, or slice it)",
      "warning: Conditional output action 'cnt = cnt + sh': 6-bit value is truncated to 3 bits"]);
  assert.deepEqual(check((m) => { m.nodes[0].actions = ['y = cnt + 1']; }),
    ["error: State 'COUNT' action 'y = cnt + 1': '+' combines a value clog2(N) bits wide (a width given by generics) with a 4-bit value: in + - & | ^ ~ << >> it meets only constants and values of the same width (compare it, or slice it)"]);
  assert.deepEqual(check((m) => { m.nodes[2].cond = 'cnt + 1 == N'; }),
    ["error: Decision 'cnt + 1 == N': '+' combines a value clog2(N) bits wide (a width given by generics) with a 32-bit value: in + - & | ^ ~ << >> it meets only constants and values of the same width (compare it, or slice it)"]);
  assert.deepEqual(check((m) => { m.nodes[4].actions = ['cnt = ~cnt']; }), []);
  assert.deepEqual(check((m) => { m.nodes[4].actions = ['cnt = cnt[1:0] + 1']; }),
    ["error: Conditional output action 'cnt = cnt[1:0] + 1': '+' combines a value clog2(N) bits wide (a width given by generics) with a 2-bit value: in + - & | ^ ~ << >> it meets only constants and values of the same width (compare it, or slice it)"]);
  // a copy, a comparison and a slice meet any width
  assert.deepEqual(check((m) => { m.nodes[0].actions = ['y = sh', 'top = cnt > sh', 'sh = cnt']; }), ["warning: State 'COUNT' action 'y = sh': 6-bit value is truncated to 4 bits"]);
  // a case box tests a slice of it
  const caseOn = (expr) => (m) => {
    m.nodes[2] = { id: 'd2', type: 'case', x: 200, y: 280, expr };
    m.edges = m.edges.filter((e) => e.from !== 'd2').concat([{ from: 'd2', to: 'o1', port: '1' }, { from: 'd2', to: 'o2', port: 'others' }]);
  };
  assert.deepEqual(check(caseOn('cnt')), ["error: Case 'cnt': 'cnt' is clog2(N) bits wide (a width given by generics): test a slice of it (e.g. cnt[1:0])"]);
  assert.deepEqual(check(caseOn('cnt[1:0]')), []);
  // the helper function's name
  assert.deepEqual(check((m) => { m.inputs.push({ name: 'clog2', width: 1 }); }), ["error: The registers' widths call the function clog2, which clashes with input 'clog2'"]);
  assert.deepEqual(check((m) => { m.inputs.push({ name: 'clog2', width: 1 }); m.registers[0].width = 'N - 2'; }), []);
});

test('#4378 width expressions: the generated VHDL and Verilog (no diagnostics), round trip', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const encoding of ['binary', 'onehot']) {
      const m = { ...divider(), lang, encoding };
      const g = generate(m, lang);
      const lib = compile([{ path: g.filename, lang, text: g.code }]);
      assert.deepEqual(lib.errors, [], `${lang} ${encoding}: compile`);
      const design = elaborate(lib, 'divider');
      assert.deepEqual(design.diags, [], `${lang} ${encoding}: elaborate`);
      const { model, warnings } = asmFromHdl(g.code, { path: g.filename });
      assert.deepEqual(warnings, []);
      assert.deepEqual(model.registers, [{ name: 'cnt', width: 'clog2(N)', init: '0' }, { name: 'sh', width: 'N + 1', init: '0' }]);
      assert.ok(sameAsmStructure(model, m), `${lang} ${encoding}: recovered`);
      assert.equal(generate(model, lang).code, g.code, `${lang} ${encoding}: regenerated`);
    }
  }
  const vh = generate(divider(), 'vhdl').code;
  assert.match(vh, /-- {3}cnt : clog2\(N\) bits, reset 0\n-- {3}sh {2}: N \+ 1 bits, reset 0/);
  assert.match(vh, /architecture rtl of divider is\n\n {4}-- the bits that count 0 \.\. n-1 \(at least 1\): the registers' widths\n {4}function clog2 \(n : integer\) return integer is/);
  assert.match(vh, /signal cnt, cnt_next : std_logic_vector\(clog2\(N\) - 1 downto 0\) := \(others => '0'\);/);
  assert.match(vh, /signal sh, sh_next : std_logic_vector\(N \+ 1 - 1 downto 0\) := \(others => '0'\);/);
  assert.match(vh, /y <= std_logic_vector\(resize\(unsigned\(cnt\), 4\)\);/);
  assert.match(vh, /sh_next <= std_logic_vector\(shift_left\(unsigned\(sh\), 1\) or to_unsigned\(1, N \+ 1\)\);/);
  assert.match(vh, /cnt_next <= std_logic_vector\(unsigned\(cnt\) \+ 1\);/);
  assert.match(vh, /cnt_next <= \(others => '0'\);/);
  assert.match(vh, /if unsigned\(cnt\) = \(N - 1\) then/);
  const vl = generate({ ...divider(), lang: 'verilog' }, 'verilog').code;
  assert.match(vl, /\n {4}\/\/ the bits that count 0 \.\. n-1 \(at least 1\): the registers' widths\n {4}function integer clog2\(input integer n\);/);
  assert.match(vl, /reg \[clog2\(N\)-1:0\] cnt = 0, cnt_next;/);
  assert.match(vl, /reg \[N \+ 1-1:0\] sh = 0, sh_next;/);
  assert.match(vl, /cnt_next = 0;/);
  assert.doesNotMatch(vl, /\$clog2/);   // (XST has no $clog2: a constant function)
  // no clog2 function when no width calls it
  const plain = divider();
  plain.registers[0].width = 'N - 2';
  for (const lang of ['vhdl', 'verilog']) assert.doesNotMatch(generate(plain, lang).code, /function/);
  // a reset value of such a width
  const init = divider();
  init.registers[0].init = '3';
  assert.match(generate(init, 'vhdl').code, /signal cnt, cnt_next : std_logic_vector\(clog2\(N\) - 1 downto 0\) := std_logic_vector\(to_unsigned\(3, clog2\(N\)\)\);/);
  assert.match(generate(init, 'vhdl').code, /cnt <= std_logic_vector\(to_unsigned\(3, clog2\(N\)\)\);/);
  assert.match(generate(init, 'verilog').code, /reg \[clog2\(N\)-1:0\] cnt = 3, cnt_next;/);
});

test('#4378 width expressions: VHDL and Verilog simulate as the reference at the generics\' values, the chart\'s simulator at their defaults', () => {
  for (const n of [5, 2, 12, 16]) {
    const want = reference(n, enables);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(runHdl(generate({ ...divider(), lang }, lang).code, lang, n), want, `${lang} N=${n}`);
  }
  // the chart's simulator (Try it, simulate_drawing): the widths at the generics' default values (N = 5: cnt 3 bits, sh 6)
  const { sim } = prepareAsmSim(divider());
  assert.deepEqual(sim.regs.map((r) => [r.name, r.width]), [['cnt', 3], ['sh', 6]]);
  let st = asmSimReset(sim);
  const got = enables.map((en) => {
    const { st: next, cycle: x } = asmSimStep(sim, st, { en, rst: 0 });
    st = next;
    return `${x.outputs.tc}_${x.outputs.y.toString(2).padStart(4, '0')}_${x.outputs.top}`;
  });
  assert.deepEqual(got, reference(5, enables));
  // at other default values
  const m = divider();
  m.generics[0].default = 12;
  assert.deepEqual(prepareAsmSim(m).sim.regs.map((r) => [r.name, r.width]), [['cnt', 4], ['sh', 13]]);
});

test('#4378 width expressions: hand-written HDL with a clog2 function becomes a chart with the expression', () => {
  const v = `module cnt #(parameter N = 10) (input clk, input rst, input go, output reg done);
  function integer clog2(input integer n); integer x; begin x = n - 1; for (clog2 = 0; x > 0; clog2 = clog2 + 1) x = x >> 1; if (clog2 < 1) clog2 = 1; end endfunction
  localparam IDLE = 1'b0, RUN = 1'b1;
  reg state_reg = IDLE, state_next;
  reg [clog2(N + 1)-1:0] c = 0, c_next;
  reg [2*N-1:0] w = 0, w_next;
  reg [7:0] k = 0, k_next;
  always @(posedge clk) if (rst) begin state_reg <= IDLE; c <= 0; w <= 0; k <= 0; end else begin state_reg <= state_next; c <= c_next; w <= w_next; k <= k_next; end
  always @* begin state_next = state_reg; c_next = c; w_next = w; k_next = k; done = 0;
    case (state_reg) IDLE: if (go) state_next = RUN; RUN: begin c_next = c + 1; w_next = ~w; k_next = k + 1; if (c == N) begin done = 1; state_next = IDLE; end end endcase end
endmodule`;
  const r = asmFromHdl(v, { path: 'cnt.v' });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.model.registers, [{ name: 'c', width: 'clog2(N + 1)', init: '0' }, { name: 'w', width: '2 * N', init: '0' }, { name: 'k', width: 8, init: '0' }]);
  assert.deepEqual(validate(r.model), []);
  const vh = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is generic (N : integer := 10); port (clk, rst, go : in std_logic; done : out std_logic); end entity;
architecture rtl of cnt is
  function clog2 (n : integer) return integer is begin if n <= 2 then return 1; else return 1 + clog2((n + 1) / 2); end if; end function;
  type state_t is (IDLE, RUN);
  signal state_reg, state_next : state_t := IDLE;
  signal c, c_next : std_logic_vector(clog2(N) - 1 downto 0) := (others => '0');
begin
  process (clk, rst) begin if rst = '1' then state_reg <= IDLE; c <= (others => '0'); elsif rising_edge(clk) then state_reg <= state_next; c <= c_next; end if; end process;
  process (state_reg, go, c) begin state_next <= state_reg; c_next <= c; done <= '0';
    case state_reg is when IDLE => if go = '1' then state_next <= RUN; end if;
      when RUN => c_next <= std_logic_vector(unsigned(c) + 1); if unsigned(c) = N - 1 then done <= '1'; state_next <= IDLE; end if; end case; end process;
end architecture;`;
  const q = asmFromHdl(vh, { path: 'cnt.vhd' });
  assert.deepEqual(q.warnings, []);
  assert.deepEqual(q.model.registers, [{ name: 'c', width: 'clog2(N)', init: '0' }]);
});

test('#4378 width expressions: an old chart and a chart\'s numeric widths are unchanged', () => {
  const m = divider();
  m.registers = [{ name: 'cnt', width: 3, init: '0' }, { name: 'sh', width: '6', init: '0' }];
  const n = normalizeModel(clone(m));
  assert.deepEqual(n.registers.map((r) => r.width), [3, 6]);
  assert.deepEqual(validate(n), []);
  const vh = generate(n, 'vhdl').code;
  assert.match(vh, /signal cnt, cnt_next : std_logic_vector\(2 downto 0\) := "000";/);
  assert.doesNotMatch(vh, /clog2/);
});
