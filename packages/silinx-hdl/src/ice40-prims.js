// Silinx - the iCE40 primitives (#2299, the iCEBreaker's iCE40UP5K, #2295): Silinx's own functional models of the cells
// Yosys's synth_ice40 maps a design onto and a user's HDL may instantiate, so that both simulate (the post-synthesis
// netlist, Yosys's write_verilog, in place of the design). Written from Yosys's techlibs/ice40/cells_sim.v (its
// behavioural models; its PLLs and oscillators are black boxes there) and Lattice's iCE40 technology library and sysCLOCK
// PLL guide (TN1251), as gowin-prims.js's from Gowin's. No timing. The names, pins and generics are Lattice's (its VHDL
// library: `library sb_ice40_components_syn; use sb_ice40_components_syn.components.all;`); none is UNISIM's.
//   - SB_LUT4 (LUT_INIT, O the bit {I3 I2 I1 I0} of it; an unknown input known when it does not change O), SB_CARRY (CO = I0·I1 + (I0 + I1)·CI);
//   - the flip-flops SB_DFF, SB_DFFE (E the enable), SB_DFFSR / SB_DFFSS (a synchronous reset R / set S), SB_DFFR / SB_DFFS
//     (an asynchronous reset / set), SB_DFFESR / SB_DFFESS (the synchronous reset / set only with E, as the iCE40's logic
//     cell), SB_DFFER / SB_DFFES, each with its falling-edge SB_DFFN… twin; every one starts at 0 (cells_sim.v's);
//   - the I/O cells SB_IO, SB_GB_IO (and its GLOBAL_BUFFER_OUTPUT) and SB_IO_OD (open drain: drives 0, never 1): PIN_TYPE's
//     input (bit 0: the pad, else the input register on INPUT_CLK; bit 1 latched while LATCH_INPUT_VALUE), its output (bits
//     3-2: D_OUT_0, the output register on OUTPUT_CLK, inverted, or DDR, D_OUT_0 while OUTPUT_CLK is high, D_OUT_1 low) and
//     its enable (bits 5-4: none, always, OUTPUT_ENABLE, its register); D_IN_1 the input's falling-edge register (DDR);
//     CLOCK_ENABLE (1 when left open) gates the registers; NEG_TRIGGER swaps the edges;
//   - SB_GB (a global buffer), SB_WARMBOOT (no effect), SB_FILTER_50NS (passes its input);
//   - the PLLs SB_PLL40_CORE, SB_PLL40_PAD, SB_PLL40_2_PAD, SB_PLL40_2F_CORE and SB_PLL40_2F_PAD: the reference
//     (REFERENCECLK or PACKAGEPIN) × (DIVF + 1) / (DIVR + 1), / 2^DIVQ with FEEDBACK_PATH "SIMPLE" (TN1251's), PLLOUT_SELECT
//     "GENCLK" that, "GENCLK_HALF" half of it, "SHIFTREG_0deg" / "SHIFTREG_90deg" a quarter (SHIFTREG_DIV_MODE 0) or a
//     seventh of it, the latter a quarter of its period later; re-aligned to the reference's rising edges, LOCK after 3 of
//     them, RESETB low stops them (the outputs low), BYPASS the reference itself; SB_PLL40_2_PAD's port A the pad's clock.
//     The fine delays (FDA_*, DYNAMICDELAY) and EXTFEEDBACK are not modelled;
//   - the oscillators SB_HFOSC (48 MHz / 2^CLKHF_DIV, "0b00" … "0b11") and SB_LFOSC (10 kHz), running while their EN and
//     PU pins are 1;
//   - the LED drivers SB_RGBA_DRV and SB_RGB_DRV (RGBn pulled low, its LED lit, while RGBnPWM, RGBLEDEN and CURREN / RGBPU
//     are 1, else released) and SB_LED_DRV_CUR (LEDPU = EN);
//   - the block RAMs (SB_RAM40_4K…) and the UltraPlus's single-port RAM (SB_SPRAM256KA): ice40-ram.js; the DSP (SB_MAC16):
//     ice40-dsp.js.
// The I2C, SPI and LED-PWM hard IPs (SB_I2C, SB_SPI, SB_LEDDA_IP) are not modelled.
//
// Isomorphic ES module (browser + Node), no DOM.

import { ICE40_RAM_VHDL } from './ice40-ram.js';
import { ICE40_DSP_VHDL } from './ice40-dsp.js';

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';

const entity = (name, ports, body, { gens = '', decls = '' } = {}) => `
${IEEE}
entity ${name} is
${gens ? `  generic (${gens});\n` : ''}  port (${ports});
end ${name};
architecture silinx of ${name} is
${decls}begin
${body}
end silinx;`;

// buffers pass 0 / 1 (and the weak H / L as 1 / 0); anything else (Z, X) gives X (core/unisim.js's)
const BUF_X01 = (o, i) => `  ${o} <= '1' when ${i} = '1' or ${i} = 'H' else '0' when ${i} = '0' or ${i} = 'L' else 'X';`;

// (cells_sim.v's tree of 2:1 multiplexers: an unknown input known when every value it may take gives the same bit)
const LUT4 = entity('SB_LUT4', "O : out std_ulogic; I0, I1, I2, I3 : in std_ulogic := '0'", `  process (I0, I1, I2, I3)
    variable x : std_logic_vector(3 downto 0);
    variable r : std_ulogic;
    variable fits : boolean;
  begin
    x := I3 & I2 & I1 & I0;
    r := 'Z';
    for k in 0 to 15 loop
      fits := true;
      for i in 0 to 3 loop
        if (x(i) = '1' and (k / 2 ** i) mod 2 = 0) or (x(i) = '0' and (k / 2 ** i) mod 2 = 1) then fits := false; end if;
      end loop;
      if fits then
        if r = 'Z' then r := to_stdulogic(LUT_INIT(k)); elsif r /= to_stdulogic(LUT_INIT(k)) then r := 'X'; end if;
      end if;
    end loop;
    O <= r;
  end process;`, { gens: 'LUT_INIT : bit_vector(15 downto 0) := X"0000"' });

const CARRY = entity('SB_CARRY', "CO : out std_ulogic; I0, I1, CI : in std_ulogic := '0'", '  CO <= (I0 and I1) or ((I0 or I1) and CI);');

// flip-flops: [suffix, E, kind]: kind '' none, SR / SS a synchronous reset / set (R / S), R / S an asynchronous one
const FFS = [['', false, ''], ['E', true, ''], ['SR', false, 'SR'], ['R', false, 'R'], ['SS', false, 'SS'], ['S', false, 'S'],
  ['ESR', true, 'SR'], ['ER', true, 'R'], ['ESS', true, 'SS'], ['ES', true, 'S']];
const ff = ([suffix, e, kind], falling) => {
  const name = `SB_DFF${falling ? 'N' : ''}${suffix}`;
  // (SR / R: the reset pin R; SS / S: the set pin S)
  const pin = kind ? kind.at(-1) : null, val = pin === 'S' ? '1' : '0', asyn = kind.length === 1;
  const load = e ? "if E = '1' then q_i <= D; end if;" : 'q_i <= D;';
  // (the synchronous reset / set: with the enable, when there is one)
  const sync = kind.length === 2 ? (e ? `if E = '1' then if ${pin} = '1' then q_i <= '${val}'; else q_i <= D; end if; end if;` : `if ${pin} = '1' then q_i <= '${val}'; else q_i <= D; end if;`) : load;
  const edge = falling ? 'falling_edge(C)' : 'rising_edge(C)';
  return entity(name, `Q : out std_ulogic; C, D : in std_ulogic${e ? "; E : in std_ulogic := '1'" : ''}${pin ? `; ${pin} : in std_ulogic := '0'` : ''}`, `  Q <= q_i;
  process (C${asyn ? `, ${pin}` : ''})
  begin
    ${asyn ? `if ${pin} = '1' then q_i <= '${val}';\n    els` : ''}if ${edge} then
      ${sync}
    end if;
  end process;`, { decls: "  signal q_i : std_ulogic := '0';\n" });
};

// ---------------------------------------------------------------- the I/O cells
// SB_IO's body (cells_sim.v's): pins its pins' names (pin, the pad; od: an open-drain output)
const IO_PINS = { pin: 'PACKAGE_PIN', latch: 'LATCH_INPUT_VALUE', ce: 'CLOCK_ENABLE', iclk: 'INPUT_CLK', oclk: 'OUTPUT_CLK', oe: 'OUTPUT_ENABLE',
  d0: 'D_OUT_0', d1: 'D_OUT_1', i0: 'D_IN_0', i1: 'D_IN_1' };
const OD_PINS = { pin: 'PACKAGEPIN', latch: 'LATCHINPUTVALUE', ce: 'CLOCKENABLE', iclk: 'INPUTCLK', oclk: 'OUTPUTCLK', oe: 'OUTPUTENABLE',
  d0: 'DOUT0', d1: 'DOUT1', i0: 'DIN0', i1: 'DIN1' };
const io = (name, p, { gb = false, od = false } = {}) => entity(name, `${p.pin} : inout std_logic;${gb ? ' GLOBAL_BUFFER_OUTPUT : out std_ulogic;' : ''} ${p.i0}, ${p.i1} : out std_ulogic;
        ${p.latch}, ${p.iclk}, ${p.oclk}, ${p.oe}, ${p.d0}, ${p.d1} : in std_ulogic := '0'; ${p.ce} : in std_ulogic := '1'`, `  oc <= ${p.oclk} xor to_stdulogic(NEG_TRIGGER);
  -- (the registers on the clocks' own edges, not on ic's and oc's, a delta later: their inputs as at the edge)
  process (${p.iclk})
    variable c : std_ulogic;
  begin
    if ${p.ce} = '0' or ${p.ce} = 'L' then c := '0'; else c := '1'; end if;
    if (NEG_TRIGGER = '0' and rising_edge(${p.iclk})) or (NEG_TRIGGER = '1' and falling_edge(${p.iclk})) then
      ce_ri <= c;
      if c = '1' then din_q0 <= ${p.pin}; end if;
    elsif ((NEG_TRIGGER = '0' and falling_edge(${p.iclk})) or (NEG_TRIGGER = '1' and rising_edge(${p.iclk}))) and ce_ri = '1' then din_q1 <= ${p.pin};
    end if;
  end process;
  process (${p.oclk})
    variable c : std_ulogic;
  begin
    if ${p.ce} = '0' or ${p.ce} = 'L' then c := '0'; else c := '1'; end if;
    if (NEG_TRIGGER = '0' and rising_edge(${p.oclk})) or (NEG_TRIGGER = '1' and falling_edge(${p.oclk})) then
      ce_ro <= c;
      if c = '1' then dout_q0 <= ${p.d0}; oe_q <= ${p.oe}; end if;
    elsif ((NEG_TRIGGER = '0' and falling_edge(${p.oclk})) or (NEG_TRIGGER = '1' and rising_edge(${p.oclk}))) and ce_ro = '1' then dout_q1 <= ${p.d1};
    end if;
  end process;
  process (${p.pin}, din_q0, ${p.latch})
  begin
    if PIN_TYPE(1) = '0' or ${p.latch} /= '1' then
      if PIN_TYPE(0) = '1' then pin_in <= ${p.pin}; else pin_in <= din_q0; end if;
    end if;
  end process;
${BUF_X01(p.i0, 'pin_in')}
${BUF_X01(p.i1, 'din_q1')}
  dout <= (not dout_q0) when PIN_TYPE(3 downto 2) = "11" else ${p.d0} when PIN_TYPE(3 downto 2) = "10"
          else dout_q0 when PIN_TYPE(2) = '1' or oc = '1' else dout_q1;
  en <= '0' when PIN_TYPE(5 downto 4) = "00" else '1' when PIN_TYPE(5 downto 4) = "01" else ${p.oe} when PIN_TYPE(5 downto 4) = "10" else oe_q;
  ${p.pin} <= ${od ? "'0' when en = '1' and dout = '0' else 'Z' when en = '0' or dout = '1' else 'X'" : "dout when en = '1' else 'Z' when en = '0' else 'X'"};${gb ? `\n${BUF_X01('GLOBAL_BUFFER_OUTPUT', p.pin)}` : ''}`, {
  gens: `PIN_TYPE : bit_vector(5 downto 0) := "000000"; PULLUP : bit := '0'; NEG_TRIGGER : bit := '0'; IO_STANDARD : string := "SB_LVCMOS"`,
  decls: "  signal oc, ce_ri, ce_ro, en, dout : std_ulogic := '0';\n  signal pin_in, din_q0, din_q1, dout_q0, dout_q1, oe_q : std_ulogic := '0';\n",
});

const MISC = [
  entity('SB_GB', 'GLOBAL_BUFFER_OUTPUT : out std_ulogic; USER_SIGNAL_TO_GLOBAL_BUFFER : in std_ulogic', BUF_X01('GLOBAL_BUFFER_OUTPUT', 'USER_SIGNAL_TO_GLOBAL_BUFFER')),
  entity('SB_WARMBOOT', "BOOT, S1, S0 : in std_ulogic := '0'", '  -- (a warm boot reloads the configuration: nothing to simulate)'),
  entity('SB_FILTER_50NS', 'FILTEROUT : out std_ulogic; FILTERIN : in std_ulogic', BUF_X01('FILTEROUT', 'FILTERIN')),
  entity('SB_RGBA_DRV', "RGB0, RGB1, RGB2 : out std_logic; CURREN, RGBLEDEN, RGB0PWM, RGB1PWM, RGB2PWM : in std_ulogic := '0'",
    [0, 1, 2].map((i) => `  RGB${i} <= '0' when CURREN = '1' and RGBLEDEN = '1' and RGB${i}PWM = '1' else 'Z';`).join('\n'),
    { gens: 'CURRENT_MODE : string := "0b0"; RGB0_CURRENT, RGB1_CURRENT, RGB2_CURRENT : string := "0b000000"' }),
  entity('SB_RGB_DRV', "RGB0, RGB1, RGB2 : out std_logic; RGBPU, RGBLEDEN, RGB0PWM, RGB1PWM, RGB2PWM : in std_ulogic := '0'",
    [0, 1, 2].map((i) => `  RGB${i} <= '0' when RGBPU = '1' and RGBLEDEN = '1' and RGB${i}PWM = '1' else 'Z';`).join('\n'),
    { gens: 'CURRENT_MODE : string := "0b0"; RGB0_CURRENT, RGB1_CURRENT, RGB2_CURRENT : string := "0b000000"' }),
  entity('SB_LED_DRV_CUR', "LEDPU : out std_ulogic; EN : in std_ulogic := '0'", BUF_X01('LEDPU', 'EN')),
];

// ---------------------------------------------------------------- the PLLs and the oscillators
const PLL_LOCK_CYCLES = 3;
// an output of m periods every d of the reference's (its period p, re-measured at each of its rising edges), from the
// first of them on, sh of its periods' quarters later (a process of the PLL's architecture: rst, lk, p its signals)
const pllOut = (sig, ref, m, d, sh = '0') => `
  process (${ref}, rst)
    variable k : integer := 0;
    variable t : time;
  begin
    if rst then k := 0; ${sig} <= transport '0';
    elsif rising_edge(${ref}) and lk then
      if k = 0 then
        t := (p * (${d})) / (${m});
        for i in 0 to (${m}) - 1 loop
          ${sig} <= transport '1' after (t * (${sh})) / 4 + t * i;
          ${sig} <= transport '0' after (t * (${sh})) / 4 + t * i + t / 2;
        end loop;
      end if;
      k := k + 1;
      if k >= ${d} then k := 0; end if;
    end if;
  end process;`;
// a PLLOUT_SELECT's divider of the PLL's output (1, 2, 4 or 7) and its shift in quarters of its period
const SEL_FUNCS = `  function seldiv(s : string; mode : integer) return integer is
  begin
    if s = "GENCLK_HALF" then return 2;
    elsif s = "SHIFTREG_0deg" or s = "SHIFTREG_90deg" then
      if mode = 0 then return 4; else return 7; end if;
    else return 1;
    end if;
  end function;
  function selsh(s : string) return integer is
  begin
    if s = "SHIFTREG_90deg" then return 1; else return 0; end if;
  end function;
  function pick(s : boolean; q : integer) return integer is
  begin
    if s then return q; else return 1; end if;
  end function;
`;
// the PLLs: [name, its reference pin, its outputs ([suffix, select generic], a port A of the pad's own clock)]
const PLLS = [['SB_PLL40_CORE', 'REFERENCECLK', [['', 'PLLOUT_SELECT']]], ['SB_PLL40_PAD', 'PACKAGEPIN', [['', 'PLLOUT_SELECT']]],
  ['SB_PLL40_2_PAD', 'PACKAGEPIN', [['B', 'PLLOUT_SELECT_PORTB']], true],
  ['SB_PLL40_2F_CORE', 'REFERENCECLK', [['A', 'PLLOUT_SELECT_PORTA'], ['B', 'PLLOUT_SELECT_PORTB']]],
  ['SB_PLL40_2F_PAD', 'PACKAGEPIN', [['A', 'PLLOUT_SELECT_PORTA'], ['B', 'PLLOUT_SELECT_PORTB']]]];
const pll = ([name, ref, outs, padA]) => {
  const all = [...(padA ? ['A'] : []), ...outs.map(([x]) => x)];
  const two = all.length > 1 || padA;
  const sels = outs.map(([, g]) => `${g} : string := "GENCLK"`);
  return entity(name, `${all.map((x) => `PLLOUTCORE${x}, PLLOUTGLOBAL${x}`).join(', ')}, LOCK, SDO : out std_ulogic;
        ${ref} : in std_ulogic; RESETB : in std_ulogic := '1'; BYPASS, EXTFEEDBACK, LATCHINPUTVALUE, SDI, SCLK : in std_ulogic := '0';
        DYNAMICDELAY : in std_logic_vector(7 downto 0) := (others => '0')`, `  rst <= RESETB = '0';
  process (${ref}, rst)
    variable last : time := 0 ns;
    variable n : integer := 0;
  begin
    if rst then n := 0; lk <= false;
    elsif rising_edge(${ref}) then
      if n > 0 then p <= now - last; end if;
      last := now;
      if n < ${PLL_LOCK_CYCLES} then n := n + 1; end if;
      lk <= n >= ${PLL_LOCK_CYCLES};
    end if;
  end process;
${outs.map(([x, g]) => pllOut(`o${x}`, ref, 'FMUL', `FDIV * seldiv(${g}, SDIV_MODE)`, `selsh(${g})`)).join('')}
${all.map((x) => {
  const v = padA && x === 'A' ? ref : `o${x}`;
  return `  PLLOUTCORE${x} <= ${ref} when BYPASS = '1' else ${v};\n  PLLOUTGLOBAL${x} <= ${ref} when BYPASS = '1' else ${v};`;
}).join('\n')}
  LOCK <= '1' when lk else '0';
  SDO <= '0';`, {
    gens: [`FEEDBACK_PATH : string := "SIMPLE"`, 'DELAY_ADJUSTMENT_MODE_FEEDBACK, DELAY_ADJUSTMENT_MODE_RELATIVE : string := "FIXED"',
      `SHIFTREG_DIV_MODE : bit_vector(${two && !padA ? 1 : 0} downto 0) := (others => '0')`, 'FDA_FEEDBACK, FDA_RELATIVE : bit_vector(3 downto 0) := "0000"',
      ...sels, 'DIVR : bit_vector(3 downto 0) := "0000"', 'DIVF : bit_vector(6 downto 0) := "0000000"', 'DIVQ : bit_vector(2 downto 0) := "000"',
      'FILTER_RANGE : bit_vector(2 downto 0) := "000"', ...(two ? outs.map(([x]) => `ENABLE_ICEGATE_PORT${x} : bit := '0'`) : ["ENABLE_ICEGATE : bit := '0'"]),
      "TEST_MODE : bit := '0'", 'EXTERNAL_DIVIDE_FACTOR : integer := 1'].join(';\n           '),
    decls: `${SEL_FUNCS}  constant SIMPLE : boolean := FEEDBACK_PATH = "SIMPLE";
  constant FMUL : integer := to_integer(unsigned(to_stdlogicvector(DIVF))) + 1;
  constant QDIV : integer := 2 ** to_integer(unsigned(to_stdlogicvector(DIVQ)));
  -- (in the feedback modes other than SIMPLE the feedback is taken after DIVQ: TN1251)
  constant FDIV : integer := (to_integer(unsigned(to_stdlogicvector(DIVR))) + 1) * pick(SIMPLE, QDIV);
  constant SDIV_MODE : integer := to_integer(unsigned(to_stdlogicvector(SHIFTREG_DIV_MODE)));
  signal p : time := 0 ns;               -- the reference's period
  signal lk, rst : boolean := false;
  signal ${outs.map(([x]) => `o${x}`).join(', ')} : std_ulogic := '0';
`,
  });
};

// an oscillator: out at its frequency (half its half period), while en (low for its first half period)
const osc = (name, out, en, half, gens = '', decls = '') => entity(name, `${out} : out std_ulogic; ${en.join(', ')} : in std_ulogic := '0'`, `  process
  begin
    o <= '0';
    wait for half;
    o <= '1';
    wait for half;
  end process;
  ${out} <= o when ${en.map((x) => `${x} = '1'`).join(' and ')} else '0';`, {
  gens, decls: `${decls}  constant half : time := ${half};\n  signal o : std_ulogic := '0';\n`,
});
const HFOSC = osc('SB_HFOSC', 'CLKHF', ['CLKHFPU', 'CLKHFEN'], '(1000000 ps * 2 ** hfdiv(CLKHF_DIV)) / 96', 'TRIM_EN : string := "0b0"; CLKHF_DIV : string := "0b00"',
  `  function hfdiv(s : string) return integer is
    variable r : integer := 0;
  begin
    for i in 3 to s'length loop
      if s(i) = '1' then r := r * 2 + 1; elsif s(i) = '0' then r := r * 2; end if;
    end loop;
    return r;
  end function;
`).replace("CLKHFPU, CLKHFEN : in std_ulogic := '0'", "CLKHFPU, CLKHFEN : in std_ulogic := '0'; TRIM0, TRIM1, TRIM2, TRIM3, TRIM4, TRIM5, TRIM6, TRIM7, TRIM8, TRIM9 : in std_ulogic := '0'");
const LFOSC = osc('SB_LFOSC', 'CLKLF', ['CLKLFPU', 'CLKLFEN'], '50 us');

/** VHDL source of the iCE40 primitives (compiled with a design that instantiates them). */
export const ICE40_VHDL = [
  `-- Silinx iCE40 primitives (functional models; see packages/silinx-hdl/src/ice40-prims.js)
package COMPONENTS is
end COMPONENTS;`,
  LUT4, CARRY, ...FFS.flatMap((f) => [ff(f, false), ff(f, true)]),
  io('SB_IO', IO_PINS), io('SB_GB_IO', IO_PINS, { gb: true }), io('SB_IO_OD', OD_PINS, { od: true }),
  ...MISC, ...PLLS.map(pll), HFOSC, LFOSC,
  ICE40_RAM_VHDL, ICE40_DSP_VHDL,
].join('\n');

/** The source entry to add to a compilation whose sources use the iCE40 primitives. */
export const ICE40_SOURCE = { path: '<silinx>/ice40.vhd', lang: 'vhdl', text: ICE40_VHDL };

/** The iCE40 primitives Silinx simulates. */
export const ICE40_CELLS = new Set([...ICE40_VHDL.matchAll(/^entity\s+(\w+)\s+is\b/gim)].map((m) => m[1]));

/** True if a VHDL source uses Lattice's iCE40 library (`library sb_ice40_components_syn;`). */
export const usesIce40 = (text) => /\blibrary\s+sb_ice40_components_syn\s*;/i.test(String(text || ''));
