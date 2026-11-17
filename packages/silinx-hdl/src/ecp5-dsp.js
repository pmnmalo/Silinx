// Silinx - the ECP5's multiplier (#2299): ecp5-prims.js's MULT18X18D, as Yosys's synth_ecp5 maps a product onto it
// (techlibs/lattice/dsp_map_18x18.v: combinational, every register off) and Lattice's sysDSP guide (TN1267) describes it
// (cells_bb.v has it as a black box): P = A × B (36 bits), each operand signed when its SIGNEDA / SIGNEDB is 1 (SIGNEDP the
// product's: either); SOURCEA / SOURCEB take the shift inputs SRIA / SRIB in place of A / B; SROA / SROB the operands
// (after their registers), ROA / ROB / ROC the operands and C; the registers REG_INPUTA / B / C, REG_PIPELINE and
// REG_OUTPUT on the clock their *_CLK names ("NONE": none; "CLK0" … "CLK3"), with the enable *_CE ("CE0" … "CE3") and the
// reset *_RST ("RST0" … "RST3": on the clock's edge, RESETMODE "SYNC", or at once, "ASYNC"), all starting at 0. MULT_BYPASS,
// the cascade and the clock dividers are not modelled; an unknown operand bit makes P unknown.
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const range = (n) => Array.from({ length: n }, (_, i) => i);
const vec = (pre, n) => range(n).reverse().map((i) => `${pre}${i}`).join(' & ');
const REGS = ['INPUTA', 'INPUTB', 'INPUTC', 'PIPELINE', 'OUTPUT'];

// a register (its name, its input, its output signal) on the clock its generics name; q_v its value or, with no clock, its input
const reg = (r, d, q) => `  process (CLK0, CLK1, CLK2, CLK3, RST0, RST1, RST2, RST3)
    variable c, e, rs : integer;
    variable ev, rv : std_logic_vector(0 to 3);
  begin
    c := num(REG_${r}_CLK); e := num(REG_${r}_CE); rs := num(REG_${r}_RST);
    ev := CE0 & CE1 & CE2 & CE3; rv := RST0 & RST1 & RST2 & RST3;
    if c >= 0 then
      if RESETMODE = "ASYNC" and rs >= 0 and rv(rs) = '1' then ${q} <= (others => '0');
      elsif (c = 0 and rising_edge(CLK0)) or (c = 1 and rising_edge(CLK1)) or (c = 2 and rising_edge(CLK2)) or (c = 3 and rising_edge(CLK3)) then
        if RESETMODE = "SYNC" and rs >= 0 and rv(rs) = '1' then ${q} <= (others => '0');
        elsif e < 0 or ev(e) = '1' then ${q} <= ${d};
        end if;
      end if;
    end if;
  end process;
  ${q}_v <= ${q} when num(REG_${r}_CLK) >= 0 else ${d};`;

/** VHDL source of the ECP5's multiplier (joined to ecp5-prims.js's ECP5_VHDL). */
export const ECP5_DSP_VHDL = `
${IEEE}
entity MULT18X18D is
  generic (${REGS.map((r) => `REG_${r}_CLK : string := "NONE"; REG_${r}_CE : string := "CE0"; REG_${r}_RST : string := "RST0"`).join(';\n    ')};
    CLK0_DIV, CLK1_DIV, CLK2_DIV, CLK3_DIV : string := "ENABLED"; HIGHSPEED_CLK : string := "NONE"; GSR : string := "ENABLED";
    CAS_MATCH_REG : string := "FALSE"; SOURCEB_MODE : string := "B_SHIFT"; MULT_BYPASS : string := "DISABLED"; RESETMODE : string := "SYNC");
  port (${vec('P', 36).split(' & ').join(', ')}, SIGNEDP : out std_ulogic;
    ${['SROA', 'SROB', 'ROA', 'ROB', 'ROC'].map((p) => vec(p, 18).split(' & ').join(', ')).join(',\n    ')} : out std_ulogic;
    ${['A', 'B', 'C', 'SRIA', 'SRIB'].map((p) => vec(p, 18).split(' & ').join(', ')).join(',\n    ')} : in std_ulogic := '0';
    SIGNEDA, SIGNEDB, SOURCEA, SOURCEB, CLK0, CLK1, CLK2, CLK3, RST0, RST1, RST2, RST3 : in std_ulogic := '0';
    CE0, CE1, CE2, CE3 : in std_ulogic := '1');
end MULT18X18D;
architecture silinx of MULT18X18D is
  -- a register's clock, enable or reset: its number ("CLK2": 2), -1 for "NONE"
  function num(s : string) return integer is
  begin
    if s'length >= 1 and character'pos(s(s'length)) >= 48 and character'pos(s(s'length)) <= 51 and s /= "NONE" then return character'pos(s(s'length)) - 48; end if;
    return -1;
  end function;
  function known(v : std_logic_vector) return boolean is
  begin
    for i in v'range loop
      if v(i) /= '0' and v(i) /= '1' then return false; end if;
    end loop;
    return true;
  end function;
  -- the operands (with their signs), their registers, the product, its registers
  signal ai, bi, ar, br, ar_v, br_v, c, cr, cr_v : std_logic_vector(18 downto 0) := (others => '0');
  signal prod, pr, pr_v, orr, orr_v : std_logic_vector(36 downto 0) := (others => '0');
begin
  ai <= SIGNEDA & ${vec('SRIA', 18)} when SOURCEA = '1' else SIGNEDA & ${vec('A', 18)};
  bi <= SIGNEDB & ${vec('SRIB', 18)} when SOURCEB = '1' else SIGNEDB & ${vec('B', 18)};
  c <= '0' & ${vec('C', 18)};
${reg('INPUTA', 'ai', 'ar')}
${reg('INPUTB', 'bi', 'br')}
${reg('INPUTC', 'c', 'cr')}
  -- (each operand one bit wider: its sign bit, or a 0; bit 36 of the product its SIGNEDP)
  process (ar_v, br_v)
    variable x, y : signed(18 downto 0);
    variable p : signed(37 downto 0);
  begin
    if not known(ar_v) or not known(br_v) then prod <= (others => 'X');
    else
      if ar_v(18) = '1' then x := signed(ar_v(17) & ar_v(17 downto 0)); else x := signed('0' & ar_v(17 downto 0)); end if;
      if br_v(18) = '1' then y := signed(br_v(17) & br_v(17 downto 0)); else y := signed('0' & br_v(17 downto 0)); end if;
      p := x * y;
      prod <= (ar_v(18) or br_v(18)) & std_logic_vector(p(35 downto 0));
    end if;
  end process;
${reg('PIPELINE', 'prod', 'pr')}
${reg('OUTPUT', 'pr_v', 'orr')}
${range(36).map((i) => `  P${i} <= orr_v(${i});`).join('\n')}
  SIGNEDP <= orr_v(36);
${range(18).map((i) => `  SROA${i} <= ar_v(${i}); SROB${i} <= br_v(${i}); ROA${i} <= ar_v(${i}); ROB${i} <= br_v(${i}); ROC${i} <= cr_v(${i});`).join('\n')}
end silinx;`;
