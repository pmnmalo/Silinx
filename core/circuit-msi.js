// The MSI ICs of a digital circuit (#3900, docs/CIRCUITS.md): BCD to 7-segment decoders (7447, open collector and active
// low; 7448), decoders (74138, 74139), multiplexers (74151, 74153, 74157), adders (7483, 74283) and a comparator (7485).
// Each has its datasheet's pinout (its active low pins' names barred, their ports <name>_n), its typical delay, its
// model (`model(i)`: its outputs, 0 or 1, from its inputs, 0 or 1, by port) and its HDL bodies (`vhdl`, `verilog`): what
// the wrapper of core/circuit-hdl-ics.js writes between reading its inputs (i_<port>: '0' or '1' once none is X) and
// driving its outputs (o_<port>) after its delay. An input X makes every output X. Isomorphic module.
import { dip } from './circuit-ics.js';

const BAR = '̅';   // (a combining overline: an active low pin's name, as its datasheet's)
const DIP16 = dip(16);
// a pin: n, its datasheet's name, in / out / oc / vcc / gnd, its port (default: its name in lower case)
const P = (n, name, dir, port) => ({ n, name, dir, ...DIP16(n), port: port ?? name.replace(BAR, '_n').toLowerCase() });
const ttl = (type, title, tpd, pins, rest) => ({ type, title, kind: 'ic', family: 'ttl', chip: `SN74LS${type.slice(2)}`, tpd, dip: 16, pins, ...rest });
const bits = (i, names) => names.reduce((v, n, k) => v | (i[n] << k), 0);   // (names: the least significant first)
const vec = (names, V) => (V ? names.slice().reverse().map((n) => `i_${n}`).join(' & ') : `{${names.slice().reverse().map((n) => `i_${n}`).join(', ')}}`);

// ------------------------------------------------------------------ BCD to 7 segments
// the segments a–g of 0 to 15 (no tails on 6 and 9, as the 7447's, the 7448's and the 4511's), a the least significant
const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7c, 0x07, 0x7f, 0x67, 0x58, 0x4c, 0x62, 0x69, 0x78, 0x00];
const SEGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
function bcd7(type, title, low) {
  const out = low ? 'oc' : 'out';
  const pins = [P(1, 'B', 'in'), P(2, 'C', 'in'), P(3, `LT${BAR}`, 'in'), P(4, `BI${BAR}`, 'in'), P(5, `RBI${BAR}`, 'in'), P(6, 'D', 'in'), P(7, 'A', 'in'), P(8, 'GND', 'gnd'),
    P(9, 'e', out, 'seg_e'), P(10, 'd', out, 'seg_d'), P(11, 'c', out, 'seg_c'), P(12, 'b', out, 'seg_b'), P(13, 'a', out, 'seg_a'), P(14, 'g', out, 'seg_g'), P(15, 'f', out, 'seg_f'), P(16, 'VCC', 'vcc')];
  const v = (V) => {
    const sel = vec(['a', 'b', 'c', 'd'], V), on = low ? 0 : 1;
    const put = (word) => SEGS.map((s, k) => (V ? `o_seg_${s} <= '${((word >> k) & 1) ^ (1 - on)}';` : `o_seg_${s} = 1'b${((word >> k) & 1) ^ (1 - on)};`)).join(' ');
    return V ? [`if i_bi_n = '0' then ${put(0)}`, `elsif i_lt_n = '0' then ${put(0x7f)}`, `elsif i_rbi_n = '0' and std_logic_vector'(${sel}) = "0000" then ${put(0)}`, 'else',
      `  case std_logic_vector'(${sel}) is`, ...SEG.map((w, n) => `    when "${n.toString(2).padStart(4, '0')}" => ${put(w)}`), `    when others => ${put(0)}`, '  end case;', 'end if;']
      : ['if (!i_bi_n) begin ' + put(0) + ' end', `else if (!i_lt_n) begin ${put(0x7f)} end`, `else if (!i_rbi_n && ${sel} == 4'd0) begin ${put(0)} end`, `else case (${sel})`,
        ...SEG.map((w, n) => `  4'd${n}: begin ${put(w)} end`), 'endcase'];
  };
  return ttl(type, title, 50, pins, { model(i) {
    const d = bits(i, ['a', 'b', 'c', 'd']);
    const w = !i.bi_n ? 0 : !i.lt_n ? 0x7f : !i.rbi_n && d === 0 ? 0 : SEG[d];
    return Object.fromEntries(SEGS.map((s, k) => [`seg_${s}`, ((w >> k) & 1) ^ (low ? 1 : 0)]));
  }, vhdl: v(true), verilog: v(false) });
}

// ------------------------------------------------------------------ decoders
const c74138 = ttl('74138', '3-to-8 line decoder', 22, [P(1, 'A', 'in'), P(2, 'B', 'in'), P(3, 'C', 'in'), P(4, `G2A${BAR}`, 'in'), P(5, `G2B${BAR}`, 'in'), P(6, 'G1', 'in'),
  P(7, `Y7${BAR}`, 'out'), P(8, 'GND', 'gnd'), ...[6, 5, 4, 3, 2, 1, 0].map((k, j) => P(9 + j, `Y${k}${BAR}`, 'out')), P(16, 'VCC', 'vcc')], {
  model(i) { const on = i.g1 && !i.g2a_n && !i.g2b_n, n = bits(i, ['a', 'b', 'c']); return Object.fromEntries([...Array(8)].map((_, k) => [`y${k}_n`, on && n === k ? 0 : 1])); },
  vhdl: [...Array(8)].map((_, k) => `if i_g1 = '1' and i_g2a_n = '0' and i_g2b_n = '0' and std_logic_vector'(${vec(['a', 'b', 'c'], true)}) = "${k.toString(2).padStart(3, '0')}" then o_y${k}_n <= '0'; else o_y${k}_n <= '1'; end if;`),
  verilog: [...Array(8)].map((_, k) => `o_y${k}_n = !(i_g1 && !i_g2a_n && !i_g2b_n && ${vec(['a', 'b', 'c'], false)} == 3'd${k});`),
});
const c74139 = ttl('74139', 'Dual 2-to-4 line decoder', 22, [P(1, `1G${BAR}`, 'in'), P(2, '1A', 'in', 'a1'), P(3, '1B', 'in', 'b1'), ...[0, 1, 2, 3].map((k) => P(4 + k, `1Y${k}${BAR}`, 'out', `y${k}1_n`)), P(8, 'GND', 'gnd'),
  ...[3, 2, 1, 0].map((k, j) => P(9 + j, `2Y${k}${BAR}`, 'out', `y${k}2_n`)), P(13, '2B', 'in', 'b2'), P(14, '2A', 'in', 'a2'), P(15, `2G${BAR}`, 'in'), P(16, 'VCC', 'vcc')].map((p) => (/^[12]G/.test(p.name) ? { ...p, port: `g${p.name[0]}_n` } : p)), {
  model(i) {
    const o = {};
    for (const s of [1, 2]) { const n = i[`a${s}`] | (i[`b${s}`] << 1); for (let k = 0; k < 4; k++) o[`y${k}${s}_n`] = !i[`g${s}_n`] && n === k ? 0 : 1; }
    return o;
  },
  vhdl: [1, 2].flatMap((s) => [0, 1, 2, 3].map((k) => `if i_g${s}_n = '0' and std_logic_vector'(i_b${s} & i_a${s}) = "${k.toString(2).padStart(2, '0')}" then o_y${k}${s}_n <= '0'; else o_y${k}${s}_n <= '1'; end if;`)),
  verilog: [1, 2].flatMap((s) => [0, 1, 2, 3].map((k) => `o_y${k}${s}_n = !(!i_g${s}_n && {i_b${s}, i_a${s}} == 2'd${k});`)),
});

// ------------------------------------------------------------------ multiplexers
const c74151 = ttl('74151', '8-to-1 line multiplexer', 20, [P(1, 'D3', 'in'), P(2, 'D2', 'in'), P(3, 'D1', 'in'), P(4, 'D0', 'in'), P(5, 'Y', 'out'), P(6, 'W', 'out'), P(7, `G${BAR}`, 'in'), P(8, 'GND', 'gnd'),
  P(9, 'C', 'in'), P(10, 'B', 'in'), P(11, 'A', 'in'), P(12, 'D7', 'in'), P(13, 'D6', 'in'), P(14, 'D5', 'in'), P(15, 'D4', 'in'), P(16, 'VCC', 'vcc')], {
  model(i) { const y = i.g_n ? 0 : i[`d${bits(i, ['a', 'b', 'c'])}`]; return { y, w: 1 - y }; },
  vhdl: ['if i_g_n = \'1\' then o_y <= \'0\'; o_w <= \'1\';', 'else', `  case std_logic_vector'(${vec(['a', 'b', 'c'], true)}) is`,
    ...[...Array(8)].map((_, k) => `    when "${k.toString(2).padStart(3, '0')}" => o_y <= i_d${k}; o_w <= not i_d${k};`), '    when others => o_y <= \'X\'; o_w <= \'X\';', '  end case;', 'end if;'],
  verilog: [`o_y = !i_g_n && ((${'{' + [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `i_d${k}`).join(', ') + '}'} >> ${vec(['a', 'b', 'c'], false)}) & 8'd1);`, 'o_w = !o_y;'],
});
const c74153 = ttl('74153', 'Dual 4-to-1 line multiplexer', 18, [P(1, `1G${BAR}`, 'in', 'g1_n'), P(2, 'B', 'in'), ...[3, 2, 1, 0].map((k, j) => P(3 + j, `1C${k}`, 'in', `c${k}1`)), P(7, '1Y', 'out', 'y1'), P(8, 'GND', 'gnd'),
  P(9, '2Y', 'out', 'y2'), ...[0, 1, 2, 3].map((k) => P(10 + k, `2C${k}`, 'in', `c${k}2`)), P(14, 'A', 'in'), P(15, `2G${BAR}`, 'in', 'g2_n'), P(16, 'VCC', 'vcc')], {
  model(i) { const n = bits(i, ['a', 'b']); return { y1: i.g1_n ? 0 : i[`c${n}1`], y2: i.g2_n ? 0 : i[`c${n}2`] }; },
  vhdl: [1, 2].flatMap((s) => [`if i_g${s}_n = '1' then o_y${s} <= '0';`, ...[0, 1, 2, 3].map((k) => `elsif std_logic_vector'(i_b & i_a) = "${k.toString(2).padStart(2, '0')}" then o_y${s} <= i_c${k}${s};`), `else o_y${s} <= 'X';`, 'end if;']),
  verilog: [1, 2].map((s) => `o_y${s} = !i_g${s}_n && (({i_c3${s}, i_c2${s}, i_c1${s}, i_c0${s}} >> {i_b, i_a}) & 4'd1);`),
});
const c74157 = ttl('74157', 'Quad 2-to-1 line multiplexer', 12, [P(1, 'S', 'in'), P(2, '1A', 'in', 'a1'), P(3, '1B', 'in', 'b1'), P(4, '1Y', 'out', 'y1'), P(5, '2A', 'in', 'a2'), P(6, '2B', 'in', 'b2'), P(7, '2Y', 'out', 'y2'),
  P(8, 'GND', 'gnd'), P(9, '3Y', 'out', 'y3'), P(10, '3B', 'in', 'b3'), P(11, '3A', 'in', 'a3'), P(12, '4Y', 'out', 'y4'), P(13, '4B', 'in', 'b4'), P(14, '4A', 'in', 'a4'), P(15, `G${BAR}`, 'in'), P(16, 'VCC', 'vcc')], {
  model(i) { return Object.fromEntries([1, 2, 3, 4].map((k) => [`y${k}`, i.g_n ? 0 : i.s ? i[`b${k}`] : i[`a${k}`]])); },
  vhdl: [1, 2, 3, 4].map((k) => `if i_g_n = '1' then o_y${k} <= '0'; elsif i_s = '1' then o_y${k} <= i_b${k}; else o_y${k} <= i_a${k}; end if;`),
  verilog: [1, 2, 3, 4].map((k) => `o_y${k} = !i_g_n && (i_s ? i_b${k} : i_a${k});`),
});

// ------------------------------------------------------------------ adders, comparator
const SUM = 'Σ';
function adder(type, pins) {
  const A = ['a1', 'a2', 'a3', 'a4'], B = ['b1', 'b2', 'b3', 'b4'];
  return ttl(type, '4-bit binary full adder', 24, pins, {
    model(i) { const s = bits(i, A) + bits(i, B) + i.c0; return { s1: s & 1, s2: (s >> 1) & 1, s3: (s >> 2) & 1, s4: (s >> 3) & 1, c4: (s >> 4) & 1 }; },
    vhdl: [`sum := ('0' & unsigned'(${vec(A, true)})) + ('0' & unsigned'(${vec(B, true)})) + unsigned'("0000" & i_c0);`, 'o_s1 <= sum(0); o_s2 <= sum(1); o_s3 <= sum(2); o_s4 <= sum(3); o_c4 <= sum(4);'],
    verilog: [`{o_c4, o_s4, o_s3, o_s2, o_s1} = ${vec(A, false)} + ${vec(B, false)} + i_c0;`],
    vars: { vhdl: ['variable sum : unsigned(4 downto 0);'] },
  });
}
const sp = (n, k) => P(n, `${SUM}${k}`, 'out', `s${k}`);
const c7483 = adder('7483', [P(1, 'A4', 'in'), sp(2, 3), P(3, 'A3', 'in'), P(4, 'B3', 'in'), P(5, 'VCC', 'vcc'), sp(6, 2), P(7, 'B2', 'in'), P(8, 'A2', 'in'),
  sp(9, 1), P(10, 'A1', 'in'), P(11, 'B1', 'in'), P(12, 'GND', 'gnd'), P(13, 'C0', 'in'), P(14, 'C4', 'out'), sp(15, 4), P(16, 'B4', 'in')]);
const c74283 = adder('74283', [sp(1, 2), P(2, 'B2', 'in'), P(3, 'A2', 'in'), sp(4, 1), P(5, 'A1', 'in'), P(6, 'B1', 'in'), P(7, 'C0', 'in'), P(8, 'GND', 'gnd'),
  P(9, 'C4', 'out'), sp(10, 4), P(11, 'B4', 'in'), P(12, 'A4', 'in'), sp(13, 3), P(14, 'A3', 'in'), P(15, 'B3', 'in'), P(16, 'VCC', 'vcc')]);
const c7485 = ttl('7485', '4-bit magnitude comparator', 24, [P(1, 'B3', 'in'), P(2, 'A<B in', 'in', 'ilt'), P(3, 'A=B in', 'in', 'ieq'), P(4, 'A>B in', 'in', 'igt'), P(5, 'A>B out', 'out', 'ogt'),
  P(6, 'A=B out', 'out', 'oeq'), P(7, 'A<B out', 'out', 'olt'), P(8, 'GND', 'gnd'), P(9, 'B0', 'in'), P(10, 'A0', 'in'), P(11, 'B1', 'in'), P(12, 'A1', 'in'), P(13, 'A2', 'in'), P(14, 'B2', 'in'),
  P(15, 'A3', 'in'), P(16, 'VCC', 'vcc')], {
  // (A = B: the cascading inputs decide, as the 74LS85's function table: A=B in high gives A=B out, else A>B out is
  // not A<B in and A<B out not A>B in)
  model(i) {
    const a = bits(i, ['a0', 'a1', 'a2', 'a3']), b = bits(i, ['b0', 'b1', 'b2', 'b3']);
    if (a !== b) return { ogt: a > b ? 1 : 0, olt: a < b ? 1 : 0, oeq: 0 };
    return i.ieq ? { ogt: 0, olt: 0, oeq: 1 } : { ogt: 1 - i.ilt, olt: 1 - i.igt, oeq: 0 };
  },
  vhdl: ['a := unsigned\'(i_a3 & i_a2 & i_a1 & i_a0); b := unsigned\'(i_b3 & i_b2 & i_b1 & i_b0);',
    'if a > b then o_ogt <= \'1\'; o_olt <= \'0\'; o_oeq <= \'0\';', 'elsif a < b then o_ogt <= \'0\'; o_olt <= \'1\'; o_oeq <= \'0\';',
    'elsif i_ieq = \'1\' then o_ogt <= \'0\'; o_olt <= \'0\'; o_oeq <= \'1\';', 'else o_ogt <= not i_ilt; o_olt <= not i_igt; o_oeq <= \'0\';', 'end if;'],
  verilog: ['if ({i_a3, i_a2, i_a1, i_a0} != {i_b3, i_b2, i_b1, i_b0}) begin o_ogt = {i_a3, i_a2, i_a1, i_a0} > {i_b3, i_b2, i_b1, i_b0}; o_olt = !o_ogt; o_oeq = 1\'b0; end',
    'else if (i_ieq) begin o_ogt = 1\'b0; o_olt = 1\'b0; o_oeq = 1\'b1; end', 'else begin o_ogt = !i_ilt; o_olt = !i_igt; o_oeq = 1\'b0; end'],
  vars: { vhdl: ['variable a, b : unsigned(3 downto 0);'] },
});

export const MSI = [bcd7('7447', 'BCD to 7-segment decoder/driver, open collector, active low', true), bcd7('7448', 'BCD to 7-segment decoder/driver, active high', false),
  c74138, c74139, c74151, c74153, c74157, c7483, c74283, c7485];
