// Usability tests (#5206, phase 1): the modules a person types in the HDL editor (hdl-edit.test.js) and then tests with
// the Test Bench Wizard and the simulator (hdl-sim.test.js): a 4-bit counter with a synchronous reset and an enable,
// in VHDL and in Verilog. Each line as it is typed (lib/hdl-typing.js: `[[prefix|rest]]` a completion taken) with its
// indentation; `typed`: the line typed with a mistake made on purpose, which Check Syntax finds and the person fixes
// (`fix`: the line where the fix goes, what is typed at its end).
import { fileOf } from './hdl-typing.js';

const L = (indent, line, more = {}) => ({ indent, line, ...more });

export const DESIGNS = {
  vhdl: {
    file: 'src/counter.vhd',
    lines: [
      L(0, 'library ieee;'),
      L(0, 'use [[ieee.std|_logic_1164.all]];'),
      L(0, 'use [[ieee.nu|meric_std.all]];'),
      L(0, ''),
      L(0, 'entity counter is'),
      L(2, 'port (clk : in std_logic;'),
      L(8, 'rst : in std_logic;'),
      L(8, 'en  : in std_logic;'),
      L(8, 'q   : out [[std_logic_v|ector]](3 downto 0));'),
      L(0, 'end counter;'),
      L(0, ''),
      L(0, 'architecture rtl of counter is'),
      L(2, "signal r : unsigned(3 downto 0) := (others => '0');"),
      L(0, 'begin'),
      L(2, 'process (clk)'),
      L(2, 'begin'),
      L(4, 'if [[rising_e|dge]](clk) then'),
      L(6, "if rst = '1' then"),
      L(8, "r <= (others => '0');"),
      L(6, "elsif en = '1' then"),
      L(8, 'r <= r + 1;', { typed: 'r <= r + 1' }),
      L(6, 'end if;'),
      L(4, 'end if;'),
      L(2, 'end process;'),
      L(2, 'q <= std_logic_vector(r);'),
      L(0, 'end rtl;'),
    ],
    fix: { line: 21, type: ';' },
  },
  verilog: {
    file: 'src/counter.v',
    lines: [
      L(0, 'module counter (input clk, input rst, input en, output reg [3:0] q);'),
      L(2, 'always @([[pose|dge]] clk) begin'),
      L(4, "if (rst) q <= 4'd0;", { typed: "if (rst) q <= 4'd0" }),
      L(4, 'else if (en) q <= q + 1;'),
      L(2, 'end'),
      L(0, 'endmodule'),
    ],
    fix: { line: 3, type: ';' },
  },
};
for (const d of Object.values(DESIGNS)) d.text = fileOf(d.lines);
