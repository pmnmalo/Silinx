// The sequential ICs of a digital circuit (#3900, docs/CIRCUITS.md): flip-flops (7474, 7476, 74112), counters (7490,
// 7493, 74161, 74163, 74191, 74193, 4017), shift registers (74164, 74165, 74194, 74595) and a latching BCD to
// 7-segment decoder (4511). Each has its datasheet's pinout, its typical delay and its model, written three times the same
// way, in the clocked style a synthesis tool reads: its processes (each run when one of its sensitivity's inputs changes,
// as a VHDL process: an asynchronous control first, else its clock's edge, rising_edge's '0' to '1'), and its outputs
// from its registers. The engine's (`seq`: `init()`, `procs`: [{ sens, run(i, p, s) }] on the inputs' levels i, their
// previous p, the state s; `out(i, s)`; `derive(i)`: the levels a process clocks on, an AND or an OR of two pins); its
// VHDL's and its Verilog's (`decl`, `body`: what core/circuit-hdl-ics.js's wrapper writes between its inputs read,
// i_<port>, and its outputs driven, o_<port>). An unknown level a register takes, or a count of an unknown register, is
// X. Releasing one of two asynchronous controls both active (a 7474's PRE̅ and CLR̅, the 7490's R0 and R9, the
// 74193's CLR and LOAD̅) is not stable on the chip: Verilog's edges do not see the release, VHDL's process and the
// engine do. Isomorphic module.
import { dip } from './circuit-ics.js';
import { SEGMENTS } from './circuit-msi.js';

const BAR = '̅';
const nb = (v) => (v === '0' ? '1' : v === '1' ? '0' : 'X');
const known = (bits) => bits.every((b) => b === '0' || b === '1');
const num = (bits) => (known(bits) ? bits.reduce((v, b, k) => v | (b === '1' ? 1 << k : 0), 0) : null);
const toBits = (v, w) => (v == null ? Array(w).fill('X') : [...Array(w)].map((_, k) => ((v >> k) & 1 ? '1' : '0')));
const xs = (w) => Array(w).fill('X');
const and2 = (...v) => (v.includes('0') ? '0' : v.every((x) => x === '1') ? '1' : 'X');
const or2 = (...v) => (v.includes('1') ? '1' : v.every((x) => x === '0') ? '0' : 'X');
const inc = (bits, by, mod) => { const v = num(bits); return toBits(v == null ? null : (((v + by) % mod) + mod) % mod, bits.length); };
const rose = (i, p, c) => p[c] === '0' && i[c] === '1';
const fell = (i, p, c) => p[c] === '1' && i[c] === '0';
const P = (at) => (n, name, dir, port) => ({ n, name, dir, ...at(n), port: port ?? name.replace(BAR, '_n').toLowerCase() });
const P14 = P(dip(14)), P16 = P(dip(16));
const ic = (type, title, tpd, pins, rest, family = 'ttl') => ({ type, title, kind: 'ic', family, chip: family === 'ttl' ? `SN74LS${type.slice(2)}` : `CD${type}B`, tpd, dip: pins.length, pins, ...rest });
// VHDL: a register's +1 / −1 (X once any bit is)
const vInc = (r, by) => `if anyx(${r}) then ${r} <= (others => 'X'); else ${r} <= std_logic_vector(unsigned(${r}) ${by < 0 ? '-' : '+'} 1); end if;`;
const QN = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh'];
const dcba = (i) => [i.a, i.b, i.c, i.d];
const qOut = (q, extra = {}) => ({ qa: q[0], qb: q[1], qc: q[2], qd: q[3], ...extra });
const vQ = ['o_qa <= q(0);', 'o_qb <= q(1);', 'o_qc <= q(2);', 'o_qd <= q(3);'], gQ = ['assign o_qa = q[0];', 'assign o_qb = q[1];', 'assign o_qc = q[2];', 'assign o_qd = q[3];'];
const Q4 = { vhdl: "signal q : std_logic_vector(3 downto 0) := (others => 'X');", verilog: "reg [3:0] q = 4'bxxxx;" };

// ------------------------------------------------------------------ flip-flops: 7474 (D, rising), 7476 and 74112 (J-K, falling)
// PRE̅ low: Q high; else CLR̅ low: Q low; else the clock's edge; both low: Q and Q̄ high
function flipFlops(type, title, tpd, pins, jkff) {
  const edgeV = jkff ? 'falling_edge' : 'rising_edge', edgeG = jkff ? 'negedge' : 'posedge';
  const v = (k) => [`process (i_clk${k}, i_pre${k}_n, i_clr${k}_n)`, 'begin', `  if i_pre${k}_n = '0' then r${k} <= '1';`, `  elsif i_clr${k}_n = '0' then r${k} <= '0';`, `  elsif ${edgeV}(i_clk${k}) then`,
    jkff ? `    case std_logic_vector'(i_j${k} & i_k${k}) is when "00" => null; when "01" => r${k} <= '0'; when "10" => r${k} <= '1'; when "11" => r${k} <= not r${k}; when others => r${k} <= 'X'; end case;` : `    r${k} <= i_d${k};`,
    '  end if;', 'end process;', `o_q${k} <= r${k};`, `o_q${k}_n <= '1' when i_pre${k}_n = '0' and i_clr${k}_n = '0' else not r${k};`];
  const g = (k) => [`always @(${edgeG} i_clk${k} or negedge i_pre${k}_n or negedge i_clr${k}_n)`, `  if (!i_pre${k}_n) r${k} <= 1'b1;`, `  else if (!i_clr${k}_n) r${k} <= 1'b0;`,
    jkff ? `  else case ({i_j${k}, i_k${k}}) 2'b00: r${k} <= r${k}; 2'b01: r${k} <= 1'b0; 2'b10: r${k} <= 1'b1; 2'b11: r${k} <= ~r${k}; default: r${k} <= 1'bx; endcase` : `  else r${k} <= i_d${k};`,
    `assign o_q${k} = r${k};`, `assign o_q${k}_n = (i_pre${k}_n === 1'b0 && i_clr${k}_n === 1'b0) ? 1'b1 : ~r${k};`];
  const proc = (k) => ({ sens: [`clk${k}`, `pre${k}_n`, `clr${k}_n`], run(i, p, s) {
    const q = `q${k}`, c = `clk${k}`;
    if (i[`pre${k}_n`] === '0') s[q] = '1'; else if (i[`clr${k}_n`] === '0') s[q] = '0';
    else if (jkff ? fell(i, p, c) : rose(i, p, c)) {
      const j = i[`j${k}`], kk = i[`k${k}`];
      s[q] = !jkff ? i[`d${k}`] : j === '0' && kk === '0' ? s[q] : j === '0' && kk === '1' ? '0' : j === '1' && kk === '0' ? '1' : j === '1' && kk === '1' ? nb(s[q]) : 'X';
    }
  } });
  return ic(type, title, tpd, pins, {
    seq: { init: () => ({ q1: 'X', q2: 'X' }), procs: [proc(1), proc(2)],
      out: (i, s) => Object.fromEntries([1, 2].flatMap((k) => [[`q${k}`, s[`q${k}`]], [`q${k}_n`, i[`pre${k}_n`] === '0' && i[`clr${k}_n`] === '0' ? '1' : nb(s[`q${k}`])]])) },
    vhdl: { decl: ["signal r1, r2 : std_logic := 'X';"], body: [...v(1), ...v(2)] },
    verilog: { decl: ["reg r1 = 1'bx, r2 = 1'bx;"], body: [...g(1), ...g(2)] },
  });
}
const c7474 = flipFlops('7474', 'Dual D flip-flop, preset and clear (rising edge)', 20, [P14(1, `1CLR${BAR}`, 'in', 'clr1_n'), P14(2, '1D', 'in', 'd1'), P14(3, '1CLK', 'in', 'clk1'),
  P14(4, `1PRE${BAR}`, 'in', 'pre1_n'), P14(5, '1Q', 'out', 'q1'), P14(6, `1Q${BAR}`, 'out', 'q1_n'), P14(7, 'GND', 'gnd'), P14(8, `2Q${BAR}`, 'out', 'q2_n'), P14(9, '2Q', 'out', 'q2'),
  P14(10, `2PRE${BAR}`, 'in', 'pre2_n'), P14(11, '2CLK', 'in', 'clk2'), P14(12, '2D', 'in', 'd2'), P14(13, `2CLR${BAR}`, 'in', 'clr2_n'), P14(14, 'VCC', 'vcc')], false);
const c7476 = flipFlops('7476', 'Dual J-K flip-flop, preset and clear (falling edge)', 15, [P16(1, '1CLK', 'in', 'clk1'), P16(2, `1PRE${BAR}`, 'in', 'pre1_n'), P16(3, `1CLR${BAR}`, 'in', 'clr1_n'),
  P16(4, '1J', 'in', 'j1'), P16(5, 'VCC', 'vcc'), P16(6, '2CLK', 'in', 'clk2'), P16(7, `2PRE${BAR}`, 'in', 'pre2_n'), P16(8, `2CLR${BAR}`, 'in', 'clr2_n'), P16(9, '2J', 'in', 'j2'),
  P16(10, `2Q${BAR}`, 'out', 'q2_n'), P16(11, '2Q', 'out', 'q2'), P16(12, '2K', 'in', 'k2'), P16(13, 'GND', 'gnd'), P16(14, `1Q${BAR}`, 'out', 'q1_n'), P16(15, '1Q', 'out', 'q1'), P16(16, '1K', 'in', 'k1')], true);
const c74112 = flipFlops('74112', 'Dual J-K flip-flop, preset and clear (falling edge)', 15, [P16(1, '1CLK', 'in', 'clk1'), P16(2, '1K', 'in', 'k1'), P16(3, '1J', 'in', 'j1'),
  P16(4, `1PRE${BAR}`, 'in', 'pre1_n'), P16(5, '1Q', 'out', 'q1'), P16(6, `1Q${BAR}`, 'out', 'q1_n'), P16(7, `2Q${BAR}`, 'out', 'q2_n'), P16(8, 'GND', 'gnd'), P16(9, '2Q', 'out', 'q2'),
  P16(10, `2PRE${BAR}`, 'in', 'pre2_n'), P16(11, '2J', 'in', 'j2'), P16(12, '2K', 'in', 'k2'), P16(13, '2CLK', 'in', 'clk2'), P16(14, `2CLR${BAR}`, 'in', 'clr2_n'), P16(15, `1CLR${BAR}`, 'in', 'clr1_n'),
  P16(16, 'VCC', 'vcc')], true);

// ------------------------------------------------------------------ ripple counters (falling edges): 7493, 7490
// QA a divide by 2 on CKA; QB–QD a divide by 8 (7493) or by 5 (7490: 0 to 4) on CKB; R0 both high: 0; the 7490's R9 both high: 9
function ripple(type, title, decade, pins) {
  const sens = ['r0', 'r9'];
  return ic(type, title, 15, pins, {
    seq: {
      init: () => ({ a: 'X', b: xs(3) }),
      derive: (i) => ({ r0: and2(i.r01, i.r02), r9: decade ? and2(i.r91, i.r92) : '0' }),
      procs: [{ sens: ['cka', ...sens], run(i, p, s) { if (i.r9 === '1') s.a = '1'; else if (i.r0 === '1') s.a = '0'; else if (fell(i, p, 'cka')) s.a = nb(s.a); } },
        { sens: ['ckb', ...sens], run(i, p, s) {
          if (i.r9 === '1') s.b = ['0', '0', '1']; else if (i.r0 === '1') s.b = toBits(0, 3);
          else if (fell(i, p, 'ckb')) s.b = decade ? (num(s.b) == null ? xs(3) : toBits(num(s.b) >= 4 ? 0 : num(s.b) + 1, 3)) : inc(s.b, 1, 8);
        } }],
      out: (i, s) => ({ qa: s.a, qb: s.b[0], qc: s.b[1], qd: s.b[2] }),
    },
    vhdl: { decl: ["signal a, r0, r9 : std_logic := 'X';", "signal b : std_logic_vector(2 downto 0) := (others => 'X');"], body: [
      'r0 <= i_r01 and i_r02;', `r9 <= ${decade ? 'i_r91 and i_r92' : "'0'"};`,
      'process (i_cka, r0, r9)', 'begin', "  if r9 = '1' then a <= '1'; elsif r0 = '1' then a <= '0'; elsif falling_edge(i_cka) then a <= not a; end if;", 'end process;',
      'process (i_ckb, r0, r9)', 'begin', "  if r9 = '1' then b <= \"100\"; elsif r0 = '1' then b <= \"000\";", '  elsif falling_edge(i_ckb) then',
      decade ? '    if anyx(b) then b <= "XXX"; elsif unsigned(b) >= 4 then b <= "000"; else b <= std_logic_vector(unsigned(b) + 1); end if;' : `    ${vInc('b', 1)}`, '  end if;', 'end process;',
      'o_qa <= a;', 'o_qb <= b(0);', 'o_qc <= b(1);', 'o_qd <= b(2);'] },
    verilog: { decl: ["reg a = 1'bx;", "reg [2:0] b = 3'bxxx;", 'wire r0 = i_r01 & i_r02;', `wire r9 = ${decade ? 'i_r91 & i_r92' : "1'b0"};`], body: [
      "always @(negedge i_cka or posedge r0 or posedge r9) if (r9) a <= 1'b1; else if (r0) a <= 1'b0; else a <= ~a;",
      `always @(negedge i_ckb or posedge r0 or posedge r9) if (r9) b <= 3'b100; else if (r0) b <= 3'b000; else b <= ${decade ? "(b >= 3'd4) ? 3'd0 : b + 3'd1" : "b + 3'd1"};`,
      'assign o_qa = a;', 'assign o_qb = b[0];', 'assign o_qc = b[1];', 'assign o_qd = b[2];'] },
  });
}
const RIPPLE_PINS = (decade) => [P14(1, 'CKB', 'in'), P14(2, 'R0(1)', 'in', 'r01'), P14(3, 'R0(2)', 'in', 'r02'), P14(4, 'NC', 'nc'), P14(5, 'VCC', 'vcc'),
  decade ? P14(6, 'R9(1)', 'in', 'r91') : P14(6, 'NC', 'nc'), decade ? P14(7, 'R9(2)', 'in', 'r92') : P14(7, 'NC', 'nc'), P14(8, 'QC', 'out'), P14(9, 'QB', 'out'), P14(10, 'GND', 'gnd'),
  P14(11, 'QD', 'out'), P14(12, 'QA', 'out'), P14(13, 'NC', 'nc'), P14(14, 'CKA', 'in')];
const c7490 = ripple('7490', 'Decade counter (divide by 2 and by 5, falling edges)', true, RIPPLE_PINS(true));
const c7493 = ripple('7493', '4-bit binary counter (divide by 2 and by 8, falling edges)', false, RIPPLE_PINS(false));

// ------------------------------------------------------------------ synchronous counters: 74161, 74163, 74191, 74193
// 74161 (CLR̅ asynchronous) and 74163 (CLR̅ on the clock's edge): on the rising edge LOAD̅ low loads DCBA, else ENP and
// ENT high count; RCO is ENT and 15
function sync16x(type, title, syncClear) {
  const pins = [P16(1, `CLR${BAR}`, 'in'), P16(2, 'CLK', 'in'), P16(3, 'A', 'in'), P16(4, 'B', 'in'), P16(5, 'C', 'in'), P16(6, 'D', 'in'), P16(7, 'ENP', 'in'), P16(8, 'GND', 'gnd'),
    P16(9, `LOAD${BAR}`, 'in'), P16(10, 'ENT', 'in'), P16(11, 'QD', 'out'), P16(12, 'QC', 'out'), P16(13, 'QB', 'out'), P16(14, 'QA', 'out'), P16(15, 'RCO', 'out'), P16(16, 'VCC', 'vcc')];
  const count = (i, s) => { const en = and2(i.enp, i.ent); s.q = i.load_n === '0' ? dcba(i) : en === '1' ? inc(s.q, 1, 16) : en === '0' ? s.q : xs(4); };
  const vCount = ["    if i_load_n = '0' then q <= i_d & i_c & i_b & i_a;", `    elsif (i_enp and i_ent) = '1' then ${vInc('q', 1)}`, "    elsif (i_enp and i_ent) /= '0' then q <= (others => 'X');", '    end if;'];
  return ic(type, title, 20, pins, {
    seq: {
      init: () => ({ q: xs(4) }),
      procs: [{ sens: syncClear ? ['clk'] : ['clk', 'clr_n'], run(i, p, s) {
        if (!syncClear && i.clr_n === '0') s.q = toBits(0, 4);
        else if (rose(i, p, 'clk')) { if (syncClear && i.clr_n === '0') s.q = toBits(0, 4); else count(i, s); }
      } }],
      out: (i, s) => qOut(s.q, { rco: and2(i.ent, ...s.q) }),
    },
    vhdl: { decl: [Q4.vhdl], body: [`process (${syncClear ? 'i_clk' : 'i_clk, i_clr_n'})`, 'begin',
      ...(syncClear ? ['  if rising_edge(i_clk) then', "    if i_clr_n = '0' then q <= \"0000\";", ...vCount.map((l) => l.replace(/^ {4}if /, '    elsif ')), '  end if;']
        : ["  if i_clr_n = '0' then q <= \"0000\";", '  elsif rising_edge(i_clk) then', ...vCount, '  end if;']),
      'end process;', ...vQ, 'o_rco <= i_ent and q(0) and q(1) and q(2) and q(3);'] },
    verilog: { decl: [Q4.verilog], body: [`always @(posedge i_clk${syncClear ? '' : ' or negedge i_clr_n'})`, "  if (!i_clr_n) q <= 4'd0;", "  else if (!i_load_n) q <= {i_d, i_c, i_b, i_a};",
      "  else if ((i_enp & i_ent) === 1'b1) q <= q + 4'd1;", "  else if ((i_enp & i_ent) !== 1'b0) q <= 4'bxxxx;", ...gQ, 'assign o_rco = i_ent & q[0] & q[1] & q[2] & q[3];'] },
  });
}
const c74161 = sync16x('74161', 'Synchronous 4-bit binary counter, asynchronous clear', false);
const c74163 = sync16x('74163', 'Synchronous 4-bit binary counter, synchronous clear', true);

// 74191: LOAD̅ asynchronous; on CLK's rising edge with CTEN̅ low, up (D/U̅ low) or down; MAX/MIN: 15 up, 0 down;
// RCO̅ low while CTEN̅ is low, MAX/MIN high and CLK low
const c74191 = ic('74191', 'Synchronous 4-bit up/down binary counter', 20, [P16(1, 'B', 'in'), P16(2, 'QB', 'out'), P16(3, 'QA', 'out'), P16(4, `CTEN${BAR}`, 'in'), P16(5, `D/U${BAR}`, 'in', 'du'),
  P16(6, 'QC', 'out'), P16(7, 'QD', 'out'), P16(8, 'GND', 'gnd'), P16(9, 'D', 'in'), P16(10, 'C', 'in'), P16(11, `LOAD${BAR}`, 'in'), P16(12, 'MAX/MIN', 'out', 'maxmin'), P16(13, `RCO${BAR}`, 'out'),
  P16(14, 'CLK', 'in'), P16(15, 'A', 'in'), P16(16, 'VCC', 'vcc')], {
  seq: {
    init: () => ({ q: xs(4) }),
    procs: [{ sens: ['clk', 'load_n'], run(i, p, s) {
      if (i.load_n === '0') s.q = dcba(i);
      else if (rose(i, p, 'clk')) { if (i.cten_n === '0') s.q = i.du === '0' ? inc(s.q, 1, 16) : i.du === '1' ? inc(s.q, -1, 16) : xs(4); else if (i.cten_n !== '1') s.q = xs(4); }
    } }],
    out(i, s) { const mm = or2(and2(nb(i.du), ...s.q), and2(i.du, ...s.q.map(nb))); return qOut(s.q, { maxmin: mm, rco_n: nb(and2(nb(i.cten_n), mm, nb(i.clk))) }); },
  },
  vhdl: { decl: [Q4.vhdl, "signal mm : std_logic := 'X';"], body: ['process (i_clk, i_load_n)', 'begin', "  -- silinx: ignore sensitivity (an asynchronous load takes the inputs when it starts, as a flip-flop's in synthesis)", "  if i_load_n = '0' then q <= i_d & i_c & i_b & i_a;", '  elsif rising_edge(i_clk) then',
    `    if i_cten_n = '0' then if i_du = '0' then ${vInc('q', 1)} elsif i_du = '1' then ${vInc('q', -1)} else q <= (others => 'X'); end if;`, "    elsif i_cten_n /= '1' then q <= (others => 'X');", '    end if;',
    '  end if;', 'end process;', 'mm <= ((not i_du) and q(0) and q(1) and q(2) and q(3)) or (i_du and (not q(0)) and (not q(1)) and (not q(2)) and (not q(3)));', ...vQ, 'o_maxmin <= mm;',
    '-- silinx: ignore clock-as-data (RCO̅ is low while the clock is low: the chip\'s)', 'o_rco_n <= not ((not i_cten_n) and mm and (not i_clk));'] },
  verilog: { decl: [Q4.verilog, 'wire mm = (~i_du & q[0] & q[1] & q[2] & q[3]) | (i_du & ~q[0] & ~q[1] & ~q[2] & ~q[3]);'], body: ['always @(posedge i_clk or negedge i_load_n)',
    "  if (!i_load_n) q <= {i_d, i_c, i_b, i_a};", "  else if (i_cten_n === 1'b0) q <= (i_du === 1'b0) ? q + 4'd1 : (i_du === 1'b1) ? q - 4'd1 : 4'bxxxx;", "  else if (i_cten_n !== 1'b1) q <= 4'bxxxx;",
    ...gQ, 'assign o_maxmin = mm;', '// silinx: ignore clock-as-data (RCO̅ is low while the clock is low: the chip\'s)', 'assign o_rco_n = ~(~i_cten_n & mm & ~i_clk);'] },
});

// 74193: it counts on the rising edge of UP and DOWN ANDed (up when UP rose: the one that fell last, kept in dir);
// CLR (high) and LOAD̅ (low) asynchronous; CO̅ low while 15 and UP low, BO̅ low while 0 and DOWN low
const c74193 = ic('74193', 'Synchronous 4-bit up/down binary counter, dual clock', 20, [P16(1, 'B', 'in'), P16(2, 'QB', 'out'), P16(3, 'QA', 'out'), P16(4, 'DOWN', 'in'), P16(5, 'UP', 'in'),
  P16(6, 'QC', 'out'), P16(7, 'QD', 'out'), P16(8, 'GND', 'gnd'), P16(9, 'D', 'in'), P16(10, 'C', 'in'), P16(11, `LOAD${BAR}`, 'in'), P16(12, `CO${BAR}`, 'out'), P16(13, `BO${BAR}`, 'out'),
  P16(14, 'CLR', 'in'), P16(15, 'A', 'in'), P16(16, 'VCC', 'vcc')], {
  seq: {
    init: () => ({ q: xs(4), dir: 'X' }),
    derive: (i) => ({ ck: and2(i.up, i.down) }),
    procs: [{ sens: ['up', 'down'], run(i, p, s) { if (fell(i, p, 'up') || fell(i, p, 'down')) s.dir = nb(i.up); } },
      { sens: ['ck', 'clr', 'load_n'], run(i, p, s) {
        if (i.clr === '1') s.q = toBits(0, 4); else if (i.load_n === '0') s.q = dcba(i);
        else if (rose(i, p, 'ck')) s.q = s.dir === '1' ? inc(s.q, 1, 16) : s.dir === '0' ? inc(s.q, -1, 16) : xs(4);
      } }],
    out: (i, s) => qOut(s.q, { co_n: nb(and2(...s.q, nb(i.up))), bo_n: nb(and2(...s.q.map(nb), nb(i.down))) }),
  },
  vhdl: { decl: [Q4.vhdl, "signal ck, dir : std_logic := 'X';"], body: ['-- silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', 'ck <= i_up and i_down;',
    'process (i_up, i_down)', 'begin', '  ' + '-- silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', '  if falling_edge(i_up) or falling_edge(i_down) then dir <= not i_up; end if;', 'end process;',
    'process (ck, i_clr, i_load_n)', 'begin', "  if i_clr = '1' then q <= \"0000\";", "  -- silinx: ignore sensitivity (an asynchronous load takes the inputs when it starts, as a flip-flop's in synthesis)", "  elsif i_load_n = '0' then q <= i_d & i_c & i_b & i_a;", '  elsif rising_edge(ck) then',
    `    if dir = '1' then ${vInc('q', 1)} elsif dir = '0' then ${vInc('q', -1)} else q <= (others => 'X'); end if;`, '  end if;', 'end process;', ...vQ,
    '-- silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', 'o_co_n <= not (q(0) and q(1) and q(2) and q(3) and (not i_up));', '-- silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', 'o_bo_n <= not ((not q(0)) and (not q(1)) and (not q(2)) and (not q(3)) and (not i_down));'] },
  verilog: { decl: [Q4.verilog, "reg dir = 1'bx;", '// silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', 'wire ck = i_up & i_down;'], body: ['always @(negedge i_up or negedge i_down) dir <= ~i_up;',
    'always @(posedge ck or posedge i_clr or negedge i_load_n)', "  if (i_clr) q <= 4'd0;", "  else if (!i_load_n) q <= {i_d, i_c, i_b, i_a};",
    "  else q <= (dir === 1'b1) ? q + 4'd1 : (dir === 1'b0) ? q - 4'd1 : 4'bxxxx;", ...gQ, '// silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', 'assign o_co_n = ~(q[0] & q[1] & q[2] & q[3] & ~i_up);', '// silinx: ignore clock-as-data (UP and DOWN are its clocks and its direction: the chip\'s)', 'assign o_bo_n = ~(~q[0] & ~q[1] & ~q[2] & ~q[3] & ~i_down);'] },
});

// ------------------------------------------------------------------ shift registers: 74164, 74165, 74194, 74595
const R8 = { vhdl: "signal r : std_logic_vector(7 downto 0) := (others => 'X');", verilog: "reg [7:0] r = 8'hxx;" };
// 74164: serial in (A and B) on the rising edge, parallel out; CLR̅ asynchronous
const c74164 = ic('74164', '8-bit serial in, parallel out shift register', 20, [P14(1, 'A', 'in'), P14(2, 'B', 'in'), P14(3, 'QA', 'out'), P14(4, 'QB', 'out'), P14(5, 'QC', 'out'), P14(6, 'QD', 'out'),
  P14(7, 'GND', 'gnd'), P14(8, 'CLK', 'in'), P14(9, `CLR${BAR}`, 'in'), P14(10, 'QE', 'out'), P14(11, 'QF', 'out'), P14(12, 'QG', 'out'), P14(13, 'QH', 'out'), P14(14, 'VCC', 'vcc')], {
  seq: {
    init: () => ({ r: xs(8) }),
    procs: [{ sens: ['clk', 'clr_n'], run(i, p, s) { if (i.clr_n === '0') s.r = toBits(0, 8); else if (rose(i, p, 'clk')) s.r = [and2(i.a, i.b), ...s.r.slice(0, 7)]; } }],
    out: (i, s) => Object.fromEntries(QN.map((n, k) => [n, s.r[k]])),
  },
  vhdl: { decl: [R8.vhdl], body: ['process (i_clk, i_clr_n)', 'begin', "  if i_clr_n = '0' then r <= (others => '0'); elsif rising_edge(i_clk) then r <= r(6 downto 0) & (i_a and i_b); end if;",
    'end process;', ...QN.map((n, k) => `o_${n} <= r(${k});`)] },
  verilog: { decl: [R8.verilog], body: ["always @(posedge i_clk or negedge i_clr_n) if (!i_clr_n) r <= 8'd0; else r <= {r[6:0], i_a & i_b};", ...QN.map((n, k) => `assign o_${n} = r[${k}];`)] },
});

// 74165: SH/LD̅ low loads A–H (asynchronous); else it shifts (SER into QA) on the rising edge of CLK and CLK INH ORed;
// QH and QH̄ out
const c74165 = ic('74165', '8-bit parallel in, serial out shift register', 20, [P16(1, `SH/LD${BAR}`, 'in', 'shld_n'), P16(2, 'CLK', 'in'), P16(3, 'E', 'in'), P16(4, 'F', 'in'), P16(5, 'G', 'in'),
  P16(6, 'H', 'in'), P16(7, `QH${BAR}`, 'out'), P16(8, 'GND', 'gnd'), P16(9, 'QH', 'out'), P16(10, 'SER', 'in'), P16(11, 'A', 'in'), P16(12, 'B', 'in'), P16(13, 'C', 'in'), P16(14, 'D', 'in'),
  P16(15, 'CLK INH', 'in', 'inh'), P16(16, 'VCC', 'vcc')], {
  seq: {
    init: () => ({ r: xs(8) }),
    derive: (i) => ({ ck: or2(i.clk, i.inh) }),
    procs: [{ sens: ['ck', 'shld_n'], run(i, p, s) {
      if (i.shld_n === '0') s.r = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => i[n]); else if (rose(i, p, 'ck')) s.r = [i.ser, ...s.r.slice(0, 7)];
    } }],
    out: (i, s) => ({ qh: s.r[7], qh_n: nb(s.r[7]) }),
  },
  vhdl: { decl: [R8.vhdl, "signal ck : std_logic := 'X';"], body: ['ck <= i_clk or i_inh;', 'process (ck, i_shld_n)', 'begin',
    "  -- silinx: ignore sensitivity (an asynchronous load takes the inputs when it starts, as a flip-flop's in synthesis)", "  if i_shld_n = '0' then r <= i_h & i_g & i_f & i_e & i_d & i_c & i_b & i_a; elsif rising_edge(ck) then r <= r(6 downto 0) & i_ser; end if;", 'end process;', 'o_qh <= r(7);', 'o_qh_n <= not r(7);'] },
  verilog: { decl: [R8.verilog, 'wire ck = i_clk | i_inh;'], body: ['always @(posedge ck or negedge i_shld_n) if (!i_shld_n) r <= {i_h, i_g, i_f, i_e, i_d, i_c, i_b, i_a}; else r <= {r[6:0], i_ser};',
    'assign o_qh = r[7];', 'assign o_qh_n = ~r[7];'] },
});

// 74194: S1 S0 on the rising edge: 00 hold, 01 shift right (SR SER into QA), 10 shift left (SL SER into QD), 11 load;
// CLR̅ asynchronous
const c74194 = ic('74194', '4-bit bidirectional universal shift register', 20, [P16(1, `CLR${BAR}`, 'in'), P16(2, 'SR SER', 'in', 'sr'), P16(3, 'A', 'in'), P16(4, 'B', 'in'), P16(5, 'C', 'in'),
  P16(6, 'D', 'in'), P16(7, 'SL SER', 'in', 'sl'), P16(8, 'GND', 'gnd'), P16(9, 'S0', 'in'), P16(10, 'S1', 'in'), P16(11, 'CLK', 'in'), P16(12, 'QD', 'out'), P16(13, 'QC', 'out'), P16(14, 'QB', 'out'),
  P16(15, 'QA', 'out'), P16(16, 'VCC', 'vcc')], {
  seq: {
    init: () => ({ q: xs(4) }),
    procs: [{ sens: ['clk', 'clr_n'], run(i, p, s) {
      const mode = `${i.s1}${i.s0}`;
      if (i.clr_n === '0') s.q = toBits(0, 4);
      else if (rose(i, p, 'clk')) s.q = mode === '00' ? s.q : mode === '01' ? [i.sr, ...s.q.slice(0, 3)] : mode === '10' ? [...s.q.slice(1), i.sl] : mode === '11' ? dcba(i) : xs(4);
    } }],
    out: (i, s) => qOut(s.q),
  },
  vhdl: { decl: [Q4.vhdl], body: ['process (i_clk, i_clr_n)', 'begin', "  if i_clr_n = '0' then q <= \"0000\";", '  elsif rising_edge(i_clk) then',
    "    case std_logic_vector'(i_s1 & i_s0) is when \"00\" => null; when \"01\" => q <= q(2 downto 0) & i_sr; when \"10\" => q <= i_sl & q(3 downto 1); when \"11\" => q <= i_d & i_c & i_b & i_a; when others => q <= (others => 'X'); end case;",
    '  end if;', 'end process;', ...vQ] },
  verilog: { decl: [Q4.verilog], body: ['always @(posedge i_clk or negedge i_clr_n)', "  if (!i_clr_n) q <= 4'd0;",
    "  else case ({i_s1, i_s0}) 2'b00: q <= q; 2'b01: q <= {q[2:0], i_sr}; 2'b10: q <= {i_sl, q[3:1]}; 2'b11: q <= {i_d, i_c, i_b, i_a}; default: q <= 4'bxxxx; endcase", ...gQ] },
});

// 74595: its shift register (SRCLR̅ asynchronous; SER into QA on SRCLK's rising edge) and its storage register (the
// shift register's bits on RCLK's rising edge: one clock behind it when the two clocks are joined); QA–QH the storage
// register's while OE̅ is low, else Z; QH' the shift register's last bit
const c74595 = ic('74595', '8-bit shift register with output latches, 3-state', 20, [P16(1, 'QB', 'out'), P16(2, 'QC', 'out'), P16(3, 'QD', 'out'), P16(4, 'QE', 'out'), P16(5, 'QF', 'out'),
  P16(6, 'QG', 'out'), P16(7, 'QH', 'out'), P16(8, 'GND', 'gnd'), P16(9, "QH'", 'out', 'qh2'), P16(10, `SRCLR${BAR}`, 'in'), P16(11, 'SRCLK', 'in'), P16(12, 'RCLK', 'in'), P16(13, `OE${BAR}`, 'in'),
  P16(14, 'SER', 'in'), P16(15, 'QA', 'out'), P16(16, 'VCC', 'vcc')], {
  seq: {
    init: () => ({ r: xs(8), t: xs(8) }),
    // (the storage register first: it takes the shift register as it was)
    procs: [{ sens: ['rclk'], run(i, p, s) { if (rose(i, p, 'rclk')) s.t = s.r; } },
      { sens: ['srclk', 'srclr_n'], run(i, p, s) { if (i.srclr_n === '0') s.r = toBits(0, 8); else if (rose(i, p, 'srclk')) s.r = [i.ser, ...s.r.slice(0, 7)]; } }],
    out: (i, s) => ({ ...Object.fromEntries(QN.map((n, k) => [n, i.oe_n === '0' ? s.t[k] : i.oe_n === '1' ? 'Z' : 'X'])), qh2: s.r[7] }),
  },
  vhdl: { decl: [R8.vhdl, "signal t : std_logic_vector(7 downto 0) := (others => 'X');"], body: [
    'process (i_srclk, i_srclr_n)', 'begin', "  if i_srclr_n = '0' then r <= (others => '0'); elsif rising_edge(i_srclk) then r <= r(6 downto 0) & i_ser; end if;", 'end process;',
    'process (i_rclk)', 'begin', '  if rising_edge(i_rclk) then t <= r; end if;', 'end process;',
    ...QN.map((n, k) => `o_${n} <= t(${k}) when i_oe_n = '0' else 'Z' when i_oe_n = '1' else 'X';`), 'o_qh2 <= r(7);'] },
  verilog: { decl: [R8.verilog, "reg [7:0] t = 8'hxx;"], body: ["always @(posedge i_srclk or negedge i_srclr_n) if (!i_srclr_n) r <= 8'd0; else r <= {r[6:0], i_ser};", 'always @(posedge i_rclk) t <= r;',
    ...QN.map((n, k) => `assign o_${n} = (i_oe_n === 1'b0) ? t[${k}] : (i_oe_n === 1'b1) ? 1'bz : 1'bx;`), 'assign o_qh2 = r[7];'] },
});

// ------------------------------------------------------------------ 4000s: 4511, 4017
// 4511: a latch of DCBA, transparent while LE is low; LT̅ low: every segment lit; else BL̅ low: none; else the latched
// digit (above 9: blank), active high
const SEGP = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const c4511 = ic('4511', 'BCD to 7-segment latch/decoder/driver, active high', 400, [P16(1, 'B', 'in'), P16(2, 'C', 'in'), P16(3, `LT${BAR}`, 'in'), P16(4, `BL${BAR}`, 'in'), P16(5, 'LE', 'in'),
  P16(6, 'D', 'in'), P16(7, 'A', 'in'), P16(8, 'VSS', 'gnd'), P16(9, 'e', 'out', 'seg_e'), P16(10, 'd', 'out', 'seg_d'), P16(11, 'c', 'out', 'seg_c'), P16(12, 'b', 'out', 'seg_b'),
  P16(13, 'a', 'out', 'seg_a'), P16(14, 'g', 'out', 'seg_g'), P16(15, 'f', 'out', 'seg_f'), P16(16, 'VDD', 'vcc')], {
  seq: {
    init: () => ({ l: xs(4) }),
    procs: [{ sens: ['le', 'a', 'b', 'c', 'd'], run(i, p, s) { if (i.le === '0') s.l = dcba(i); } }],
    out(i, s) {
      const d = num(s.l);
      const w = i.lt_n === '0' ? 0x7f : i.lt_n !== '1' ? null : i.bl_n === '0' ? 0 : i.bl_n !== '1' || d == null ? null : d > 9 ? 0 : SEGMENTS[d];
      return Object.fromEntries(SEGP.map((n, k) => [`seg_${n}`, w == null ? 'X' : (w >> k) & 1 ? '1' : '0']));
    },
  },
  vhdl: { decl: ["signal l : std_logic_vector(3 downto 0) := (others => 'X');", "signal w : std_logic_vector(6 downto 0) := (others => 'X');"], body: [
    'process (i_le, i_a, i_b, i_c, i_d)', 'begin', '  -- silinx: ignore latch (the 4511\'s own latch)', "  if i_le = '0' then l <= i_d & i_c & i_b & i_a; end if;", 'end process;',
    'process (l, i_lt_n, i_bl_n)', 'begin', "  if i_lt_n = '0' then w <= \"1111111\"; elsif i_lt_n /= '1' then w <= (others => 'X');",
    "  elsif i_bl_n = '0' then w <= \"0000000\"; elsif i_bl_n /= '1' or anyx(l) then w <= (others => 'X');", '  else', '    case l is',
    ...SEGMENTS.slice(0, 10).map((v, n) => `      when "${n.toString(2).padStart(4, '0')}" => w <= "${v.toString(2).padStart(7, '0')}";`), '      when others => w <= "0000000";', '    end case;', '  end if;', 'end process;',
    ...SEGP.map((n, k) => `o_seg_${n} <= w(${k});`)] },
  verilog: { decl: ["reg [3:0] l = 4'bxxxx;", 'reg [6:0] w;'], body: [
    '// silinx: ignore latch (the 4511\'s own latch)', 'always @(i_le or i_a or i_b or i_c or i_d) if (i_le === 1\'b0) l = {i_d, i_c, i_b, i_a};',
    'always @(l or i_lt_n or i_bl_n)', "  if (i_lt_n === 1'b0) w = 7'h7f; else if (i_lt_n !== 1'b1) w = 7'bxxxxxxx;", "  else if (i_bl_n === 1'b0) w = 7'd0; else if (i_bl_n !== 1'b1 || ^l === 1'bx) w = 7'bxxxxxxx;",
    '  else case (l)', ...SEGMENTS.slice(0, 10).map((v, n) => `    4'd${n}: w = 7'h${v.toString(16).padStart(2, '0')};`), "    default: w = 7'd0;", '  endcase', ...SEGP.map((n, k) => `assign o_seg_${n} = w[${k}];`)] },
}, 'cmos');

// 4017: a decade counter (RST high: 0, asynchronous; CLK's rising edge while CLK INH is low: one more, 9 to 0), Q0–Q9
// decoded (one high), CO high for 0 to 4
const c4017 = ic('4017', 'Decade counter/divider with 10 decoded outputs', 300, [P16(1, 'Q5', 'out'), P16(2, 'Q1', 'out'), P16(3, 'Q0', 'out'), P16(4, 'Q2', 'out'), P16(5, 'Q6', 'out'), P16(6, 'Q7', 'out'),
  P16(7, 'Q3', 'out'), P16(8, 'VSS', 'gnd'), P16(9, 'Q8', 'out'), P16(10, 'Q4', 'out'), P16(11, 'Q9', 'out'), P16(12, 'CO', 'out'), P16(13, 'CLK INH', 'in', 'inh'), P16(14, 'CLK', 'in'),
  P16(15, 'RST', 'in'), P16(16, 'VDD', 'vcc')], {
  seq: {
    init: () => ({ n: xs(4) }),
    procs: [{ sens: ['clk', 'rst'], run(i, p, s) {
      if (i.rst === '1') s.n = toBits(0, 4);
      else if (rose(i, p, 'clk')) { if (i.inh === '0') s.n = num(s.n) == null ? xs(4) : toBits((num(s.n) + 1) % 10, 4); else if (i.inh !== '1') s.n = xs(4); }
    } }],
    out(i, s) { const n = num(s.n); return { ...Object.fromEntries([...Array(10)].map((_, k) => [`q${k}`, n == null ? 'X' : n === k ? '1' : '0'])), co: n == null ? 'X' : n < 5 ? '1' : '0' }; },
  },
  vhdl: { decl: ["signal n : std_logic_vector(3 downto 0) := (others => 'X');"], body: ['process (i_clk, i_rst)', 'begin', "  if i_rst = '1' then n <= \"0000\";", '  elsif rising_edge(i_clk) then',
    "    if i_inh = '0' then if anyx(n) then n <= (others => 'X'); elsif n = \"1001\" then n <= \"0000\"; else n <= std_logic_vector(unsigned(n) + 1); end if;", "    elsif i_inh /= '1' then n <= (others => 'X');", '    end if;',
    '  end if;', 'end process;', ...[...Array(10)].map((_, k) => `o_q${k} <= 'X' when anyx(n) else '1' when unsigned(n) = ${k} else '0';`), "o_co <= 'X' when anyx(n) else '1' when unsigned(n) < 5 else '0';"] },
  verilog: { decl: ["reg [3:0] n = 4'bxxxx;"], body: ['always @(posedge i_clk or posedge i_rst)', "  if (i_rst) n <= 4'd0;", "  else if (i_inh === 1'b0) n <= (n === 4'd9) ? 4'd0 : n + 4'd1;", "  else if (i_inh !== 1'b1) n <= 4'bxxxx;",
    ...[...Array(10)].map((_, k) => `assign o_q${k} = n == 4'd${k};`), "assign o_co = n < 4'd5;"] },
}, 'cmos');

export const SEQ = [c7474, c7476, c74112, c7490, c7493, c74161, c74163, c74191, c74193, c74164, c74165, c74194, c74595, c4511, c4017];
