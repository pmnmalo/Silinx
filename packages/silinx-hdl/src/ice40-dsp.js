// Silinx - the iCE40 UltraPlus's DSP (#2299): ice40-prims.js's SB_MAC16, written from Yosys's techlibs/ice40/cells_sim.v
// (its behavioural model, register for register) and Lattice's DSP function usage guide (TN1295):
//   - the inputs' registers C, A (IRSTTOP their reset) and B, D (IRSTBOT), each with its *_REG and *HOLD;
//   - the 8 × 8 products of A's and B's halves (A_SIGNED, B_SIGNED the high halves', MODE_8x8 the low ones' too): F (high ×
//     high), J, K (the cross ones) and G (low × low), each with its register (TOP_8x8_MULT_REG, PIPELINE_16x16_MULT_REG1,
//     BOT_8x8_MULT_REG), and H = the 16 × 16 product with its own (PIPELINE_16x16_MULT_REG2);
//   - the two 16-bit adders / subtracters, the top's X (*ADDSUB_LOWERINPUT: A, F, H's high half, the bottom's sign) plus or
//     minus (ADDSUBTOP) W (*ADDSUB_UPPERINPUT: its accumulator Q, or C) and its carry in (TOPADDSUB_CARRYSELECT: 0, 1, the
//     bottom's carry out, it xor ADDSUBBOT), the bottom's Z (B, G, H's low half, SIGNEXTIN) ± Y (S, or D) and its carry
//     (0, 1, ACCUMCI, CI); OLOADTOP / OLOADBOT load C / D in place of the sum; the accumulators Q and S (ORSTTOP, ORSTBOT,
//     OHOLDTOP, OHOLDBOT);
//   - O's high half (TOPOUTPUT_SELECT: the sum, Q, F, H's high half) and low half (BOTOUTPUT_SELECT: the sum, S, G, H's low
//     half), CO and ACCUMCO the top's carries, SIGNEXTOUT X's sign;
//   - the registers on CLK's rising edge (NEG_TRIGGER: its falling edge) with CE; an unknown bit of an unregistered operand
//     or of a control makes the outputs unknown (a register loads it as 0).
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';

const BITS = ['NEG_TRIGGER', 'C_REG', 'A_REG', 'B_REG', 'D_REG', 'TOP_8x8_MULT_REG', 'BOT_8x8_MULT_REG', 'PIPELINE_16x16_MULT_REG1',
  'PIPELINE_16x16_MULT_REG2', 'TOPADDSUB_UPPERINPUT', 'BOTADDSUB_UPPERINPUT', 'MODE_8x8', 'A_SIGNED', 'B_SIGNED'];
const PAIRS = ['TOPOUTPUT_SELECT', 'TOPADDSUB_LOWERINPUT', 'TOPADDSUB_CARRYSELECT', 'BOTOUTPUT_SELECT', 'BOTADDSUB_LOWERINPUT', 'BOTADDSUB_CARRYSELECT'];

/** VHDL source of the iCE40's DSP (joined to ice40-prims.js's ICE40_VHDL). */
export const ICE40_DSP_VHDL = `
${IEEE}
entity SB_MAC16 is
  generic (${BITS.map((b) => `${b} : bit := '0'`).join('; ')};
    ${PAIRS.map((p) => `${p} : bit_vector(1 downto 0) := "00"`).join('; ')});
  port (O : out std_logic_vector(31 downto 0); CO, ACCUMCO, SIGNEXTOUT : out std_ulogic;
    C, A, B, D : in std_logic_vector(15 downto 0) := (others => '0');
    CLK : in std_ulogic := '0'; CE : in std_ulogic := '1';
    AHOLD, BHOLD, CHOLD, DHOLD, IRSTTOP, IRSTBOT, ORSTTOP, ORSTBOT, OLOADTOP, OLOADBOT, ADDSUBTOP, ADDSUBBOT,
    OHOLDTOP, OHOLDBOT, CI, ACCUMCI, SIGNEXTIN : in std_ulogic := '0');
end SB_MAC16;
architecture silinx of SB_MAC16 is
  function sel(v : bit_vector(1 downto 0)) return integer is
  begin
    return to_integer(unsigned(to_stdlogicvector(v)));
  end function;
  function known(v : std_logic_vector) return boolean is
  begin
    for i in v'range loop
      if v(i) /= '0' and v(i) /= '1' then return false; end if;
    end loop;
    return true;
  end function;
  -- a half (hi: the high one) of a 16-bit operand as 16 bits: sign-extended when s, else zero-extended
  function half(v : unsigned(15 downto 0); hi, s : boolean) return unsigned is
    variable h : unsigned(7 downto 0);
  begin
    if hi then h := v(15 downto 8); else h := v(7 downto 0); end if;
    if s and h(7) = '1' then return X"FF" & h; else return X"00" & h; end if;
  end function;
  signal rA, rB, rC, rD, rF, rJ, rK, rG, rQ, rS : unsigned(15 downto 0) := (others => '0');
  signal rH : unsigned(31 downto 0) := (others => '0');
  -- the combinational values: the inputs, the products, the sums
  signal vA, vB, vC, vD, pF, pJ, pK, pG, vF, vG, vP, vR : unsigned(15 downto 0) := (others => '0');
  signal vL, vH : unsigned(31 downto 0) := (others => '0');
  signal bad : boolean := false;
  signal co_i, aco_i, sx_i : std_ulogic := '0';
begin
  -- (an unknown bit of an unregistered operand or of a control; a register loads an unknown bit as 0)
  bad <= (A_REG = '0' and not known(A)) or (B_REG = '0' and not known(B)) or (C_REG = '0' and not known(C)) or (D_REG = '0' and not known(D))
         or not known(ADDSUBTOP & ADDSUBBOT & OLOADTOP & OLOADBOT & CI & ACCUMCI & SIGNEXTIN);
  vA <= rA when A_REG = '1' else unsigned(to_01(A));
  vB <= rB when B_REG = '1' else unsigned(to_01(B));
  vC <= rC when C_REG = '1' else unsigned(to_01(C));
  vD <= rD when D_REG = '1' else unsigned(to_01(D));
  process (vA, vB)
    variable ah, al, bh, bl : unsigned(15 downto 0);
  begin
    ah := half(vA, true, A_SIGNED = '1'); al := half(vA, false, A_SIGNED = '1' and MODE_8x8 = '1');
    bh := half(vB, true, B_SIGNED = '1'); bl := half(vB, false, B_SIGNED = '1' and MODE_8x8 = '1');
    pF <= resize(ah * bh, 16);
    pJ <= resize(resize(al(7 downto 0), 16) * bh, 16);
    pK <= resize(ah * resize(bl(7 downto 0), 16), 16);
    pG <= resize(al * bl, 16);
  end process;
  vF <= rF when TOP_8x8_MULT_REG = '1' else pF;
  vG <= rG when BOT_8x8_MULT_REG = '1' else pG;
  process (pJ, pK, rJ, rK, vF, vG)
    variable j, k : unsigned(15 downto 0);
    variable je, ke : unsigned(31 downto 0);
  begin
    if PIPELINE_16x16_MULT_REG1 = '1' then j := rJ; k := rK; else j := pJ; k := pK; end if;
    if A_SIGNED = '1' and k(15) = '1' then ke := X"00FF" & k; else ke := X"0000" & k; end if;
    if B_SIGNED = '1' and j(15) = '1' then je := X"00FF" & j; else je := X"0000" & j; end if;
    vL <= resize(vG, 32) + shift_left(ke, 8) + shift_left(je, 8) + shift_left(resize(vF, 32), 16);
  end process;
  vH <= rH when PIPELINE_16x16_MULT_REG2 = '1' else vL;
  -- the adders: the bottom's first (the top's carry in and lower input may be its)
  process (vA, vB, vC, vD, vF, vG, vH, rQ, rS, ADDSUBTOP, ADDSUBBOT, OLOADTOP, OLOADBOT, CI, ACCUMCI, SIGNEXTIN)
    variable x, w, y, z, mt, mb : unsigned(15 downto 0);
    variable st, sb : unsigned(16 downto 0);
    variable lci, hci, lco : unsigned(0 downto 0);
  begin
    if ADDSUBTOP = '1' then mt := X"FFFF"; else mt := X"0000"; end if;
    if ADDSUBBOT = '1' then mb := X"FFFF"; else mb := X"0000"; end if;
    if BOTADDSUB_UPPERINPUT = '1' then y := vD; else y := rS; end if;
    case sel(BOTADDSUB_LOWERINPUT) is
      when 0 => z := vB; when 1 => z := vG; when 2 => z := vH(15 downto 0);
      when others => if SIGNEXTIN = '1' then z := X"FFFF"; else z := X"0000"; end if;
    end case;
    case sel(BOTADDSUB_CARRYSELECT) is
      when 0 => lci := "0"; when 1 => lci := "1";
      when 2 => if ACCUMCI = '1' then lci := "1"; else lci := "0"; end if;
      when others => if CI = '1' then lci := "1"; else lci := "0"; end if;
    end case;
    sb := resize(z, 17) + resize(y xor mb, 17) + resize(lci, 17);
    lco := sb(16 downto 16);
    if OLOADBOT = '1' then vR <= vD; else vR <= sb(15 downto 0) xor mb; end if;
    if TOPADDSUB_UPPERINPUT = '1' then w := vC; else w := rQ; end if;
    case sel(TOPADDSUB_LOWERINPUT) is
      when 0 => x := vA; when 1 => x := vF; when 2 => x := vH(31 downto 16);
      when others => if z(15) = '1' then x := X"FFFF"; else x := X"0000"; end if;
    end case;
    case sel(TOPADDSUB_CARRYSELECT) is
      when 0 => hci := "0"; when 1 => hci := "1"; when 2 => hci := lco;
      when others => if ADDSUBBOT = '1' then hci := not lco; else hci := lco; end if;
    end case;
    st := resize(x, 17) + resize(w xor mt, 17) + resize(hci, 17);
    aco_i <= st(16);
    co_i <= st(16) xor ADDSUBTOP;
    if OLOADTOP = '1' then vP <= vC; else vP <= st(15 downto 0) xor mt; end if;
    sx_i <= x(15);
  end process;
  -- (the registers on CLK's own edge, the one NEG_TRIGGER chooses: their inputs as at the edge)
  process (CLK, IRSTTOP)
  begin
    if IRSTTOP = '1' then rC <= (others => '0'); rA <= (others => '0'); rF <= (others => '0'); rJ <= (others => '0');
    elsif ((NEG_TRIGGER = '0' and rising_edge(CLK)) or (NEG_TRIGGER = '1' and falling_edge(CLK))) and CE = '1' then
      if CHOLD /= '1' then rC <= unsigned(to_01(C)); end if;
      if AHOLD /= '1' then rA <= unsigned(to_01(A)); end if;
      rF <= pF;
      if MODE_8x8 = '0' then rJ <= pJ; end if;
    end if;
  end process;
  process (CLK, IRSTBOT)
  begin
    if IRSTBOT = '1' then rB <= (others => '0'); rD <= (others => '0'); rK <= (others => '0'); rG <= (others => '0'); rH <= (others => '0');
    elsif ((NEG_TRIGGER = '0' and rising_edge(CLK)) or (NEG_TRIGGER = '1' and falling_edge(CLK))) and CE = '1' then
      if BHOLD /= '1' then rB <= unsigned(to_01(B)); end if;
      if DHOLD /= '1' then rD <= unsigned(to_01(D)); end if;
      if MODE_8x8 = '0' then rK <= pK; rH <= vL; end if;
      rG <= pG;
    end if;
  end process;
  process (CLK, ORSTTOP)
  begin
    if ORSTTOP = '1' then rQ <= (others => '0');
    elsif ((NEG_TRIGGER = '0' and rising_edge(CLK)) or (NEG_TRIGGER = '1' and falling_edge(CLK))) and CE = '1' and OHOLDTOP /= '1' then rQ <= vP;
    end if;
  end process;
  process (CLK, ORSTBOT)
  begin
    if ORSTBOT = '1' then rS <= (others => '0');
    elsif ((NEG_TRIGGER = '0' and rising_edge(CLK)) or (NEG_TRIGGER = '1' and falling_edge(CLK))) and CE = '1' and OHOLDBOT /= '1' then rS <= vR;
    end if;
  end process;
  process (vP, rQ, vF, vH, vR, rS, vG, bad, co_i, aco_i, sx_i)
    variable hi, lo : unsigned(15 downto 0);
  begin
    case sel(TOPOUTPUT_SELECT) is
      when 0 => hi := vP; when 1 => hi := rQ; when 2 => hi := vF; when others => hi := vH(31 downto 16);
    end case;
    case sel(BOTOUTPUT_SELECT) is
      when 0 => lo := vR; when 1 => lo := rS; when 2 => lo := vG; when others => lo := vH(15 downto 0);
    end case;
    if bad then O <= (others => 'X'); CO <= 'X'; ACCUMCO <= 'X'; SIGNEXTOUT <= 'X';
    else O <= std_logic_vector(hi & lo); CO <= co_i; ACCUMCO <= aco_i; SIGNEXTOUT <= sx_i;
    end if;
  end process;
end silinx;`;
