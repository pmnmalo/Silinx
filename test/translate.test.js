// core/translate.js (#2693): an HDL source translated to the other language, the Design pane's read-only view of a
// Verilog source in a VHDL project and of a VHDL source in a Verilog one. The reference is the examples' own test
// benches: each example's sources translated, swapped in for the originals, the test bench passes as before with the
// same warnings (none); the others translated and compiled with no error or warning. Then each construct's translation
// exactly, both ways, and what has no translation, with its message and its line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile, elaborate, langOfPath } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { Simulator } from '../core/simulator.js';
import { primitiveSources } from '../core/unisim.js';
import { translateSource, translationLang, translatedPath } from '../core/translate.js';
import { EXAMPLES, example } from './examples-lib.mjs';
import { generateCircuit } from '../core/circuit-hdl.js';
import { diags, sim } from './lang-util.js';

const other = p => (langOfPath(p) === 'vhdl' ? 'verilog' : 'vhdl');
const tr = (text, path, to = other(path), sources = []) => translateSource(text, { path, to, sources });

// an example's test bench run on its sources: { log (its OK / ERROR lines), warnings, checks }
function run(ex, sources) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  const des = elaborate(lib, ex.project.simTop);
  const errors = [...lib.errors, ...des.diags].filter(d => d.severity === 'error');
  if (errors.length) return { errors: errors.map(e => `${e.file}:${e.line} ${e.message}`) };
  const sim = new Simulator(des, { files: new Map(sources.map(s => [s.path, s.text])) });
  for (const s of des.signals) s.wave = null;
  for (let t = 5e7; t <= 5e9; t += 5e7) { const st = sim.run(t); if (st.finished || sim.log.some(e => /Simulation finished OK|ERROR/.test(e.text))) break; }
  return { log: sim.log.map(e => e.text).filter(l => /Simulation finished OK|ERROR/.test(l)),
    warnings: [...lib.errors, ...des.diags].filter(d => d.severity === 'warning').map(d => d.message), checks: designChecks(lib, elaborate(lib, ex.project.top)).map(d => d.message) };
}
// the example's HDL sources that cannot be translated, and why (test benches with tasks, waits with a timeout…)
const UNTRANSLATABLE = {
  'traffic/sim/tb_traffic.vhd': "line 49: the function 'bits' (its parameter 'v' is unconstrained, of a width not known) cannot be translated to Verilog",
  'lock/sim/tb_lock.vhd': "line 37: the function 'bits' (its parameter 'v' is unconstrained, of a width not known) cannot be translated to Verilog",
  'blinky/sim/tb_top.vhd': "line 58: the procedure 'read_display' cannot be translated to Verilog",
  'pong/sim/tb_pong.v': "line 27: a declaration of kind 'task' cannot be translated to VHDL",
  'stopwatch/sim/tb_stopwatch.vhd': "line 54: the procedure 'press' cannot be translated to Verilog",
  'clock/sim/tb_clock.v': "line 35: a declaration of kind 'task' cannot be translated to VHDL",
  'breadboard/sim/tb_breadboard.vhd': "line 42: the procedure 'expect' cannot be translated to Verilog",
  'vga/sim/tb_vga.vhd': "line 50: the procedure 'expect' cannot be translated to Verilog",
  'uart/sim/tb_uart.vhd': "line 74: the procedure 'send' cannot be translated to Verilog",
  'micro80/src/light8080_ucode_pkg.vhdl': 'line 6: a file with no entity',
  'micro80/src/program.vhd': 'line 10: a file with no entity',
  'micro80/sim/tb_micro80.vhd': 'line 90: this wait statement cannot be translated to Verilog',
};
// the examples whose test bench runs with each translation swapped in (the others' translations compiled only: their
// test benches take long)
const SIMULATED = ['gates', 'traffic', 'blinky', 'clock', 'stopwatch', 'uart'];

for (const name of EXAMPLES) {
  test(`example ${name}: every HDL source translated to the other language${SIMULATED.includes(name) ? ', swapped in: the test bench passes as before, no warning' : ', compiled: no error, no warning'}`, { timeout: 120000 }, () => {
    const ex = example(name);
    const base = SIMULATED.includes(name) ? run(ex, ex.sources) : null;
    if (base) assert.deepEqual([base.log, base.warnings], [['Simulation finished OK'], []]);
    const seen = {};
    // (a digital circuit's HDL, #3901: its other language generated from the circuit, as the editor does, not translated;
    // its simulation's model, 'Z', 'X' and the gates' delays, is outside the translator's subset)
    const src = path.join(ex.dir, 'src');
    const circuits = new Map(fs.readdirSync(src).filter(f => f.endsWith('.circ.json')).map(f => JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'))).map(m => [m.generatedFile, m]));
    for (const s of ex.sources.filter(x => langOfPath(x.path) && !/\.c\./.test(x.path))) {
      const m = circuits.get(s.path);
      const r = m ? { ok: true, lang: other(s.path), text: generateCircuit(m, other(s.path), { source: s.path }).code } : tr(s.text, s.path, other(s.path), ex.sources);
      if (!r.ok) { seen[`${name}/${s.path}`] = r.errors.map(e => `${e.line ? `line ${e.line}: ` : ''}${e.message}`).join('; '); continue; }
      const swapped = ex.sources.map(x => (x === s ? { ...x, path: translatedPath(s.path, r.lang), lang: r.lang, text: r.text } : x));
      if (base) {
        const got = run(ex, swapped);
        assert.deepEqual([got.errors, got.log, got.warnings, got.checks], [undefined, base.log, base.warnings, base.checks], `${s.path} in ${r.lang}`);
      } else {
        const lib = compile([...primitiveSources(swapped), ...swapped]);
        assert.deepEqual(lib.errors.map(e => `${e.severity}: ${e.file}:${e.line} ${e.message}`), [], `${s.path} in ${r.lang}`);
      }
    }
    assert.deepEqual(seen, Object.fromEntries(Object.entries(UNTRANSLATABLE).filter(([k]) => k.startsWith(`${name}/`))));
  });
}

test('translationLang: the preferred language when the file is in the other one, else null; translatedPath', () => {
  assert.equal(translationLang('src/a.v', 'vhdl'), 'vhdl');
  assert.equal(translationLang('src/a.v', undefined), 'vhdl');
  assert.equal(translationLang('src/a.vhd', 'verilog'), 'verilog');
  assert.equal(translationLang('src/a.vhdl', 'verilog'), 'verilog');
  assert.equal(translationLang('src/a.vhd', 'vhdl'), null);
  assert.equal(translationLang('src/a.v', 'verilog'), null);
  assert.equal(translationLang('src/a.c', 'vhdl'), null);
  assert.equal(translationLang('src/a.sch.json', 'verilog'), null);
  assert.deepEqual([translatedPath('src/a.v', 'vhdl'), translatedPath('a.vhd', 'verilog'), translatedPath('a.vhdl', 'verilog'), translatedPath('a.sv', 'vhdl')], ['src/a.vhd', 'a.v', 'a.v', 'a.vhd']);
});

// ------------------------------------------------------------------ VHDL to Verilog
const VHDL_HEAD = 'library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nuse IEEE.NUMERIC_STD.ALL;\n';
// the translation's modules (its first comment line and its blank line taken away)
const body = r => { assert.ok(r.ok, r.text); return r.text.replace(/^(--|\/\/) .*\n(`timescale.*\n)?\n/, ''); };

test('VHDL to Verilog: an enumerated state machine with an asynchronous reset, generics, a when/else and a with/select', () => {
  const r = tr(`${VHDL_HEAD}
entity Fsm is
    generic ( N : integer := 4 );
    Port ( Clk, Rst : in STD_LOGIC;
           Go : in STD_LOGIC;
           Cnt : out STD_LOGIC_VECTOR (N-1 downto 0);
           Busy, Odd : out STD_LOGIC );
end Fsm;
architecture rtl of Fsm is
    type state_t is (Idle, Run, Done);
    signal State : state_t := Idle;
    signal C : unsigned(N-1 downto 0) := (others => '0');
begin
    process (Clk, Rst)
    begin
        if Rst = '1' then
            State <= Idle; C <= (others => '0');
        elsif rising_edge(Clk) then
            case State is
                when Idle => if Go = '1' then State <= Run; end if;
                when Run => C <= C + 1; if C = 2**N - 1 then State <= Done; end if;
                when others => State <= Idle;
            end case;
        end if;
    end process;
    Cnt <= std_logic_vector(C);
    Busy <= '1' when State = Run else '0';
    with C(0) select Odd <= '1' when '1', '0' when others;
end rtl;
`, 'src/fsm.vhd');
  assert.equal(body(r), `module Fsm #(
    parameter N = 4
) (
    input wire Clk,
    input wire Rst,
    input wire Go,
    output wire [N - 1:0] Cnt,
    output wire Busy,
    output reg Odd
);
    localparam [1:0] Idle = 2'd0, Run = 2'd1, Done = 2'd2;
    reg [1:0] State = Idle;
    reg [N - 1:0] C = {N{1'b0}};

    always @(posedge Clk or posedge Rst) begin
        if (Rst) begin
            State <= Idle;
            C <= {N{1'b0}};
        end else begin
            case (State)
                Idle: begin
                    if (Go)
                        State <= Run;
                end
                Run: begin
                    C <= C + 1;
                    if (C == 2 ** N - 1)
                        State <= Done;
                end
                default:
                    State <= Idle;
            endcase
        end
    end

    assign Cnt = C;

    assign Busy = State == Run ? 1'b1 : 1'b0;

    always @* begin
        case (C[0])
            1'b1:
                Odd = 1'b1;
            default:
                Odd = 1'b0;
        endcase
    end
endmodule
`);
});

test('VHDL to Verilog: a ROM table, a function with an unconstrained parameter, a for loop beside a for generate, an instance, names reserved in Verilog', () => {
  const r = tr(`${VHDL_HEAD}
entity romtab is
    port ( addr : in unsigned(1 downto 0); data : out std_logic_vector(7 downto 0); wire : out std_logic_vector(3 downto 0); par : out std_logic );
end romtab;
architecture a of romtab is
    type rom_t is array (0 to 3) of std_logic_vector(7 downto 0);
    constant ROM : rom_t := (x"11", x"22", x"33", x"44");
    function swap (v : std_logic_vector) return std_logic_vector is
    begin
        return v(3 downto 0) & v(7 downto 4);
    end function;
    signal byte : std_logic_vector(7 downto 0);
begin
    byte <= ROM(to_integer(addr));
    data <= swap(byte);
    g: for i in 0 to 3 generate
        wire(i) <= byte(i);
    end generate;
    process (addr)
        variable p : std_logic;
    begin
        p := '0';
        for i in 0 to 1 loop
            p := p xor addr(i);
        end loop;
        par <= p;
    end process;
    u: entity work.sub port map ( a => addr(0), b => open );
end a;
`, 'src/rom.vhd');
  assert.equal(r.text, `// rom.vhd, translated from VHDL by Silinx: read-only, the comments not carried over.
// Renamed (reserved words in Verilog): wire -> wire_, byte -> byte_.

module romtab (
    input wire [1:0] addr,
    output wire [7:0] data,
    output wire [3:0] wire_,
    output reg par
);
    reg [7:0] ROM [0:3];
    function [7:0] swap(input [7:0] v);
        begin
            swap = {v[3:0], v[7:4]};
        end
    endfunction
    wire [7:0] byte_;
    reg p;
    integer i_loop;
    initial begin
        ROM[0] = 8'h11;
        ROM[1] = 8'h22;
        ROM[2] = 8'h33;
        ROM[3] = 8'h44;
    end

    assign byte_ = ROM[addr];

    assign data = swap(byte_);

    genvar i;
    generate for (i = 0; i <= 3; i = i + 1) begin : g
        assign wire_[i] = byte_[i];
    end endgenerate

    always @* begin
        p = 1'b0;
        for (i_loop = 0; i_loop <= 1; i_loop = i_loop + 1)
            p = p ^ addr[i_loop];
        par = p;
    end

    sub u (
        .a(addr[0]),
        .b()
    );
endmodule
`);
  // and it compiles and elaborates, no warning
  const lib = compile([{ path: 'src/sub.v', text: 'module sub (input a, output b); assign b = a; endmodule\n' }, { path: 'src/rom.v', text: r.text }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'romtab').diags].map(d => `${d.severity}: ${d.message}`), []);
});

// ------------------------------------------------------------------ Verilog to VHDL
const VH = (name, ...lines) => `-- ${name}, translated from Verilog by Silinx: read-only, the comments not carried over.\n\n${VHDL_HEAD}\n${lines.join('\n')}\n`;

test('Verilog to VHDL: parameters, localparams, a clocked block with an asynchronous low reset, an output read inside, a combinational case', () => {
  const r = tr(`module ctr #(parameter W = 8, parameter MAX = 200) (
    input clk, input rst_n, input en,
    output reg [W-1:0] q, output wire top, output reg [1:0] code
);
    localparam IDLE = 2'b00, BUSY = 2'b01;
    always @(posedge clk or negedge rst_n)
        if (!rst_n) q <= 0;
        else if (en && q != MAX) q <= q + 1'b1;
    assign top = (q == MAX);
    always @* begin
        code = IDLE;
        case (q[1:0])
            2'd1, 2'd2: code = BUSY;
            default: ;
        endcase
    end
endmodule
`, 'src/ctr.v');
  assert.equal(r.text, VH('ctr.v',
    'entity ctr is',
    '    generic (',
    '        W : integer := 8;',
    '        MAX : integer := 200',
    '    );',
    '    port (',
    '        clk : in std_logic;',
    '        rst_n : in std_logic;',
    '        en : in std_logic;',
    '        q : out std_logic_vector(W - 1 downto 0);',
    '        top : out std_logic;',
    '        code : out std_logic_vector(1 downto 0)',
    '    );',
    'end ctr;',
    '',
    'architecture Behavioral of ctr is',
    '    constant IDLE : std_logic_vector(1 downto 0) := "00";',
    '    constant BUSY : std_logic_vector(1 downto 0) := "01";',
    '    signal q_i : std_logic_vector(W - 1 downto 0);',
    'begin',
    '    q <= q_i;',
    '',
    '    process (clk, rst_n)',
    '    begin',
    "        if rst_n = '0' then",
    "            q_i <= (others => '0');",
    '        elsif rising_edge(clk) then',
    "            if en = '1' and unsigned(q_i) /= MAX then",
    '                q_i <= std_logic_vector(unsigned(q_i) + 1);',
    '            end if;',
    '        end if;',
    '    end process;',
    '',
    "    top <= '1' when unsigned(q_i) = MAX else '0';",
    '',
    '    process (q_i)',
    '    begin',
    '        code <= IDLE;',
    '        case q_i(1 downto 0) is',
    '            when "01" | "10" =>',
    '                code <= BUSY;',
    '            when others =>',
    '                null;',
    '        end case;',
    '    end process;',
    'end Behavioral;'));
});

test("#3744 Verilog to VHDL: a parameter's default that uses an earlier parameter has that one's default in its place (VHDL-93 refuses a generic's default that uses another generic, LRM 4.3.2.1); compiled and simulated in both languages, no warning", () => {
  const v = `module m #(parameter W = 8, parameter D = W * 2, parameter E = D + W) (output [D-1:0] q);
    assign q = E;
endmodule
`;
  const r = tr(v, 'src/m.v');
  assert.equal(r.text, VH('m.v',
    'entity m is',
    '    generic (',
    '        W : integer := 8;',
    '        D : integer := 8 * 2;',
    '        E : integer := 8 * 2 + 8',
    '    );',
    '    port (',
    '        q : out std_logic_vector(D - 1 downto 0)',
    '    );',
    'end m;',
    '',
    'architecture Behavioral of m is',
    'begin',
    '    q <= std_logic_vector(to_unsigned(E, D));',
    'end Behavioral;'));
  const vtb = 'module tb; wire [15:0] q; m u (.q(q)); initial #1 $display("q = %0d", q); endmodule\n';
  const vhtb = `${VHDL_HEAD}entity tb is end tb;
architecture sim of tb is
    signal q : std_logic_vector(15 downto 0);
begin
    u : entity work.m port map (q => q);
    process begin wait for 1 ns; report "q = " & integer'image(to_integer(unsigned(q))); wait; end process;
end sim;
`;
  for (const src of [{ 'm.v': v, 'tb.v': vtb }, { 'm.vhd': r.text, 'tb.vhd': vhtb }]) {
    assert.deepEqual(diags(src, 'tb'), [], Object.keys(src)[0]);
    assert.deepEqual(sim(src, 'tb').out.filter(l => /q = /.test(l)).map(l => l.replace(/^.*q = /, 'q = ')), ['q = 24'], Object.keys(src)[0]);
  }
});

test('Verilog to VHDL: a function, a memory, a for loop, an instance with an expression and a ?: in a port (intermediate signals), the carry of a sum kept, a name reserved in VHDL, names of one letter case apart', () => {
  const sub = { path: 'src/sub.v', text: 'module sub (input [7:0] d, output [7:0] y); assign y = d; endmodule\n' };
  const r = tr(`module top (input clk, input [3:0] a, input [3:0] b, input sel, output [4:0] sum, output [7:0] y, output reg [3:0] signal);
    reg [3:0] mem [0:3];
    reg [3:0] Mem;
    integer i;
    function [3:0] rev(input [3:0] v);
        integer k;
        begin
            for (k = 0; k < 4; k = k + 1) rev[k] = v[3 - k];
        end
    endfunction
    assign sum = a + b;
    always @(posedge clk) begin
        for (i = 0; i < 4; i = i + 1) mem[i] <= a;
        Mem <= rev(b);
        signal <= mem[a[1:0]] ^ Mem;
    end
    sub u (.d({a, sel ? b : ~b}), .y(y));
endmodule
`, 'src/top.v', 'vhdl', [sub]);
  assert.equal(r.text, VH('top.v',
    'entity top is',
    '    port (',
    '        clk : in std_logic;',
    '        a : in std_logic_vector(3 downto 0);',
    '        b : in std_logic_vector(3 downto 0);',
    '        sel : in std_logic;',
    '        sum : out std_logic_vector(4 downto 0);',
    '        y : out std_logic_vector(7 downto 0);',
    '        signal_v : out std_logic_vector(3 downto 0)',
    '    );',
    'end top;',
    '',
    'architecture Behavioral of top is',
    '    type mem_t is array (0 to 3) of std_logic_vector(3 downto 0);',
    '    signal mem : mem_t;',
    '    signal Mem_2 : std_logic_vector(3 downto 0);',
    '    function rev (v : std_logic_vector(3 downto 0)) return std_logic_vector is',
    '        variable result : std_logic_vector(3 downto 0);',
    '    begin',
    '        for k in 0 to 3 loop',
    '            result(k) := v(3 - k);',
    '        end loop;',
    '        return result;',
    '    end function;',
    '    signal u_sel : std_logic_vector(3 downto 0);',
    '    signal u_d : std_logic_vector(7 downto 0);',
    'begin',
    '    sum <= std_logic_vector(resize(unsigned(a), 5) + unsigned(b));',
    '',
    '    process (clk)',
    '    begin',
    '        if rising_edge(clk) then',
    '            for i in 0 to 3 loop',
    '                mem(i) <= a;',
    '            end loop;',
    '            Mem_2 <= rev(b);',
    '            signal_v <= mem(to_integer(unsigned(a(1 downto 0)))) xor Mem_2;',
    '        end if;',
    '    end process;',
    '',
    '    u_sel <= b when sel = \'1\' else not b;',
    '    u_d <= a & u_sel;',
    '    u: entity work.sub',
    '        port map (',
    '            d => u_d,',
    '            y => y',
    '        );',
    'end Behavioral;').replace('\n\nlibrary', '\n-- Renamed (reserved words in VHDL): Mem -> Mem_2, signal -> signal_v.\n\nlibrary'));
  // and it compiles and elaborates, no warning
  const lib = compile([sub, { path: 'src/top.vhd', text: r.text }]);
  const des = elaborate(lib, 'top');
  assert.deepEqual([...lib.errors, ...des.diags].map(d => `${d.severity}: ${d.message}`), []);
});

// ------------------------------------------------------------------ what has no translation
test('no translation: said with its line, nothing translated shown; a parse error, a package, the same language', () => {
  const no = (text, path, to) => { const r = tr(text, path, to); assert.equal(r.ok, false); return [r.errors, r.text]; };
  assert.deepEqual(no('module m (input [3:0] r, output reg y);\n  always @*\n    casez (r) 4\'b1???: y = 1; default: y = 0; endcase\nendmodule\n', 'src/m.v'),
    [[{ line: 3, message: "a casez with don't-care bits cannot be translated to VHDL" }], "-- m.v cannot be translated to VHDL:\n--   line 3: a casez with don't-care bits cannot be translated to VHDL"]);
  assert.deepEqual(no('module m (input a, output y);\n  task t; begin end endtask\n  assign y = a;\nendmodule\n', 'src/m.v')[0],
    [{ line: 2, message: "a declaration of kind 'task' cannot be translated to VHDL" }]);
  assert.deepEqual(no('module m (input A, input a, output y);\n  assign y = A & a;\nendmodule\n', 'src/m.v')[0],
    [{ line: 1, message: "the names 'A' and 'a' (VHDL does not tell letter case apart) cannot be translated to VHDL" }]);
  assert.deepEqual(no(`${VHDL_HEAD}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture x of e is\n  type r_t is record f : std_logic; end record;\n  signal r : r_t;\nbegin\n  y <= a;\nend x;\n`, 'src/e.vhd')[0],
    [{ line: 6, message: 'a record type cannot be translated to Verilog' }]);
  assert.deepEqual(no(`${VHDL_HEAD}package p is constant K : integer := 3; end package;\n`, 'src/p.vhd'),
    [[{ line: 4, message: 'a file with no entity' }], '// p.vhd cannot be translated to Verilog:\n//   line 4: a file with no entity']);
  assert.deepEqual(no('module m (input a output y); endmodule\n', 'src/m.v')[0].length, 1);
  assert.match(no('module m (input a output y); endmodule\n', 'src/m.v')[0][0].message, /\(the source has errors: check its syntax\)$/);
  assert.deepEqual(no('module m; endmodule\n', 'src/m.v', 'verilog')[0], [{ line: null, message: 'it is not a source in VHDL' }]);
});

// (#4412: a flip-flop's preset and clear, and a chain of three asynchronous controls)
const FF_ASYNC = `library ieee;
use ieee.std_logic_1164.all;
entity ffpc is
  port (clk, d, pre_n, clr_n, ld : in std_logic; q : out std_logic);
end entity ffpc;
architecture rtl of ffpc is
  signal r : std_logic := '0';
begin
  process (clk, pre_n, clr_n, ld)
  begin
    if pre_n = '0' then
      r <= '1';
    elsif clr_n = '0' then
      r <= '0';
    elsif ld = '1' then
      r <= d;
    elsif rising_edge(clk) then
      r <= not r;
    end if;
  end process;
  q <= r;
end architecture rtl;
`;
const FF_TB = `\`timescale 1ns / 1ps
module tb;
  reg clk = 0, d = 0, pre_n = 1, clr_n = 1, ld = 0;
  wire q;
  ffpc dut (.clk(clk), .d(d), .pre_n(pre_n), .clr_n(clr_n), .ld(ld), .q(q));
  initial begin
    #10 clr_n = 0; #10 $display("%b", q); clr_n = 1;
    #10 clk = 1; #10 $display("%b", q); clk = 0;
    #10 pre_n = 0; #10 $display("%b", q); pre_n = 1;
    #10 pre_n = 0; clr_n = 0; #10 $display("%b", q); pre_n = 1; clr_n = 1;
    #10 d = 0; ld = 1; #10 $display("%b", q); ld = 0;
    #10 clk = 1; #10 $display("%b", q); clk = 0;
    #10 clk = 1; #10 $display("%b", q); clk = 0;
    $finish;
  end
endmodule
`;

test('#4412 VHDL to Verilog: a process with asynchronous controls before its clock\'s edge (a preset, a clear, a load): one always block, its edges, the same simulation', () => {
  const v = tr(FF_ASYNC, 'ffpc.vhd');
  assert.deepEqual([v.ok, v.errors], [true, []]);
  assert.match(v.text, /always @\(posedge clk or negedge pre_n or negedge clr_n or posedge ld\) begin\n\s+if \(!pre_n\) begin\n\s+r <= 1'b1;\n\s+end else if \(!clr_n\) begin\n\s+r <= 1'b0;\n\s+end else if \(ld\) begin\n\s+r <= d;\n\s+end else begin\n\s+r <= ~r;\n\s+end\n\s+end/);
  assert.deepEqual(diags({ 'ffpc.v': v.text }, 'ffpc').filter((d) => d.severity !== 'info').map((d) => d.message), [], 'no warnings');
  // the preset first, then the clear, then the load, then the edge: in VHDL and in its Verilog alike
  const want = ['0', '1', '1', '1', '0', '1', '0'];
  assert.deepEqual(sim({ 'ffpc.vhd': FF_ASYNC, 'tb.v': FF_TB }).out, want);
  assert.deepEqual(sim({ 'ffpc.v': v.text, 'tb.v': FF_TB }).out, want);
  // one reset still the form it was
  const one = tr(FF_ASYNC.replace(/    elsif clr_n = '0' then\n      r <= '0';\n    elsif ld = '1' then\n      r <= d;\n/, ''), 'ffpc.vhd');
  assert.match(one.text, /always @\(posedge clk or negedge pre_n\) begin\n\s+if \(!pre_n\) begin\n\s+r <= 1'b1;\n\s+end else begin\n\s+r <= ~r;\n\s+end\n\s+end/);
});

// (#4414: the lint's suppressions kept: a latch, an S̅-R̅ latch's elsif, a clock that is logic on purpose)
const PRAGMAS = `library ieee;
use ieee.std_logic_1164.all;
entity pragmas is
  port (en, d, s_n, r_n, clk : in std_logic; q, q2, q3 : out std_logic);
end entity pragmas;
architecture rtl of pragmas is
  signal a, b, c : std_logic := '0';
  signal gclk : std_logic;
begin
  process (en, d)
  begin
    -- silinx: ignore latch
    if en = '1' then
      a <= d;
    end if;
  end process;
  process (s_n, r_n)
  begin
    -- silinx: ignore latch
    if s_n = '0' then
      b <= '1';
    -- silinx: ignore latch
    elsif r_n = '0' then
      b <= '0';
    end if;
  end process;
  gclk <= clk and en;
  -- silinx: ignore data-as-clock
  process (gclk)
  begin
    if rising_edge(gclk) then
      c <= d;
    end if;
  end process;
  q <= a;
  q2 <= b;
  q3 <= c;
end architecture rtl;
`;

test('#4414 VHDL to Verilog: the lint\'s "silinx: ignore" comments kept with their statements, the translation\'s lint as clean as the source\'s', () => {
  const lint = (files, top) => { const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text }))), d = elaborate(lib, top); return designChecks(lib, d, { lint: true }).filter((x) => x.severity === 'warning').map((x) => x.message); };
  assert.deepEqual(lint({ 'pragmas.vhd': PRAGMAS }, 'pragmas'), [], 'the source: its suppressions');
  const v = tr(PRAGMAS, 'pragmas.vhd');
  assert.equal(v.ok, true);
  assert.deepEqual(v.text.split('\n').filter((l) => /silinx:/.test(l)).map((l) => l.trim()), [
    'if (en) // silinx: ignore latch', 'if (!s_n) // silinx: ignore latch', 'else if (!r_n) // silinx: ignore latch', 'always @(posedge gclk) begin // silinx: ignore data-as-clock']);
  assert.deepEqual(lint({ 'pragmas.v': v.text }, 'pragmas'), [], 'its translation: the same suppressions');
  // without them, the translation warns as the source does
  const bare = PRAGMAS.replace(/^\s*-- silinx: ignore.*\n/gm, '');
  assert.equal(lint({ 'pragmas.vhd': bare }, 'pragmas').length, lint({ 'pragmas.v': tr(bare, 'pragmas.vhd').text }, 'pragmas').length);
  assert.ok(lint({ 'pragmas.vhd': bare }, 'pragmas').length >= 3);
});

// (#4436: a concurrent assignment's suppression, on the line above it or its own, kept at the end of its assign's line,
// as a process's is (#4414): the 74190's core, a clock that is logic on purpose)
const CONC_PRAGMAS = `library ieee;
use ieee.std_logic_1164.all;
entity conc is
  port (clk, a, s : in std_logic; q, y, z : out std_logic);
end entity conc;
architecture rtl of conc is
begin
  process (clk)
  begin
    if rising_edge(clk) then
      q <= a;
    end if;
  end process;
  -- silinx: ignore clock-as-data
  y <= not (a and (not clk));
  z <= a when s = '1' else clk; -- silinx: ignore clock-as-data
end architecture rtl;
`;

test('#4436 VHDL to Verilog: a concurrent assignment\'s "silinx: ignore" comment kept at the end of its assign line', () => {
  const lint = (files, top) => { const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text }))), d = elaborate(lib, top); return designChecks(lib, d, { lint: true }).filter((x) => x.severity === 'warning').map((x) => x.message); };
  assert.deepEqual(lint({ 'conc.vhd': CONC_PRAGMAS }, 'conc'), [], 'the source: its suppressions');
  const v = tr(CONC_PRAGMAS, 'conc.vhd');
  assert.equal(v.ok, true);
  assert.deepEqual(v.text.split('\n').filter((l) => /silinx:/.test(l)).map((l) => l.trim()), [
    'assign y = ~(a & ~clk); // silinx: ignore clock-as-data', 'assign z = s ? a : clk; // silinx: ignore clock-as-data']);
  assert.deepEqual(lint({ 'conc.v': v.text }, 'conc'), [], 'its translation: the same suppressions');
  // without them, the source and its translation warn alike, once per assignment
  const bare = CONC_PRAGMAS.replace(/ *-- silinx: ignore.*\n/gm, '\n');
  const warned = lint({ 'conc.vhd': bare }, 'conc');
  assert.equal(warned.length, 2);
  assert.deepEqual(lint({ 'conc.v': tr(bare, 'conc.vhd').text }, 'conc').length, 2);
});

// #4383: a case on a concatenation (or on a signed vector) in VHDL: its selector qualified by a subtype of its width
// declared in the architecture, locally static as XST wants (HDLCompiler:803); the Verilog and its VHDL simulate alike
const CASE_CAT = `module casecat(input a, input b, input [1:0] u, input signed [1:0] sv, output reg [1:0] y, output reg z, output reg w);
always @* begin
  case ({a, b})
    2'b00: y = 2'd1;
    2'b11: y = 2'd2;
    default: y = 2'd0;
  endcase
  case ({u, a})
    3'b101: z = 1'b1;
    default: z = 1'b0;
  endcase
  case (sv)
    2'b10: w = 1'b1;
    default: w = 1'b0;
  endcase
end
endmodule
`;

test('#4383 Verilog to VHDL: a case on a concatenation or a signed vector, its selector qualified by a subtype of its width', () => {
  const v = tr(CASE_CAT, 'casecat.v');
  assert.equal(v.ok, true);
  assert.deepEqual(v.text.split('\n').filter((l) => /subtype|case /.test(l)).map((l) => l.trim()), [
    'subtype case2_t is std_logic_vector(1 downto 0);', 'subtype case3_t is std_logic_vector(2 downto 0);',
    "case case2_t'(a & b) is", "case case3_t'(u & a) is", "case case2_t'(std_logic_vector(sv)) is"]);
  assert.doesNotMatch(v.text, /std_logic_vector'\(/);
  // simulated: the Verilog and its VHDL, with a VHDL test bench of every input; no warnings
  const tb = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture t of tb is
  signal a, b, z, w : std_logic; signal u, y : std_logic_vector(1 downto 0); signal sv : signed(1 downto 0);
begin
  dut : entity work.casecat port map (a => a, b => b, u => u, sv => sv, y => y, z => z, w => w);
  process begin
    for i in 0 to 31 loop
      (a, b) <= std_logic_vector(to_unsigned(i mod 4, 2)); u <= std_logic_vector(to_unsigned(i / 4 mod 4, 2));
      sv <= signed(to_unsigned(i / 16 * 2, 2));
      wait for 1 ns; report integer'image(i) & ":" & to_string(y) & std_logic'image(z) & std_logic'image(w);
    end loop;
    wait;
  end process;
end;`;
  const ws = (r) => [...r.r.lib.errors, ...r.design.diags].filter((d) => d.severity !== 'error').map((d) => `${d.file}:${d.line}: ${d.message}`);
  const rv = sim({ 'casecat.v': CASE_CAT, 'tb.vhd': tb }), rh = sim({ 'casecat.vhd': v.text, 'tb.vhd': tb });
  assert.deepEqual(ws(rv), []);
  assert.deepEqual(ws(rh), []);
  assert.equal(rh.out.length, 32);
  assert.deepEqual(rh.out, rv.out);
  assert.equal(rh.out[3], "3:10'0''0'");
  assert.equal(rh.out[27], "27:10'1''1'");
});
