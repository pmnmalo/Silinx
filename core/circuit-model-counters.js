// The counters written once in VHDL (#4397, group D; docs/CIRCUITS.md): KiCad's 74xx and 4xxx counters, as the
// flip-flops of core/circuit-model-ics.js are: each its datasheet's pinout, its typical delay and its core, a VHDL
// architecture written here (its count a std_logic_vector, numeric_std's arithmetic on it), run live by Try it,
// instantiated by the circuit's HDL, translated to Verilog by Silinx. A count starts unknown (X), and stays so until
// a clear or a load: X counts on as X; the decoded and carry outputs are the count's bits ANDed, X while it is. A ripple
// counter's stages count together on its clock's edge (its ripple's delays not modelled). An asynchronous load takes
// its inputs when it starts, as the 74191's (core/circuit-seq.js): on the chip Q follows them while LOAD̅ is low. A
// decade counter's states above 9 (loaded) go on as its datasheet's logic takes them (the 74160's), or count on in
// binary (the others').
// Isomorphic module.
import { ic, BAR, M14, M16 } from './circuit-model-ics.js';

// ------------------------------------------------------------------ the VHDL's pieces
const Q = (n, name = 'q') => `signal ${name} : std_logic_vector(${n - 1} downto 0) := (others => 'X');`;
const up = (v) => `${v} <= std_logic_vector(unsigned(${v}) + 1);`;
const down = (v) => `${v} <= std_logic_vector(unsigned(${v}) - 1);`;
// (a count's value as its bits ANDed: X while one of them is)
const is = (v, n, k) => [...Array(n)].map((_, b) => ((k >> b) & 1 ? `${v}(${b})` : `(not ${v}(${b}))`)).join(' and ');
const outs = (v, ports) => ports.map((p, b) => `${p} <= ${v}(${b});`);
// (a decade's step: 9 to 0 up, 0 to 9 down; the others ±1)
const decUp = (v) => [`if ${v} = "1001" then ${v} <= "0000";`, `else ${up(v)}`, 'end if;'];
const decDown = (v) => [`if ${v} = "0000" then ${v} <= "1001";`, `else ${down(v)}`, 'end if;'];
const ind = (lines, n = 1) => lines.map((l) => `${'  '.repeat(n)}${l}`);
// (a clocked process's clock one of the IC's pins, read as the chip reads them in the circuit's HDL: logic before it)
const CLOCKED = '-- silinx: ignore data-as-clock';
const ASYNC_LOAD = "-- silinx: ignore sensitivity (an asynchronous load takes the inputs when it starts, as a flip-flop's in synthesis)";

// ------------------------------------------------------------------ 74160, 74162: synchronous decade counters (the 74161's pinout)
// on CLK's rising edge LOAD̅ low loads DCBA, else ENP and ENT high count; CLR̅ asynchronous (74160) or on the edge (74162);
// RCO is ENT, QA and QD; the states above 9 as its logic takes them: 10 → 11 → 6, 12 → 13 → 4, 14 → 15 → 2
const SYNC_PINS = [[1, `CLR${BAR}`, 'in', 'clr_n'], [2, 'CLK', 'in', 'clk'], [3, 'A', 'in', 'a'], [4, 'B', 'in', 'b'], [5, 'C', 'in', 'c'], [6, 'D', 'in', 'd'], [7, 'ENP', 'in', 'enp'],
  [8, 'GND', 'gnd'], [9, `LOAD${BAR}`, 'in', 'load_n'], [10, 'ENT', 'in', 'ent'], [11, 'QD', 'out', 'qd'], [12, 'QC', 'out', 'qc'], [13, 'QB', 'out', 'qb'], [14, 'QA', 'out', 'qa'],
  [15, 'RCO', 'out', 'rco'], [16, 'VCC', 'vcc']];
function syncDecade(type, title, syncClear) {
  const count = ["if load_n = '0' then q <= d & c & b & a;", "elsif (enp and ent) = '1' then", '  case q is', '    when "1001" => q <= "0000";', '    when "1011" => q <= "0110";',
    '    when "1101" => q <= "0100";', '    when "1111" => q <= "0010";', `    when others => ${up('q')}`, '  end case;', 'end if;'];
  return ic(type, title, 20, M16(SYNC_PINS), { decl: [Q(4)], body: [CLOCKED, `process (${syncClear ? 'clk' : 'clk, clr_n'})`, 'begin',
    ...(syncClear ? ['  if rising_edge(clk) then', "    if clr_n = '0' then q <= \"0000\";", ...ind(count.map((l, i) => (i ? l : `els${l}`)), 2), '  end if;']
      : ["  if clr_n = '0' then q <= \"0000\";", '  elsif rising_edge(clk) then', ...ind(count, 2), '  end if;']),
    'end process;', ...outs('q', ['qa', 'qb', 'qc', 'qd']), 'rco <= ent and q(0) and q(3);'] });
}
const c74160 = syncDecade('74160', 'Synchronous decade counter, asynchronous clear', false);
const c74162 = syncDecade('74162', 'Synchronous decade counter, synchronous clear', true);

// ------------------------------------------------------------------ 74168, 74169: synchronous up/down counters, decade and binary
// on CLK's rising edge LOAD̅ low loads DCBA, else ENP̅ and ENT̅ low count up (U/D̅ high) or down; RCO̅ low while ENT̅ is
// low and the count is at its end: 9 (15) up, 0 down
function upDown(type, title, decade) {
  const max = decade ? 9 : 15;
  return ic(type, title, 20, M16([[1, `U/D${BAR}`, 'in', 'ud'], [2, 'CLK', 'in', 'clk'], [3, 'A', 'in', 'a'], [4, 'B', 'in', 'b'], [5, 'C', 'in', 'c'], [6, 'D', 'in', 'd'],
    [7, `ENP${BAR}`, 'in', 'enp_n'], [8, 'GND', 'gnd'], [9, `LOAD${BAR}`, 'in', 'load_n'], [10, `ENT${BAR}`, 'in', 'ent_n'], [11, 'QD', 'out', 'qd'], [12, 'QC', 'out', 'qc'],
    [13, 'QB', 'out', 'qb'], [14, 'QA', 'out', 'qa'], [15, `RCO${BAR}`, 'out', 'rco_n'], [16, 'VCC', 'vcc']]), { decl: [Q(4)], body: [CLOCKED, 'process (clk)', 'begin', '  if rising_edge(clk) then',
    "    if load_n = '0' then q <= d & c & b & a;", "    elsif enp_n = '0' and ent_n = '0' then", "      if ud = '1' then", ...ind(decade ? decUp('q') : [up('q')], 4), '      else',
    ...ind(decade ? decDown('q') : [down('q')], 4), '      end if;', '    end if;', '  end if;', 'end process;', ...outs('q', ['qa', 'qb', 'qc', 'qd']),
    `rco_n <= not ((not ent_n) and ((ud and ${is('q', 4, max)}) or ((not ud) and ${is('q', 4, 0)})));`] });
}
const c74168 = upDown('74168', 'Synchronous up/down decade counter', true);
const c74169 = upDown('74169', 'Synchronous up/down binary counter', false);

// ------------------------------------------------------------------ 74190: the 74191's decade (its pinout); 74192: the 74193's
// 74190: LOAD̅ asynchronous; on CLK's rising edge with CTEN̅ low, up (D/U̅ low) or down; MAX/MIN: 9 up, 0 down; RCO̅ low
// while CTEN̅ is low, MAX/MIN high and CLK low
const c74190 = ic('74190', 'Synchronous up/down decade counter', 20, M16([[1, 'B', 'in', 'b'], [2, 'QB', 'out', 'qb'], [3, 'QA', 'out', 'qa'], [4, `CTEN${BAR}`, 'in', 'cten_n'],
  [5, `D/U${BAR}`, 'in', 'du'], [6, 'QC', 'out', 'qc'], [7, 'QD', 'out', 'qd'], [8, 'GND', 'gnd'], [9, 'D', 'in', 'd'], [10, 'C', 'in', 'c'], [11, `LOAD${BAR}`, 'in', 'load_n'],
  [12, 'MAX/MIN', 'out', 'maxmin'], [13, `RCO${BAR}`, 'out', 'rco_n'], [14, 'CLK', 'in', 'clk'], [15, 'A', 'in', 'a'], [16, 'VCC', 'vcc']]), { decl: [Q(4), "signal mm : std_logic := 'X';"], body: [
  CLOCKED, 'process (clk, load_n)', 'begin', `  ${ASYNC_LOAD}`, "  if load_n = '0' then q <= d & c & b & a;", '  elsif rising_edge(clk) then', "    if cten_n = '0' then", "      if du = '0' then",
  ...ind(decUp('q'), 4), '      else', ...ind(decDown('q'), 4), '      end if;', '    end if;', '  end if;', 'end process;', ...outs('q', ['qa', 'qb', 'qc', 'qd']),
  `mm <= ((not du) and ${is('q', 4, 9)}) or (du and ${is('q', 4, 0)});`, 'maxmin <= mm;', "-- silinx: ignore clock-as-data (RCO̅ is low while the clock is low: the chip's)",
  'rco_n <= not ((not cten_n) and mm and (not clk));'] });
// 74192: it counts on the rising edge of UP and DOWN ANDed, up when UP pulsed (low while DOWN was high: kept in dir, a
// latch), down when DOWN did; CLR (high) and LOAD̅ (low) asynchronous; CO̅ low while 9 and UP low, BO̅ low while 0 and DOWN low
const UPDN = "-- silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip's)";
const c74192 = ic('74192', 'Synchronous up/down decade counter, dual clock', 20, M16([[1, 'B', 'in', 'b'], [2, 'QB', 'out', 'qb'], [3, 'QA', 'out', 'qa'], [4, 'DOWN', 'in', 'down'],
  [5, 'UP', 'in', 'up'], [6, 'QC', 'out', 'qc'], [7, 'QD', 'out', 'qd'], [8, 'GND', 'gnd'], [9, 'D', 'in', 'd'], [10, 'C', 'in', 'c'], [11, `LOAD${BAR}`, 'in', 'load_n'], [12, `CO${BAR}`, 'out', 'co_n'],
  [13, `BO${BAR}`, 'out', 'bo_n'], [14, 'CLR', 'in', 'clr'], [15, 'A', 'in', 'a'], [16, 'VCC', 'vcc']]), { decl: [Q(4), "signal ck, dir : std_logic := 'X';"], body: [UPDN, 'ck <= up and down;',
  'process (up, down)', 'begin', '  -- silinx: ignore latch', "  if up = '0' and down = '1' then dir <= '1';", '  -- silinx: ignore latch', "  elsif down = '0' and up = '1' then dir <= '0';", '  end if;', 'end process;',
  "-- silinx: ignore data-as-clock (UP and DOWN are its clocks: the chip's)", 'process (ck, clr, load_n)', 'begin', "  if clr = '1' then q <= \"0000\";", `  ${ASYNC_LOAD}`,
  "  elsif load_n = '0' then q <= d & c & b & a;", '  elsif rising_edge(ck) then', "    if dir = '1' then", ...ind(decUp('q'), 3), "    elsif dir = '0' then", ...ind(decDown('q'), 3),
  "    else q <= (others => 'X');", '    end if;', '  end if;', 'end process;', ...outs('q', ['qa', 'qb', 'qc', 'qd']),
  UPDN, `co_n <= not (${is('q', 4, 9)} and (not up));`, UPDN, `bo_n <= not (${is('q', 4, 0)} and (not down));`] });

// ------------------------------------------------------------------ ripple counters (falling edges): 74196, 74197, 74290, 74390, 74393, 7492
// QA a divide by 2 on its clock; QB–QD a divide by 5 (decade: 0 to 4, 5 to 7 then 0), by 8, or by 6 (7492) on theirs
const div5 = (v) => [`if ${v}(2) = '1' then ${v} <= "000";`, `else ${up(v)}`, 'end if;'];
// (the 7492's divide by 6, QB and QC a divide by 3, QD theirs halved: 0, 1, 2, 4, 5, 6; 3 to 4, 7 to 0)
const div6 = (v) => [`case ${v} is`, ...[[0, 1], [1, 2], [2, 4], [3, 4], [4, 5], [5, 6]].map(([a, b]) => `  when "${a.toString(2).padStart(3, '0')}" => ${v} <= "${b.toString(2).padStart(3, '0')}";`),
  `  when others => ${v} <= "000";`, 'end case;'];
// a stage: its register, its clock, its asynchronous controls ([condition, value, the signals it reads] by priority), its count
function stage(r, clk, ctl, count) {
  return [CLOCKED, `process (${[clk, ...new Set(ctl.flatMap(([, , s]) => s))].join(', ')})`, 'begin',
    ...ctl.flatMap(([c, v], i) => [...(/load/.test(c) ? [`  ${ASYNC_LOAD}`] : []), `  ${i ? 'elsif' : 'if'} ${c} then ${r} <= ${v};`]),
    `  ${ctl.length ? 'elsif' : 'if'} falling_edge(${clk}) then`, ...ind(count, 2), '  end if;', 'end process;'];
}
// 74196, 74197: CLEAR̅ low: 0; COUNT/LOAD̅ low: DCBA loaded; QA on CLK1, QB–QD on CLK2 (decade: by 5; binary: by 8)
function presettable(type, title, decade) {
  const clr = (v) => ["clr_n = '0'", v, ['clr_n']], load = (v) => ["load_n = '0'", v, ['load_n']];
  return ic(type, title, 15, M14([[1, `CT/LOAD${BAR}`, 'in', 'load_n'], [2, 'QC', 'out', 'qc'], [3, 'C', 'in', 'c'], [4, 'A', 'in', 'a'], [5, 'QA', 'out', 'qa'], [6, 'CLK2', 'in', 'clk2'],
    [7, 'GND', 'gnd'], [8, 'CLK1', 'in', 'clk1'], [9, 'QB', 'out', 'qb'], [10, 'B', 'in', 'b'], [11, 'D', 'in', 'd'], [12, 'QD', 'out', 'qd'], [13, `CLR${BAR}`, 'in', 'clr_n'], [14, 'VCC', 'vcc']]),
  { decl: ["signal s0 : std_logic := 'X';", Q(3, 's1')], body: [...stage('s0', 'clk1', [clr("'0'"), load('a')], ['s0 <= not s0;']),
    ...stage('s1', 'clk2', [clr('"000"'), load('d & c & b')], decade ? div5('s1') : [up('s1')]), 'qa <= s0;', ...outs('s1', ['qb', 'qc', 'qd'])] });
}
const c74196 = presettable('74196', 'Presettable decade counter (divide by 2 and by 5, falling edges)', true);
const c74197 = presettable('74197', 'Presettable 4-bit binary counter (divide by 2 and by 8, falling edges)', false);
// 74290: the 7490's on another pinout: R0(1) and R0(2) high: 0; R9(1) and R9(2) high: 9 (first)
const c74290 = ic('74290', 'Decade counter (divide by 2 and by 5, falling edges)', 15, M14([[1, 'R9(1)', 'in', 'r91'], [2, 'NC', 'nc'], [3, 'R9(2)', 'in', 'r92'], [4, 'QC', 'out', 'qc'],
  [5, 'QB', 'out', 'qb'], [6, 'NC', 'nc'], [7, 'GND', 'gnd'], [8, 'QD', 'out', 'qd'], [9, 'QA', 'out', 'qa'], [10, 'CKA', 'in', 'cka'], [11, 'CKB', 'in', 'ckb'], [12, 'R0(1)', 'in', 'r01'],
  [13, 'R0(2)', 'in', 'r02'], [14, 'VCC', 'vcc']]), { decl: ["signal s0, r0, r9 : std_logic := 'X';", Q(3, 's1')], body: ['r0 <= r01 and r02;', 'r9 <= r91 and r92;',
  ...stage('s0', 'cka', [["r9 = '1'", "'1'", ['r9']], ["r0 = '1'", "'0'", ['r0']]], ['s0 <= not s0;']),
  ...stage('s1', 'ckb', [["r9 = '1'", '"100"', ['r9']], ["r0 = '1'", '"000"', ['r0']]], div5('s1')), 'qa <= s0;', ...outs('s1', ['qb', 'qc', 'qd'])] });
// 74390 (dual decade: by 2 on CKA, by 5 on CKB) and 74393 (dual 4-bit binary on A): CLR high: 0
const cleared = (clr, stages) => stages.flatMap(([r, clk, v, count]) => stage(r, clk, [[`${clr} = '1'`, v, [clr]]], count));
const c74390 = ic('74390', 'Dual decade counter (divide by 2 and by 5, falling edges)', 15, M16([[1, '1CKA', 'in', 'cka1'], [2, '1CLR', 'in', 'clr1'], [3, '1QA', 'out', 'qa1'],
  [4, '1CKB', 'in', 'ckb1'], [5, '1QB', 'out', 'qb1'], [6, '1QC', 'out', 'qc1'], [7, '1QD', 'out', 'qd1'], [8, 'GND', 'gnd'], [9, '2QD', 'out', 'qd2'], [10, '2QC', 'out', 'qc2'], [11, '2QB', 'out', 'qb2'],
  [12, '2CKB', 'in', 'ckb2'], [13, '2QA', 'out', 'qa2'], [14, '2CLR', 'in', 'clr2'], [15, '2CKA', 'in', 'cka2'], [16, 'VCC', 'vcc']]), { decl: ["signal a1, a2 : std_logic := 'X';", Q(3, 'b1'), Q(3, 'b2')],
  body: [1, 2].flatMap((k) => [...cleared(`clr${k}`, [[`a${k}`, `cka${k}`, "'0'", [`a${k} <= not a${k};`]], [`b${k}`, `ckb${k}`, '"000"', div5(`b${k}`)]]), `qa${k} <= a${k};`,
    ...outs(`b${k}`, [`qb${k}`, `qc${k}`, `qd${k}`])]) });
const c74393 = ic('74393', 'Dual 4-bit binary counter (falling edge)', 15, M14([[1, '1A', 'in', 'clk1'], [2, '1CLR', 'in', 'clr1'], [3, '1QA', 'out', 'qa1'], [4, '1QB', 'out', 'qb1'],
  [5, '1QC', 'out', 'qc1'], [6, '1QD', 'out', 'qd1'], [7, 'GND', 'gnd'], [8, '2QD', 'out', 'qd2'], [9, '2QC', 'out', 'qc2'], [10, '2QB', 'out', 'qb2'], [11, '2QA', 'out', 'qa2'], [12, '2CLR', 'in', 'clr2'],
  [13, '2A', 'in', 'clk2'], [14, 'VCC', 'vcc']]), { decl: [Q(4, 'n1'), Q(4, 'n2')],
  body: [1, 2].flatMap((k) => [...cleared(`clr${k}`, [[`n${k}`, `clk${k}`, '"0000"', [up(`n${k}`)]]]), ...outs(`n${k}`, [`qa${k}`, `qb${k}`, `qc${k}`, `qd${k}`])]) });
// 7492: by 2 on CKA, by 6 on CKB; R0(1) and R0(2) high: 0
const c7492 = ic('7492', 'Divide-by-12 counter (divide by 2 and by 6, falling edges)', 15, M14([[1, 'CKB', 'in', 'ckb'], [2, 'NC', 'nc'], [3, 'NC', 'nc'], [4, 'NC', 'nc'], [5, 'VCC', 'vcc'],
  [6, 'R0(1)', 'in', 'r01'], [7, 'R0(2)', 'in', 'r02'], [8, 'QD', 'out', 'qd'], [9, 'QC', 'out', 'qc'], [10, 'GND', 'gnd'], [11, 'QB', 'out', 'qb'], [12, 'QA', 'out', 'qa'], [13, 'NC', 'nc'],
  [14, 'CKA', 'in', 'cka']]), { decl: ["signal s0, r0 : std_logic := 'X';", Q(3, 's1')], body: ['r0 <= r01 and r02;', ...stage('s0', 'cka', [["r0 = '1'", "'0'", ['r0']]], ['s0 <= not s0;']),
  ...stage('s1', 'ckb', [["r0 = '1'", '"000"', ['r0']]], div6('s1')), 'qa <= s0;', ...outs('s1', ['qb', 'qc', 'qd'])] });

// ------------------------------------------------------------------ 74590: 8-bit counter and its register, 3-state outputs
// CCLR̅ low clears the counter; on CCK's rising edge with CCKEN̅ low it counts; on RCK's rising edge the register takes
// it; G̅ low puts the register on QA–QH; RCO̅ low while the counter is at 255
const c74590 = ic('74590', '8-bit binary counter, output register, 3-state outputs', 25, M16([[1, 'QB', 'out', 'qb'], [2, 'QC', 'out', 'qc'], [3, 'QD', 'out', 'qd'], [4, 'QE', 'out', 'qe'],
  [5, 'QF', 'out', 'qf'], [6, 'QG', 'out', 'qg'], [7, 'QH', 'out', 'qh'], [8, 'GND', 'gnd'], [9, `RCO${BAR}`, 'out', 'rco_n'], [10, `CCLR${BAR}`, 'in', 'cclr_n'], [11, 'CCK', 'in', 'cck'],
  [12, `CCKEN${BAR}`, 'in', 'ccken_n'], [13, 'RCK', 'in', 'rck'], [14, `G${BAR}`, 'in', 'g_n'], [15, 'QA', 'out', 'qa'], [16, 'VCC', 'vcc']]), { decl: [Q(8, 'n'), Q(8, 'r')], body: [
  CLOCKED, 'process (cck, cclr_n)', 'begin', "  if cclr_n = '0' then n <= \"00000000\";", '  elsif rising_edge(cck) then', `    if ccken_n = '0' then ${up('n')} end if;`, '  end if;', 'end process;',
  CLOCKED, 'process (rck)', 'begin', '  if rising_edge(rck) then r <= n; end if;', 'end process;', ...outs('r', ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh']),
  `rco_n <= not (${is('n', 8, 255)});`] }, 'ttl', { enable: [['g_n', '0']], outs: ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh'] });

// ------------------------------------------------------------------ the 4000's: 4020, 4040 (binary ripple), 4022 (octal), 4029, 4510 (up/down), 4518, 4520 (dual up)
// 4020 (14 stages) and 4040 (12): RESET high: 0; on CLK's falling edge one more; Q1 its first stage
function binRipple(type, title, n, qPins) {
  const pins = [[8, 'VSS', 'gnd'], [10, 'CLK', 'in', 'clk'], [11, 'RESET', 'in', 'reset'], [16, 'VDD', 'vcc'], ...qPins.map(([pin, k]) => [pin, `Q${k}`, 'out', `q${k}`])];
  return ic(type, title, 180, M16(pins), { decl: [Q(n, 'n')], body: [...stage('n', 'clk', [["reset = '1'", "(others => '0')", ['reset']]], [up('n')]),
    ...qPins.map(([, k]) => `q${k} <= n(${k - 1});`)] }, 'cmos');
}
const c4020 = binRipple('4020', '14-stage binary ripple counter', 14, [[9, 1], [7, 4], [5, 5], [4, 6], [6, 7], [13, 8], [12, 9], [14, 10], [15, 11], [1, 12], [2, 13], [3, 14]]);
const c4040 = binRipple('4040', '12-stage binary ripple counter', 12, [[9, 1], [7, 2], [6, 3], [5, 4], [3, 5], [2, 6], [4, 7], [13, 8], [12, 9], [14, 10], [15, 11], [1, 12]]);
// 4022: RST high: 0; on CLK's rising edge while CLK INH is low one more, 7 to 0; Q0–Q7 decoded (one high), CO high for 0 to 3
const c4022 = ic('4022', 'Octal counter/divider with 8 decoded outputs', 300, M16([[1, 'Q1', 'out', 'q1'], [2, 'Q0', 'out', 'q0'], [3, 'Q2', 'out', 'q2'], [4, 'Q5', 'out', 'q5'], [5, 'Q6', 'out', 'q6'],
  [6, 'NC', 'nc'], [7, 'Q3', 'out', 'q3'], [8, 'VSS', 'gnd'], [9, 'NC', 'nc'], [10, 'Q7', 'out', 'q7'], [11, 'Q4', 'out', 'q4'], [12, 'CO', 'out', 'co'], [13, 'CLK INH', 'in', 'inh'], [14, 'CLK', 'in', 'clk'],
  [15, 'RST', 'in', 'rst'], [16, 'VDD', 'vcc']]), { decl: [Q(3, 'n')], body: [CLOCKED, 'process (clk, rst)', 'begin', "  if rst = '1' then n <= \"000\";", '  elsif rising_edge(clk) then',
  `    if inh = '0' then ${up('n')} end if;`, '  end if;', 'end process;', ...[...Array(8)].map((_, k) => `q${k} <= ${is('n', 3, k)};`), 'co <= not n(2);'] }, 'cmos');
// 4029 and 4510: PE high: JAM (P) loaded; on CLK's rising edge while CI̅ is low up (U/D̅ high) or down, binary (4029's
// B/D̅ high) or decade; CO̅ low while CI̅ is low and the count is at its end; the 4510's RESET high: 0 (first)
function presetUpDown(type, title, { reset, data }) {
  const step = (dir) => (reset ? (dir ? decUp('q') : decDown('q'))
    : [`if bd = '0' and q = "${dir ? '1001' : '0000'}" then q <= "${dir ? '0000' : '1001'}";`, `else ${dir ? up('q') : down('q')}`, 'end if;']);
  const [l3, l4, l9] = reset ? ['P', 'RESET', 'reset'] : ['J', `B/D${BAR}`, 'bd'];
  const pins = [[1, 'PE', 'in', 'pe'], [2, 'Q4', 'out', 'q4'], [3, `${l3}4`, 'in', data[0]], [4, `${l3}1`, 'in', data[3]], [5, `CI${BAR}`, 'in', 'ci_n'], [6, 'Q1', 'out', 'q1'],
    [7, `CO${BAR}`, 'out', 'co_n'], [8, 'VSS', 'gnd'], [9, l4, 'in', l9], [10, `U/D${BAR}`, 'in', 'ud'], [11, 'Q2', 'out', 'q2'], [12, `${l3}2`, 'in', data[2]], [13, `${l3}3`, 'in', data[1]],
    [14, 'Q3', 'out', 'q3'], [15, 'CLK', 'in', 'clk'], [16, 'VDD', 'vcc']];
  const max = reset ? is('q', 4, 9) : `((bd and ${is('q', 4, 15)}) or ((not bd) and ${is('q', 4, 9)}))`;
  return ic(type, title, 240, M16(pins), { decl: [Q(4)], body: [CLOCKED, `process (${reset ? 'clk, reset, pe' : 'clk, pe'})`, 'begin', ...(reset ? ["  if reset = '1' then q <= \"0000\";"] : []),
    `  ${ASYNC_LOAD}`, `  ${reset ? 'elsif' : 'if'} pe = '1' then q <= ${data.join(' & ')};`, '  elsif rising_edge(clk) then', "    if ci_n = '0' then", "      if ud = '1' then",
    ...ind(step(true), 4), '      else', ...ind(step(false), 4), '      end if;', '    end if;', '  end if;', 'end process;', ...outs('q', ['q1', 'q2', 'q3', 'q4']),
    `co_n <= not ((not ci_n) and ((ud and ${max}) or ((not ud) and ${is('q', 4, 0)})));`] }, 'cmos');
}
const c4029 = presetUpDown('4029', 'Presettable up/down counter, binary or decade', { reset: false, data: ['j4', 'j3', 'j2', 'j1'] });
const c4510 = presetUpDown('4510', 'Presettable up/down decade counter', { reset: true, data: ['p4', 'p3', 'p2', 'p1'] });
// 4518 (dual decade), 4520 (dual binary): RESET high: 0; one more on CLK's rising edge while ENABLE is high, or on
// ENABLE's falling edge while CLK is low (the rising edge of CLK or not ENABLE)
function dualUp(type, title, decade) {
  const unit = (k, at) => [[at, `${k}CLK`, 'in', `clk${k}`], [at + 1, `${k}EN`, 'in', `en${k}`], [at + 2, `${k}Q1`, 'out', `q1${k}`], [at + 3, `${k}Q2`, 'out', `q2${k}`],
    [at + 4, `${k}Q3`, 'out', `q3${k}`], [at + 5, `${k}Q4`, 'out', `q4${k}`], [at + 6, `${k}RESET`, 'in', `reset${k}`]];
  const CK = "-- silinx: ignore clock-as-data (CLK and ENABLE are its clock, ORed: the chip's)";
  return ic(type, title, 280, M16([...unit(1, 1), [8, 'VSS', 'gnd'], ...unit(2, 9), [16, 'VDD', 'vcc']]), { decl: ["signal ck1, ck2 : std_logic := 'X';", Q(4, 'n1'), Q(4, 'n2')],
    body: [1, 2].flatMap((k) => [CK, `ck${k} <= clk${k} or (not en${k});`, "-- silinx: ignore data-as-clock (CLK and ENABLE are its clock: the chip's)", `process (ck${k}, reset${k})`, 'begin',
      `  if reset${k} = '1' then n${k} <= "0000";`, `  elsif rising_edge(ck${k}) then`, ...ind(decade ? decUp(`n${k}`) : [up(`n${k}`)], 2), '  end if;', 'end process;',
      ...outs(`n${k}`, [`q1${k}`, `q2${k}`, `q3${k}`, `q4${k}`])]) }, 'cmos');
}
const c4518 = dualUp('4518', 'Dual BCD up counter', true);
const c4520 = dualUp('4520', 'Dual 4-bit binary up counter', false);

/** The counters written once in VHDL (#4397, group D), as the library lists them. */
export const COUNTER_ICS = [c74160, c74162, c74168, c74169, c74190, c74192, c74196, c74197, c74290, c74390, c74393, c7492, c74590, c4020, c4040, c4022, c4029, c4510, c4518, c4520];
