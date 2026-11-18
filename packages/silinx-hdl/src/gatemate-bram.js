// Silinx - the GateMate's block RAMs (#2431): gatemate-prims.js's CC_BRAM_20K and CC_BRAM_40K, written from Yosys's
// techlibs/gatemate/cells_sim.v (its behavioural models), as gowin-bsram.js's from Gowin's guide. No timing.
//   - the memory: 20,480 bits (CC_BRAM_20K) or 40,960 (CC_BRAM_40K), INIT_00 … INIT_3F (INIT_7F) its 320-bit rows, the lowest
//     bits first;
//   - RAM_MODE "SDP": port A writes A_WR_WIDTH bits (40 on the 20K, 80 on the 40K: A_DI and B_DI, A_BM and B_BM its byte
//     masks, bit by bit) at A_ADDR[15:7], port B reads B_RD_WIDTH bits at B_ADDR[15:7] into A_DO (the lower half) and B_DO;
//   - RAM_MODE "TDP": each port its own width (the larger of its read and write widths: 1, 2, 5, 10, 20, or 40 on the 40K), its
//     address of A_ADDR's bits as cells_sim.v maps them; NO_CHANGE reads when it does not write, WRITE_THROUGH reads what it
//     writes; each written bit where its mask bit (A_BM, B_BM) is 1;
//   - on the clock's rising edge (A_CLK_INV, B_CLK_INV: falling) when enabled (A_EN, B_EN; _INV: low), writing when A_WE / B_WE
//     (_INV: low); both ports read the memory as it was before the edge's writes; A_DO_REG / B_DO_REG: the output a register
//     more (the read's value one edge later);
//   - the 40K's cascade (CAS "LOWER" / "UPPER", TDP, one-bit ports): the lower RAM's A_CO / B_CO the bit at the address when
//     A_ADDR[0] / B_ADDR[0] is 0 (WRITE_THROUGH: the one written), the upper RAM's ports A_CI / B_CI when it is 0;
//   - an address with an unknown bit reads X and writes nothing; ECC (ECC_EN, A_ECC_EN, B_ECC_EN) not modelled (a warning),
//     its error outputs 0. An SDP port of another width than the whole row is the TDP's address mapping (cells_sim.v leaves
//     it undefined).

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const hex2 = (i) => i.toString(16).toUpperCase().padStart(2, '0');

// the TDP's addresses (cells_sim.v's): by the port's width, the address's bits used and the row's multiple
const TDP_20K = [[1, 'a(15 downto 7) & a(5 downto 1)', 't + t / 4'], [2, 'a(15 downto 7) & a(5 downto 2)', 't * 2 + t / 2'],
  [5, 'a(15 downto 7) & a(5 downto 3)', 't * 5'], [10, 'a(15 downto 7) & a(5 downto 4)', 't * 10'], [20, 'a(15 downto 7) & a(5)', 't * 20']];
const TDP_40K = [[1, 'a(15 downto 1)', 't + t / 4'], [2, 'a(15 downto 2)', 't * 2 + t / 2'], [5, 'a(15 downto 3)', 't * 5'],
  [10, 'a(15 downto 4)', 't * 10'], [20, 'a(15 downto 5)', 't * 20'], [40, 'a(15 downto 6)', 't * 40']];

function bram(k40) {
  const name = k40 ? 'CC_BRAM_40K' : 'CC_BRAM_20K', W = k40 ? 40 : 20, N = k40 ? 40960 : 20480, rows = N / 320, full = 2 * W;
  const tdp = k40 ? TDP_40K : TDP_20K;
  const ports = [`A_DO, B_DO : out std_logic_vector(${W - 1} downto 0)`,
    k40 ? 'A_ECC_1B_ERR, B_ECC_1B_ERR, A_ECC_2B_ERR, B_ECC_2B_ERR, A_CO, B_CO : out std_ulogic' : 'ECC_1B_ERR, ECC_2B_ERR : out std_ulogic',
    "A_CLK, B_CLK, A_EN, B_EN, A_WE, B_WE : in std_ulogic := '0'", "A_ADDR, B_ADDR : in std_logic_vector(15 downto 0) := (others => '0')",
    `A_DI, B_DI, A_BM, B_BM : in std_logic_vector(${W - 1} downto 0) := (others => '0')`, ...(k40 ? ["A_CI, B_CI : in std_ulogic := '0'"] : [])].join(';\n        ');
  const gens = ['LOC : string := "UNPLACED"', ...(k40 ? ['CAS : string := "NONE"'] : []), 'A_RD_WIDTH, B_RD_WIDTH, A_WR_WIDTH, B_WR_WIDTH : integer := 0',
    'RAM_MODE : string := "SDP"; A_WR_MODE, B_WR_MODE : string := "NO_CHANGE"',
    `A_CLK_INV, B_CLK_INV, A_EN_INV, B_EN_INV, A_WE_INV, B_WE_INV, A_DO_REG, B_DO_REG, ${k40 ? 'A_ECC_EN, B_ECC_EN' : 'ECC_EN'} : std_ulogic := '0'`,
    `${Array.from({ length: rows }, (_, i) => `INIT_${hex2(i)}`).join(', ')} : std_logic_vector(319 downto 0) := (others => '0')`].join(';\n           ');
  const decls = `  constant WMA : integer := maximum2(A_RD_WIDTH, A_WR_WIDTH);
  constant WMB : integer := maximum2(B_RD_WIDTH, B_WR_WIDTH);
  constant SDP : boolean := RAM_MODE = "SDP";
  -- (a vector's value, -1 with a bit that is not 0 / 1)
  function uint(v : std_logic_vector) return integer is
    variable r : integer := 0;
  begin
    for i in v'range loop
      r := r * 2;
      if v(i) = '1' then r := r + 1; elsif v(i) /= '0' then return -1; end if;
    end loop;
    return r;
  end function;
  function maximum2(a, b : integer) return integer is
  begin
    if a > b then return a; else return b; end if;
  end function;
  -- (a port's first bit in the memory, -1 not known)
  function addr(a : std_logic_vector(15 downto 0); w : integer) return integer is
    variable t : integer;
  begin
    if SDP and w = ${full} then t := uint(a(15 downto 7)); if t < 0 then return -1; end if; return t * ${full}; end if;
${tdp.map(([lim, bits, f], i) => `    ${i ? 'elsif' : 'if'} w <= ${lim} then t := uint(${bits}); if t < 0 then return -1; end if; return ${f};`).join('\n')}
    end if;
    return -1;
  end function;
  function init return std_logic_vector is
    variable m : std_logic_vector(${N - 1} downto 0);
  begin
${Array.from({ length: rows }, (_, i) => `    m(${320 * i + 319} downto ${320 * i}) := INIT_${hex2(i)};`).join('\n')}
    return m;
  end function;
  signal co_a, co_b : std_ulogic := '0';
`;
  // a port's TDP read (p: A or B; o: its output variable; ad its address; ci its cascade input) and its writes, on its edge
  const tdpPort = (p, o, ad, e) => `    if ${e} then
      for i in 0 to WM${p} - 1 loop
        if ${p}_WR_MODE = "WRITE_THROUGH" then
          if en${p} = '1' then
            if ${k40 ? `CAS = "UPPER" and ${p}_ADDR(0) /= '1'` : 'false'} then ${o}(i) := ${k40 ? `${p}_CI` : "'X'"};
            elsif we${p} = '1' and ${p}_BM(i) = '1' then ${o}(i) := ${p}_DI(i);
            else ${o}(i) := rd(${ad} + i);
            end if;
          end if;
        elsif en${p} = '1' and we${p} = '0' then
          if ${k40 ? `CAS = "UPPER" and ${p}_ADDR(0) /= '1'` : 'false'} then ${o}(i) := ${k40 ? `${p}_CI` : "'X'"};
          elsif ${k40 ? 'CAS /= "LOWER"' : 'true'} then ${o}(i) := rd(${ad} + i);
          end if;
        end if;
      end loop;
    end if;`;
  const tdpWrite = (p, ad, e) => `    if ${e} and en${p} = '1' and we${p} = '1' and ${ad} >= 0${k40 ? ` and (CAS = "NONE" or (CAS = "UPPER" and ${p}_ADDR(0) = '1') or (CAS = "LOWER" and ${p}_ADDR(0) = '0'))` : ''} then
      for i in 0 to WM${p} - 1 loop
        if ${p}_BM(i) = '1' and ${ad} + i < ${N} then mem(${ad} + i) := ${p}_DI(i); end if;
      end loop;
    end if;`;
  const cascade = (p, ad) => `    if CAS = "LOWER" and ${p}_ADDR(0) = '0' then
      if ${p}_WR_MODE = "WRITE_THROUGH" and we${p} = '1' and ${p}_BM(0) = '1' then co_${p.toLowerCase()} <= ${p}_DI(0); else co_${p.toLowerCase()} <= rd(${ad}); end if;
    end if;`;
  const body = `  process
  begin
    if ${k40 ? "A_ECC_EN = '1' or B_ECC_EN = '1'" : "ECC_EN = '1'"} then report "${name}: its ECC is not modelled" severity warning; end if;
    if RAM_MODE /= "SDP" and RAM_MODE /= "TDP" then report "${name}: RAM_MODE '" & RAM_MODE & "' is neither SDP nor TDP" severity error; end if;
    wait;
  end process;
  -- (one process for both ports: one memory; on the pins' own edges, the inputs as at the edge)
  process (A_CLK, B_CLK, A_ADDR, B_ADDR, A_DI, B_DI, A_WE, B_WE, A_BM, B_BM, A_EN, B_EN${k40 ? ', A_CI, B_CI' : ''})
    variable mem : std_logic_vector(${N - 1} downto 0) := init;
    variable ea, eb : boolean;
    variable enA, enB, weA, weB : std_ulogic;
    variable aa, ab : integer;
    variable oa, ob, ra, rb : std_logic_vector(${W - 1} downto 0) := (others => '0');
    impure function rd(i : integer) return std_ulogic is
    begin
      if i < 0 or i >= ${N} then return 'X'; end if;
      return mem(i);
    end function;
  begin
    ea := (A_CLK_INV /= '1' and rising_edge(A_CLK)) or (A_CLK_INV = '1' and falling_edge(A_CLK));
    eb := (B_CLK_INV /= '1' and rising_edge(B_CLK)) or (B_CLK_INV = '1' and falling_edge(B_CLK));
    enA := A_EN xor A_EN_INV; enB := B_EN xor B_EN_INV; weA := A_WE xor A_WE_INV; weB := B_WE xor B_WE_INV;
    aa := addr(A_ADDR, WMA); ab := addr(B_ADDR, WMB);
    -- (the output registers: the read before this edge's)
    if ea and A_DO_REG = '1' then ra := oa; end if;
    if eb and B_DO_REG = '1' then rb := ob; end if;
    if SDP then
      if eb and enB = '1' then
        for k in 0 to B_RD_WIDTH - 1 loop
          if k < ${W} then oa(k) := rd(ab + k); else ob(k - ${W}) := rd(ab + k); end if;
        end loop;
      end if;
      if ea and enA = '1' and weA = '1' and aa >= 0 then
        for k in 0 to A_WR_WIDTH - 1 loop
          if k < ${W} then
            if A_BM(k) = '1' then mem(aa + k) := A_DI(k); end if;
          elsif B_BM(k - ${W}) = '1' then mem(aa + k) := B_DI(k - ${W});
          end if;
        end loop;
      end if;
    else
${k40 ? `${cascade('A', 'aa')}\n${cascade('B', 'ab')}\n` : ''}${tdpPort('A', 'oa', 'aa', 'ea')}
${tdpPort('B', 'ob', 'ab', 'eb')}
${tdpWrite('A', 'aa', 'ea')}
${tdpWrite('B', 'ab', 'eb')}
    end if;
    if A_DO_REG = '1' then A_DO <= ra; else A_DO <= oa; end if;
    if B_DO_REG = '1' then B_DO <= rb; else B_DO <= ob; end if;
  end process;
${k40 ? "  A_CO <= co_a; B_CO <= co_b;\n  A_ECC_1B_ERR <= '0'; B_ECC_1B_ERR <= '0'; A_ECC_2B_ERR <= '0'; B_ECC_2B_ERR <= '0';" : "  ECC_1B_ERR <= '0'; ECC_2B_ERR <= '0';"}`;
  return `
${IEEE}
entity ${name} is
  generic (${gens});
  port (${ports});
end ${name};
architecture silinx of ${name} is
${decls}begin
${body}
end silinx;`;
}

/** VHDL source of the GateMate's block RAMs (joined to gatemate-prims.js's GATEMATE_VHDL). */
export const GATEMATE_BRAM_VHDL = [bram(false), bram(true)].join('\n');
