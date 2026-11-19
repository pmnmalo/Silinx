// Silinx - the 7-series UNISIM primitives the open synthesis maps onto beyond the Spartan-6's (Yosys synth_xilinx -arch xc7,
// #4362: the 7-series' Post-Synthesis model): Silinx's own functional models, written from the documented behaviour of each
// primitive (7 Series FPGAs Libraries Guide UG953, the block RAM and DSP48E1 user guides UG473 and UG479), as unisim-s6.js's.
// No timing; the Xilinx UNISIM sources are not used (nor redistributed). The LUTs, flip-flops, CARRY4, MUXF7 / 8, SRLs, the
// distributed RAMs and the buffers are unisim.js's and unisim-s6.js's.
//   - DSP48E1: its pipeline registers (AREG / BREG 0, 1 or 2, ACASCREG, BCASCREG, CREG, DREG, ADREG, MREG, PREG, INMODEREG,
//     OPMODEREG, ALUMODEREG, CARRYINREG, CARRYINSELREG), A_INPUT / B_INPUT (DIRECT or the cascade's ACIN / BCIN); INMODE: A1
//     or A2 (0), A zeroed (1), D (2), D - A (3), B1 or B2 (4) into the pre-adder (USE_DPORT) and the 25 x 18 signed
//     multiplier (USE_MULT "NONE": 0); the X (0, M, P, A:B), Y (0, M, all ones, C) and Z (0, PCIN, P, C, P, PCIN >> 17,
//     P >> 17) multiplexers of OPMODE, M taken once when X and Y both select it; ALUMODE's sums (Z + X + Y + CIN, Z - (X + Y
//     + CIN), -Z + (X + Y + CIN) - 1, -Z - X - Y - CIN - 1) and logic (X xor / xnor / and / or … Z, by OPMODE(3 downto 2)
//     and ALUMODE); CARRYINSEL's carry in (CARRYIN, PCIN(47) and its complement, CARRYCASCIN, the CARRYCASCOUT before,
//     P(47) and its complement, the multiplier's rounding A(24) xnor B(17)); CARRYOUT(3) and CARRYCASCOUT the sum's 49th
//     bit; the pattern detector (USE_PATTERN_DETECT "PATDET": PATTERN or C, MASK or C), registered with P; the IS_*_INVERTED
//     generics. USE_SIMD other than ONE48, AUTORESET_PATDET and OVERFLOW / UNDERFLOW are not modelled (USE_SIMD a warning);
//   - RAMB18E1 (18 Kbit) and RAMB36E1 (36 Kbit, its cascade not modelled): RAM_MODE TDP, a port's READ_WIDTH and
//     WRITE_WIDTH apart (1, 2, 4, 9, 18, and 36 on the RAMB36E1; 0 none), or SDP, port A reading and port B writing,
//     36 bits (72 on the RAMB36E1: DOBDO & DOADO, DIBDI & DIADI, WEBWE) or the port's own width; INIT_xx / INITP_xx, byte
//     write enables (a port of 18 bits or more: one WE bit a byte and its parity bit; narrower: WE(0)), WRITE_MODE
//     (WRITE_FIRST, READ_FIRST, NO_CHANGE), the output latch (RSTRAM: SRVAL) and register (DOx_REG, REGCE, RSTREG:
//     SRVAL, RSTREG_PRIORITY), INIT the output at start (an unknown bit of INIT, SRVAL or the contents, Yosys's don't
//     care, 0). On an edge the ports' reads (but WRITE_FIRST's of a port that
//     writes), then their writes, then those WRITE_FIRST reads; collisions are not checked.
//
// Isomorphic ES module (browser + Node), no DOM.

import { hex2 } from './util.js';

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const zeros = (bits) => `X"${'0'.repeat(Math.ceil(bits / 4))}"`;
const Z = (n) => `(${n - 1} downto 0 => '0')`;

// ------------------------------------------------------------------ DSP48E1
// a register: synchronous reset before the clock enable, on the clock's edge (IS_CLK_INVERTED: its falling one)
const reg = (r, d, ce, rst, zero) => `    if edge then
      if ${rst} = '1' then ${r} <= ${zero}; elsif ${ce} = '1' then ${r} <= ${d}; end if;
    end if;`;
const DSP48E1 = `
${IEEE}
entity DSP48E1 is
  generic (ACASCREG, ADREG, ALUMODEREG, AREG, BCASCREG, BREG, CARRYINREG, CARRYINSELREG, CREG, DREG, INMODEREG, MREG,
           OPMODEREG, PREG : integer := 1;
           A_INPUT, B_INPUT : string := "DIRECT"; AUTORESET_PATDET : string := "NO_RESET"; USE_DPORT : string := "FALSE";
           USE_MULT : string := "MULTIPLY"; USE_PATTERN_DETECT : string := "NO_PATDET"; USE_SIMD : string := "ONE48";
           SEL_MASK : string := "MASK"; SEL_PATTERN : string := "PATTERN";
           MASK : bit_vector(47 downto 0) := X"3FFFFFFFFFFF"; PATTERN : bit_vector(47 downto 0) := X"000000000000";
           IS_ALUMODE_INVERTED : bit_vector(3 downto 0) := "0000"; IS_CARRYIN_INVERTED, IS_CLK_INVERTED : bit := '0';
           IS_INMODE_INVERTED : bit_vector(4 downto 0) := "00000"; IS_OPMODE_INVERTED : bit_vector(6 downto 0) := "0000000");
  port (ACOUT : out std_logic_vector(29 downto 0); BCOUT : out std_logic_vector(17 downto 0);
        CARRYOUT : out std_logic_vector(3 downto 0); CARRYCASCOUT, MULTSIGNOUT, OVERFLOW, UNDERFLOW,
        PATTERNDETECT, PATTERNBDETECT : out std_ulogic; P, PCOUT : out std_logic_vector(47 downto 0);
        A, ACIN : in std_logic_vector(29 downto 0) := (others => '0'); B, BCIN : in std_logic_vector(17 downto 0) := (others => '0');
        C, PCIN : in std_logic_vector(47 downto 0) := (others => '0'); D : in std_logic_vector(24 downto 0) := (others => '0');
        ALUMODE : in std_logic_vector(3 downto 0) := (others => '0'); CARRYINSEL : in std_logic_vector(2 downto 0) := (others => '0');
        INMODE : in std_logic_vector(4 downto 0) := (others => '0'); OPMODE : in std_logic_vector(6 downto 0) := (others => '0');
        CARRYIN, CARRYCASCIN, MULTSIGNIN, CLK : in std_ulogic := '0';
        CEA1, CEA2, CEAD, CEALUMODE, CEB1, CEB2, CEC, CECARRYIN, CECTRL, CED, CEINMODE, CEM, CEP : in std_ulogic := '1';
        RSTA, RSTALLCARRYIN, RSTALUMODE, RSTB, RSTC, RSTCTRL, RSTD, RSTINMODE, RSTM, RSTP : in std_ulogic := '0');
end DSP48E1;
architecture silinx of DSP48E1 is
  signal a_in, a1_r, a2_r, a1, a2 : std_logic_vector(29 downto 0) := (others => '0');
  signal b_in, b1_r, b2_r, b1, b2, bm : std_logic_vector(17 downto 0) := (others => '0');
  signal d_r, d_m, ad, ad_r, ad_m : std_logic_vector(24 downto 0) := (others => '0');
  signal prod, m_r, m_m : std_logic_vector(42 downto 0) := (others => '0');
  signal c_r, c_m, x, y, z, p_r, alu, xy, msk, pat : std_logic_vector(47 downto 0) := (others => '0');
  signal sum : std_logic_vector(48 downto 0) := (others => '0');
  signal inm_i, inm_r, inm : std_logic_vector(4 downto 0) := (others => '0');
  signal op_i, op_r, op : std_logic_vector(6 downto 0) := (others => '0');
  signal alm_i, alm_r, alm : std_logic_vector(3 downto 0) := (others => '0');
  signal cis_r, cis : std_logic_vector(2 downto 0) := (others => '0');
  signal cin_i, cin_r, cin_m, rnd, rnd_r, rnd_m, cin, cout, cout_r, cout_m, pd, pbd, pd_r, pbd_r : std_ulogic := '0';
  signal edge : boolean := false;
begin
  process
  begin
    if USE_SIMD /= "ONE48" then
      report "DSP48E1: USE_SIMD " & USE_SIMD & " is not modelled: its ALU is ONE48's" severity warning;
    end if;
    wait;
  end process;
  edge <= (IS_CLK_INVERTED = '0' and rising_edge(CLK)) or (IS_CLK_INVERTED = '1' and falling_edge(CLK));
  -- A and B: the direct inputs or the cascade's, their two registers (A1 the first of two, A2 the last)
  a_in <= ACIN when A_INPUT = "CASCADE" else A;
  b_in <= BCIN when B_INPUT = "CASCADE" else B;
  a2 <= a_in when AREG = 0 else a2_r;
  a1 <= a1_r when AREG = 2 else a2;
  b2 <= b_in when BREG = 0 else b2_r;
  b1 <= b1_r when BREG = 2 else b2;
  ACOUT <= a1 when AREG = 2 and ACASCREG = 1 else a2;
  BCOUT <= b1 when BREG = 2 and BCASCREG = 1 else b2;
  -- the control inputs (their inversions), registered or not
  inm_i <= INMODE xor to_stdlogicvector(IS_INMODE_INVERTED);
  op_i <= OPMODE xor to_stdlogicvector(IS_OPMODE_INVERTED);
  alm_i <= ALUMODE xor to_stdlogicvector(IS_ALUMODE_INVERTED);
  inm <= inm_r when INMODEREG = 1 else inm_i;
  op <= op_r when OPMODEREG = 1 else op_i;
  alm <= alm_r when ALUMODEREG = 1 else alm_i;
  cis <= cis_r when CARRYINSELREG = 1 else CARRYINSEL;
  -- the pre-adder: (D or 0) + or - (A1 or A2, or 0) (INMODE), its 25 bits; the multiplier: AD x (B1 or B2)
  d_m <= d_r when DREG = 1 else D;
  process (inm, a1, a2, d_m)
    variable av, dv : signed(24 downto 0);
  begin
    if inm(1) = '1' then av := (others => '0'); elsif inm(0) = '1' then av := signed(a1(24 downto 0)); else av := signed(a2(24 downto 0)); end if;
    if USE_DPORT = "TRUE" and inm(2) = '1' then dv := signed(d_m); else dv := (others => '0'); end if;
    if USE_DPORT = "TRUE" and inm(3) = '1' then ad <= std_logic_vector(dv - av); else ad <= std_logic_vector(dv + av); end if;
  end process;
  ad_m <= ad_r when USE_DPORT = "TRUE" and ADREG = 1 else ad;
  bm <= b1 when inm(4) = '1' else b2;
  prod <= ${Z(43)} when USE_MULT = "NONE" else std_logic_vector(resize(signed(ad_m) * signed(bm), 43));
  m_m <= m_r when MREG = 1 else prod;
  MULTSIGNOUT <= m_m(42);
  rnd <= not (ad_m(24) xor bm(17));
  rnd_m <= rnd_r when MREG = 1 else rnd;
  c_m <= c_r when CREG = 1 else C;
  -- the X, Y and Z multiplexers (M once, by X, when X and Y both select it)
  x <= ${Z(48)} when op(1 downto 0) = "00" else std_logic_vector(resize(signed(m_m), 48)) when op(1 downto 0) = "01"
       else p_r when op(1 downto 0) = "10" else a2 & b2;
  y <= ${Z(48)} when op(3 downto 2) = "00" or op(3 downto 2) = "01" else (others => '1') when op(3 downto 2) = "10" else c_m;
  z <= ${Z(48)} when op(6 downto 4) = "000" else PCIN when op(6 downto 4) = "001" else p_r when op(6 downto 4) = "010" or op(6 downto 4) = "100"
       else c_m when op(6 downto 4) = "011" else std_logic_vector(shift_right(signed(PCIN), 17)) when op(6 downto 4) = "101"
       else std_logic_vector(shift_right(signed(p_r), 17)) when op(6 downto 4) = "110" else (others => 'X');
  -- the carry in
  cin_i <= CARRYIN xor to_stdulogic(IS_CARRYIN_INVERTED);
  cin_m <= cin_r when CARRYINREG = 1 else cin_i;
  cin <= cin_m when cis = "000" else not PCIN(47) when cis = "001" else CARRYCASCIN when cis = "010" else PCIN(47) when cis = "011"
         else cout_r when cis = "100" else not p_r(47) when cis = "101" else rnd_m when cis = "110" else p_r(47);
  -- the ALU: ALUMODE's sums, or its logic (ALUMODE(2) set) of X and Z
  xy <= std_logic_vector(unsigned(x) + unsigned(y));
  process (alm, op, x, xy, z, cin)
    variable s : unsigned(48 downto 0);
    variable c49 : unsigned(48 downto 0);
    variable l : std_logic_vector(47 downto 0);
  begin
    c49 := (0 => cin, others => '0');
    if alm(2) = '0' then
      case alm(1 downto 0) is
        when "00" => s := unsigned('0' & z) + unsigned('0' & xy) + c49;
        when "11" => s := unsigned('0' & z) - (unsigned('0' & xy) + c49);
        when "01" => s := unsigned('0' & not z) + unsigned('0' & xy) + c49;
        when others => s := unsigned('0' & z) + unsigned('0' & xy) + c49; s := not s;
      end case;
      sum <= std_logic_vector(s);
    else
      -- (Table 2-14 of UG479: OPMODE(3 downto 2) 00 or 10 inverts the xor / xnor pair and turns and into or)
      if op(3) = '0' then
        case alm is
          when "0100" | "0111" => l := x xor z;
          when "0101" | "0110" => l := x xnor z;
          when "1100" => l := x and z;
          when "1101" => l := x and not z;
          when "1110" => l := x nand z;
          when others => l := (not x) or z;
        end case;
      else
        case alm is
          when "0100" | "0111" => l := x xnor z;
          when "0101" | "0110" => l := x xor z;
          when "1100" => l := x or z;
          when "1101" => l := x or not z;
          when "1110" => l := x nor z;
          when others => l := (not x) and z;
        end case;
      end if;
      sum <= '0' & l;
    end if;
  end process;
  alu <= sum(47 downto 0);
  cout <= sum(48) when alm(2) = '0' else '0';
  -- the pattern detector, of the ALU's output (registered with it)
  msk <= c_m when SEL_MASK = "C" else to_stdlogicvector(MASK);
  pat <= c_m when SEL_PATTERN = "C" else to_stdlogicvector(PATTERN);
  pd <= '1' when USE_PATTERN_DETECT = "PATDET" and ((alu xor pat) and not msk) = ${Z(48)} else '0';
  pbd <= '1' when USE_PATTERN_DETECT = "PATDET" and ((alu xor not pat) and not msk) = ${Z(48)} else '0';
  P <= p_r when PREG = 1 else alu;
  PCOUT <= p_r when PREG = 1 else alu;
  cout_m <= cout_r when PREG = 1 else cout;
  CARRYOUT <= cout_m & "000";
  CARRYCASCOUT <= cout_m;
  PATTERNDETECT <= pd_r when PREG = 1 else pd;
  PATTERNBDETECT <= pbd_r when PREG = 1 else pbd;
  OVERFLOW <= '0';
  UNDERFLOW <= '0';
  process (CLK)
  begin
${reg('a1_r', 'a_in', 'CEA1', 'RSTA', Z(30))}
${reg('a2_r', "a1 when AREG = 2 else a_in", 'CEA2', 'RSTA', Z(30)).replace('a2_r <= a1 when AREG = 2 else a_in;', 'if AREG = 2 then a2_r <= a1_r; else a2_r <= a_in; end if;')}
${reg('b1_r', 'b_in', 'CEB1', 'RSTB', Z(18))}
${reg('b2_r', "b1 when BREG = 2 else b_in", 'CEB2', 'RSTB', Z(18)).replace('b2_r <= b1 when BREG = 2 else b_in;', 'if BREG = 2 then b2_r <= b1_r; else b2_r <= b_in; end if;')}
${reg('d_r', 'D', 'CED', 'RSTD', Z(25))}
${reg('ad_r', 'ad', 'CEAD', 'RSTD', Z(25))}
${reg('c_r', 'C', 'CEC', 'RSTC', Z(48))}
${reg('m_r', 'prod', 'CEM', 'RSTM', Z(43))}
${reg('rnd_r', 'rnd', 'CEM', 'RSTM', "'0'")}
${reg('inm_r', 'inm_i', 'CEINMODE', 'RSTINMODE', Z(5))}
${reg('op_r', 'op_i', 'CECTRL', 'RSTCTRL', Z(7))}
${reg('cis_r', 'CARRYINSEL', 'CECTRL', 'RSTCTRL', Z(3))}
${reg('alm_r', 'alm_i', 'CEALUMODE', 'RSTALUMODE', Z(4))}
${reg('cin_r', 'cin_i', 'CECARRYIN', 'RSTALLCARRYIN', "'0'")}
${reg('p_r', 'alu', 'CEP', 'RSTP', Z(48))}
${reg('cout_r', 'cout', 'CEP', 'RSTALLCARRYIN', "'0'")}
${reg('pd_r', 'pd', 'CEP', 'RSTP', "'0'")}
${reg('pbd_r', 'pbd', 'CEP', 'RSTP', "'0'")}
  end process;
end silinx;`;

// ------------------------------------------------------------------ RAMB18E1, RAMB36E1
// the data and parity bits, the address bits a port's word is read from (hi), the widths of DI / DIP, WEA and WEBWE, of
// INIT_A / SRVAL_A, the INIT_xx and INITP_xx, the widest TDP port and the SDP's
export const E1 = { __proto__: null,
  RAMB18E1: { mem: 16384, par: 2048, aw: 14, hi: 13, dw: 16, pw: 2, wa: 2, wb: 4, iw: 18, inits: 64, initps: 8, tdp: 18, sdp: 36 },
  RAMB36E1: { mem: 32768, par: 4096, aw: 16, hi: 14, dw: 32, pw: 4, wa: 4, wb: 8, iw: 36, inits: 128, initps: 16, tdp: 36, sdp: 72 },
};
const ramb = (name) => {
  const k = E1[name], dm = 2 * k.dw, pm = 2 * k.pw, ow = dm + pm;
  const A = { addr: 'ADDRARDADDR', clk: 'CLKARDCLK', di: 'DIADI', dip: 'DIPADIP', dout: 'DOADO', dop: 'DOPADOP', en: 'ENARDEN', regce: 'REGCEAREGCE',
    rstram: 'RSTRAMARSTRAM', rstreg: 'RSTREGARSTREG', we: 'WEA', ww: k.wa };
  const B = { addr: 'ADDRBWRADDR', clk: 'CLKBWRCLK', di: 'DIBDI', dip: 'DIPBDIP', dout: 'DOBDO', dop: 'DOPBDOP', en: 'ENBWREN', regce: 'REGCEB',
    rstram: 'RSTRAMB', rstreg: 'RSTREGB', we: 'WEBWE', ww: k.wb };
  const ports = [A, B].flatMap((p) => [`${p.dout} : out std_logic_vector(${k.dw - 1} downto 0)`, `${p.dop} : out std_logic_vector(${k.pw - 1} downto 0)`,
    `${p.addr} : in std_logic_vector(${k.aw - 1} downto 0) := (others => '0')`, `${p.clk} : in std_ulogic := '0'`,
    `${p.di} : in std_logic_vector(${k.dw - 1} downto 0) := (others => '0')`, `${p.dip} : in std_logic_vector(${k.pw - 1} downto 0) := (others => '0')`,
    `${p.en}, ${p.regce}, ${p.rstram}, ${p.rstreg} : in std_ulogic := '0'`, `${p.we} : in std_logic_vector(${p.ww - 1} downto 0) := (others => '0')`]);
  if (name === 'RAMB36E1') {
    ports.push("CASCADEINA, CASCADEINB, INJECTDBITERR, INJECTSBITERR : in std_ulogic := '0'",
      'CASCADEOUTA, CASCADEOUTB, DBITERR, SBITERR : out std_ulogic', 'ECCPARITY : out std_logic_vector(7 downto 0)', 'RDADDRECC : out std_logic_vector(8 downto 0)');
  }
  const gens = [...['A', 'B'].flatMap((x) => [`READ_WIDTH_${x}, WRITE_WIDTH_${x} : integer := 0`, `DO${x}_REG : integer := 0`,
    `INIT_${x}, SRVAL_${x} : std_logic_vector(${k.iw - 1} downto 0) := (others => '0')`, `RSTREG_PRIORITY_${x} : string := "RSTREG"`,
    `WRITE_MODE_${x} : string := "WRITE_FIRST"`]),
  'RAM_MODE : string := "TDP"', 'RDADDR_COLLISION_HWCONFIG : string := "DELAYED_WRITE"', 'SIM_COLLISION_CHECK : string := "ALL"',
  'SIM_DEVICE : string := "7SERIES"', 'INIT_FILE : string := "NONE"',
  "IS_CLKARDCLK_INVERTED, IS_CLKBWRCLK_INVERTED, IS_ENARDEN_INVERTED, IS_ENBWREN_INVERTED, IS_RSTRAMARSTRAM_INVERTED, IS_RSTRAMB_INVERTED, IS_RSTREGARSTREG_INVERTED, IS_RSTREGB_INVERTED : bit := '0'",
  ...(name === 'RAMB36E1' ? ['EN_ECC_READ, EN_ECC_WRITE : boolean := FALSE', 'RAM_EXTENSION_A, RAM_EXTENSION_B : string := "NONE"'] : []),
  ...Array.from({ length: k.inits }, (_, j) => `INIT_${hex2(j)} : std_logic_vector(255 downto 0) := ${zeros(256)}`),
  ...Array.from({ length: k.initps }, (_, j) => `INITP_${hex2(j)} : std_logic_vector(255 downto 0) := ${zeros(256)}`)];
  // a width's data bits, parity bits and the address bits below its word
  const dims = (w, d, p, s) => [[1, 1, 0, 0], [2, 2, 0, 1], [4, 4, 0, 2], [9, 8, 1, 3], [18, 16, 2, 4], [36, 32, 4, 5], [72, 64, 8, 6]]
    .map(([n, dd, pp, ss], i) => `      ${i ? 'elsif' : 'if'} ${w} = ${n} then ${d} := ${dd}; ${p} := ${pp}; ${s} := ${ss};`).join('\n') + `\n      else ${d} := 0; ${p} := 0; ${s} := 0;\n      end if;`;
  // INIT / SRVAL of a port as its latch (the data bits from 0, then the parity bits): SDP's of the full width, INIT_A
  // its low half and INIT_B its high half
  const outVec = (g, x) => `      if sdp and READ_WIDTH_A = ${k.sdp} then
        ${g}${x} := (others => '0');
        ${g}${x}(${k.dw - 1} downto 0) := ${g === 'iv' ? 'INIT' : 'SRVAL'}_A(${k.dw - 1} downto 0); ${g}${x}(${dm - 1} downto ${k.dw}) := ${g === 'iv' ? 'INIT' : 'SRVAL'}_B(${k.dw - 1} downto 0);
        ${g}${x}(${dm + k.pw - 1} downto ${dm}) := ${g === 'iv' ? 'INIT' : 'SRVAL'}_A(${k.iw - 1} downto ${k.dw}); ${g}${x}(${ow - 1} downto ${dm + k.pw}) := ${g === 'iv' ? 'INIT' : 'SRVAL'}_B(${k.iw - 1} downto ${k.dw});
      else
        ${g}${x} := (others => '0'); ${g}${x}(${k.iw - 1} downto 0) := ${g === 'iv' ? 'INIT' : 'SRVAL'}_${x};
      end if;`;
  // a port's address (its bits hi … s) as adr, bad when one is not 0 / 1
  const address = (p, s, ind) => `${ind}adr := 0; bad := false;
${ind}for i in ${k.hi} downto ${s} loop
${ind}  adr := adr * 2;
${ind}  if ${p.addr}(i) = '1' then adr := adr + 1; elsif ${p.addr}(i) /= '0' then bad := true; end if;
${ind}end loop;`;
  // a port's read into its latch (its read width rd / rp / rs)
  const read = (x, p, ind) => `${address(p, `rs${x}`, ind)}
${ind}if bad then l${x} := (others => 'X');
${ind}else
${ind}  for i in 0 to rd${x} - 1 loop l${x}(i) := to_stdulogic(mem(adr * rd${x} + i)); end loop;
${ind}  for j in 0 to rp${x} - 1 loop l${x}(rd${x} + j) := to_stdulogic(par(adr * rp${x} + j)); end loop;
${ind}end if;`;
  // a port's write (its write width wd / wp / ws), the data vd, vp and its write enables ve (a byte's for 16 data bits or more)
  const write = (x, p, ind) => `${address(p, `ws${x}`, ind)}
${ind}if not bad then
${ind}  for i in 0 to wd${x} - 1 loop
${ind}    if (wd${x} >= 16 and ve${x}(i / 8) = '1') or (wd${x} < 16 and ve${x}(0) = '1') then mem(adr * wd${x} + i) := to_bit(vd${x}(i)); end if;
${ind}  end loop;
${ind}  for j in 0 to wp${x} - 1 loop
${ind}    if (wd${x} >= 16 and ve${x}(j) = '1') or (wd${x} < 16 and ve${x}(0) = '1') then par(adr * wp${x} + j) := to_bit(vp${x}(j)); end if;
${ind}  end loop;
${ind}end if;`;
  // a port on its clock's edge (ed: its edge, as a variable, its enable and its write once known): its register, then its
  // latch's read before the writes (READ_FIRST, or no write), its write, and its read after the writes (WRITE_FIRST)
  const edgeOf = (x, p, clkInv, enInv, ramInv, regInv) => `
    ed${x} := (${clkInv} = '0' and rising_edge(${p.clk})) or (${clkInv} = '1' and falling_edge(${p.clk}));
    en${x} := ed${x} and (${p.en} xor to_stdulogic(${enInv})) = '1';
    rram${x} := (${p.rstram} xor to_stdulogic(${ramInv})) = '1';
    wr${x} := en${x} and wd${x} > 0 and ve${x} /= ${Z(k.wb)};
    if ed${x} and DO${x}_REG = 1 then
      if (${p.rstreg} xor to_stdulogic(${regInv})) = '1' and (RSTREG_PRIORITY_${x} = "RSTREG" or ${p.regce} = '1') then r${x} := sv${x};
      elsif ${p.regce} = '1' then r${x} := l${x};
      end if;
    end if;
    if en${x} and rram${x} then l${x} := sv${x};
    elsif en${x} and rd${x} > 0 and (WRITE_MODE_${x} = "READ_FIRST" or not wr${x}) then
${read(x, p, '      ')}
    end if;`;
  const writeOf = (x, p) => `    if wr${x} then
${write(x, p, '      ')}
    end if;`;
  const after = (x, p) => `    if wr${x} and not rram${x} and rd${x} > 0 and WRITE_MODE_${x} = "WRITE_FIRST" then
${read(x, p, '      ')}
    end if;`;
  return `
${IEEE}
entity ${name} is
  generic (${gens.join(';\n    ')});
  port (${ports.join(';\n    ')});
end ${name};
architecture silinx of ${name} is
  -- (the unknown bits of INIT, SRVAL and the contents, Yosys's for those it does not care of, are the device's 0)
  function known(v : std_logic_vector) return std_logic_vector is
    variable r : std_logic_vector(v'range);
  begin
    for i in v'range loop
      if v(i) = '1' or v(i) = 'H' then r(i) := '1'; else r(i) := '0'; end if;
    end loop;
    return r;
  end function;
begin
  process (CLKARDCLK, CLKBWRCLK)
    variable mem : bit_vector(${k.mem - 1} downto 0);
    variable par : bit_vector(${k.par - 1} downto 0);
    variable started, sdp, bad, edA, edB, enA, enB, rramA, rramB, wrA, wrB : boolean := false;
    variable rdA, rpA, rsA, wdA, wpA, wsA, rdB, rpB, rsB, wdB, wpB, wsB, adr : integer := 0;
    variable lA, rA, lB, rB, ivA, ivB, svA, svB : std_logic_vector(${ow - 1} downto 0) := (others => '0');
    variable vdA, vdB : std_logic_vector(${dm - 1} downto 0);
    variable vpA, vpB : std_logic_vector(${pm - 1} downto 0);
    variable veA, veB : std_logic_vector(${k.wb - 1} downto 0);
  begin
    if not started then
      started := true;
      sdp := RAM_MODE = "SDP";
${Array.from({ length: k.inits }, (_, j) => `      mem(${j * 256 + 255} downto ${j * 256}) := to_bitvector(known(INIT_${hex2(j)}));`).join('\n')}
${Array.from({ length: k.initps }, (_, j) => `      par(${j * 256 + 255} downto ${j * 256}) := to_bitvector(known(INITP_${hex2(j)}));`).join('\n')}
${dims('READ_WIDTH_A', 'rdA', 'rpA', 'rsA')}
${dims('WRITE_WIDTH_A', 'wdA', 'wpA', 'wsA')}
${dims('READ_WIDTH_B', 'rdB', 'rpB', 'rsB')}
${dims('WRITE_WIDTH_B', 'wdB', 'wpB', 'wsB')}
      -- (SDP: port A reads only, port B writes only)
      if sdp then wdA := 0; wpA := 0; rdB := 0; rpB := 0; end if;
${outVec('iv', 'A')}
${outVec('sv', 'A')}
      ivB := (others => '0'); ivB(${k.iw - 1} downto 0) := INIT_B;
      svB := (others => '0'); svB(${k.iw - 1} downto 0) := SRVAL_B;
      ivA := known(ivA); svA := known(svA); ivB := known(ivB); svB := known(svB);
      lA := ivA; rA := ivA; lB := ivB; rB := ivB;
    end if;
    -- the ports' data and write enables (SDP's full width: port B's and port A's pins together, B the high half)
    vdA := (others => '0'); vpA := (others => '0'); veA := (others => '0');
    vdB := (others => '0'); vpB := (others => '0'); veB := (others => '0');
    vdA(${k.dw - 1} downto 0) := DIADI; vpA(${k.pw - 1} downto 0) := DIPADIP; veA(${k.wa - 1} downto 0) := WEA;
    if sdp and WRITE_WIDTH_B = ${k.sdp} then vdB := DIBDI & DIADI; vpB := DIPBDIP & DIPADIP; veB := WEBWE;
    else vdB(${k.dw - 1} downto 0) := DIBDI; vpB(${k.pw - 1} downto 0) := DIPBDIP; veB(${k.wa - 1} downto 0) := WEBWE(${k.wa - 1} downto 0);
    end if;
${edgeOf('A', A, 'IS_CLKARDCLK_INVERTED', 'IS_ENARDEN_INVERTED', 'IS_RSTRAMARSTRAM_INVERTED', 'IS_RSTREGARSTREG_INVERTED')}
${edgeOf('B', B, 'IS_CLKBWRCLK_INVERTED', 'IS_ENBWREN_INVERTED', 'IS_RSTRAMB_INVERTED', 'IS_RSTREGB_INVERTED')}
${writeOf('A', A)}
${writeOf('B', B)}
${after('A', A)}
${after('B', B)}
    -- the outputs: the register's or the latch's (SDP's full width on both ports' pins, A the low half)
    if sdp and READ_WIDTH_A = ${k.sdp} then
      if DOA_REG = 1 then ivA := rA; else ivA := lA; end if;
      DOADO <= ivA(${k.dw - 1} downto 0); DOBDO <= ivA(${dm - 1} downto ${k.dw});
      DOPADOP <= ivA(${dm + k.pw - 1} downto ${dm}); DOPBDOP <= ivA(${ow - 1} downto ${dm + k.pw});
    else
      if DOA_REG = 1 then ivA := rA; else ivA := lA; end if;
      if DOB_REG = 1 then ivB := rB; else ivB := lB; end if;
      for i in 0 to ${k.dw - 1} loop
        if i < rdA then DOADO(i) <= ivA(i); else DOADO(i) <= '0'; end if;
        if i < rdB then DOBDO(i) <= ivB(i); else DOBDO(i) <= '0'; end if;
      end loop;
      for j in 0 to ${k.pw - 1} loop
        if j < rpA then DOPADOP(j) <= ivA(rdA + j); else DOPADOP(j) <= '0'; end if;
        if j < rpB then DOPBDOP(j) <= ivB(rdB + j); else DOPBDOP(j) <= '0'; end if;
      end loop;
    end if;
  end process;
end silinx;`;
};

/** VHDL source of the 7-series primitives (part of UNISIM_VHDL, unisim.js). */
export const UNISIM_XC7_VHDL = [DSP48E1, ramb('RAMB18E1'), ramb('RAMB36E1')].join('\n');
