// The Digital Electronic Circuit Wizard's assemblies of ICs (#4164, core/circuit-templates.js lists them after its
// breadboards and switches): each one a full breadboard and its supply (the boards assembly's) with its chips placed,
// powered and wired to its switches, buttons, clock, LEDs and display, ready to try:
//   - seg7: 4 switches bcd[k] -> a 7447 (common anode display, its segments pulled up) or a 7448 (common cathode);
//   - counter: a clock -> a 7490 (BCD: QA to CKB) or a 74161 -> a 7447 -> a common anode display; a button rst clears it;
//   - adder: switches a[k], b[k] -> a 7483 or a 74283 (C0 on GND) -> LEDs s[k] and cout;
//   - gates: a gate IC (7400, 7402, 7404, 7408, 7432, 7486), each gate's inputs on switches a[k] (b[k]), its output on an
//     LED y[k];
//   - comparator: switches a[k], b[k] -> a 7485 (its cascading inputs A=B high) -> LEDs lt, eq, gt;
//   - decoder: switches s[k] -> a 74138 (enabled) -> 8 LEDs y[k] from + to its active low outputs (the one chosen lit),
//     or a 74151 and its data switches d[k] -> LEDs y and w;
//   - shift: a button clk (pulled down), a button clr (pulled up), a switch din -> a 74164 (8 LEDs q[k]) or a 74194
//     shifting right (4 LEDs q[k]);
//   - flipflop: a 7474's first flip-flop: a button clk, switches d, pre_n and clr_n (both on: inactive) -> LEDs q and qn;
//     the second one's inputs tied.
// Each jumper goes from a free hole of a pin's strip to one of the other pin's (a rail: the one on that pin's side of
// the board, near its column). Isomorphic module.
import { partDef, partPins, BB_ROWS, BB_RAILS } from './circuit-parts.js';
import { addPart, addWire, pointOf, setPartProps } from './circuit-edit.js';

const TOP = ['a', 'b', 'c', 'd', 'e'], BOT = ['f', 'g', 'h', 'i', 'j'], COLS = 63;
const key = ([x, y]) => `${x},${y}`;

// the circuit `m` (a full breadboard BB1 and its supply) with what is placed and wired on it
function bench(m) {
  let c = m;
  const used = new Set();
  const mark = (pt) => used.add(key(pt));
  const ok = (r) => { if (r.error) throw new Error(r.error); c = r.model; return r.id; };
  for (const p of c.parts) for (const q of partPins(p)) mark([q.x, q.y]);
  for (const w of c.wires) { mark(w.points[0]); mark(w.points[w.points.length - 1]); }
  // a free hole of a point's strip (its column's top or bottom half), or of a rail near a column
  const holeOf = (pt) => {
    const r = (pt[1] < 5 ? TOP : BOT).find((x) => !used.has(key([pt[0], BB_ROWS[x]])));
    if (!r) throw new Error(`no free hole in column ${pt[0] + 1}`);
    return `${r}${pt[0] + 1}`;
  };
  const railOf = (rail, col) => {
    for (let d = 0; d < COLS; d++) for (const k of [col + d, col - d]) if (k >= 1 && k <= COLS && !used.has(key([k - 1, BB_RAILS[rail]]))) return `${rail}${k}`;
    throw new Error(`no free hole on the rail ${rail}`);
  };
  const take = (hole) => { mark(pointOf(c, `BB1.${hole}`)); return `BB1.${hole}`; };
  const b = {
    get model() { return c; },
    /** a part, its pin 1 in a hole (f10), its label and properties (a switch's `on`, a clock's `hz`); its id */
    put(type, hole, { label, ...props } = {}) {
      const id = ok(addPart(c, { type, at: `BB1.${hole}`, ...(label ? { label } : {}) }));
      if (Object.keys(props).length) ok(setPartProps(c, id, props));
      for (const q of partPins(c.parts.find((p) => p.id === id))) mark([q.x, q.y]);
      return id;
    },
    /** a jumper from a pin's strip ('U1.3') to another pin's, or to the supply ('+', '-': its rail on that side) */
    link(a, to, color = 'blue') {
      const pa = pointOf(c, a);
      const from = take(holeOf(pa));
      if (to === '+' || to === '-') {
        const top = pa[1] < 5;
        ok(addWire(c, { from, to: take(railOf(to === '+' ? (top ? 'tp' : 'bp') : (top ? 'tn' : 'bn'), pa[0] + 1)), color: to === '+' ? 'red' : 'black' }));
      } else ok(addWire(c, { from, to: take(holeOf(pointOf(c, to))), color }));
    },
    /** a pull-up or a pull-down in a pin's strip */
    pull(type, a) { return b.put(type, holeOf(pointOf(c, a))); },
    /** an IC's VCC and GND to the supply */
    power(id) { const d = partDef(c.parts.find((p) => p.id === id).type); b.link(`${id}.${d.pins.find((q) => q.dir === 'vcc').n}`, '+'); b.link(`${id}.${d.pins.find((q) => q.dir === 'gnd').n}`, '-'); },
    /** an LED in row i (its anode in column `col`, its cathode next to it, on −), driven by a pin */
    led(col, label, from) { const id = b.put('led', `i${col}`, { label }); b.link(from, `${id}.A`); b.link(`${id}.K`, '-'); return id; },
    switch: (col, label, props) => b.put('logic-switch', `a${col}`, { label, ...props }),
  };
  return b;
}

// a BCD to 7-segment decoder U (a 7447 or a 7448) from its inputs (A, B, C, D) to the display X, its lamp test and
// blanking inactive; a common anode display's segments pulled up (the 7447's outputs open collector)
const SEG_PIN = { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
function decoder(b, U, ins, X, anode) {
  b.power(U);
  [7, 1, 2, 6].forEach((n, k) => b.link(ins[k], `${U}.${n}`));
  for (const n of [3, 4, 5]) b.link(`${U}.${n}`, '+');
  for (const [s, n] of Object.entries(SEG_PIN)) {
    if (anode) b.pull('pull-up', `${U}.${n}`);
    b.link(`${U}.${n}`, `${X}.${s}`, 'green');
  }
  b.link(`${X}.3`, anode ? '+' : '-');
}
// a button from + (pulled down: a 1 while pressed) or from − (pulled up: a 0 while pressed), in row a from `col`; its
// pin 2 the signal
function button(b, col, label, high) {
  const id = b.put('button', `a${col}`, { label });
  b.link(`${id}.1`, high ? '+' : '-');
  b.pull(high ? 'pull-down' : 'pull-up', `${id}.2`);
  return `${id}.2`;
}

function seg7(b, { display }) {
  const ca = display !== 'cc';
  const sw = [0, 1, 2, 3].map((k) => `${b.switch(2 + 2 * k, `bcd[${k}]`)}.out`);
  const U = b.put(ca ? '7447' : '7448', 'f12');
  decoder(b, U, sw, b.put(ca ? 'seg7-ca' : 'seg7-cc', 'i26', { label: 'seg' }), ca);
}

function counter(b, { chip, hz }) {
  const ck = `${b.put('clock', 'a2', { label: 'clk', hz: Number(hz) })}.out`;
  const decade = chip !== '74161';
  const rst = button(b, 5, 'rst', decade);
  const U = b.put(decade ? '7490' : '74161', 'f11');
  b.power(U);
  if (decade) {
    // CKA the clock, QA to CKB (a BCD count), R0(1) and R0(2) the reset, R9's on −
    b.link(ck, `${U}.14`, 'yellow'); b.link(`${U}.12`, `${U}.1`);
    b.link(rst, `${U}.2`); b.link(rst, `${U}.3`);
    for (const n of [6, 7]) b.link(`${U}.${n}`, '-');
  } else {
    // counting (ENP, ENT, LOAD̅ high), its data inputs on −, CLR̅ the reset
    b.link(ck, `${U}.2`, 'yellow'); b.link(rst, `${U}.1`);
    for (const n of [7, 9, 10]) b.link(`${U}.${n}`, '+');
    for (const n of [3, 4, 5, 6]) b.link(`${U}.${n}`, '-');
  }
  decoder(b, b.put('7447', 'f22'), (decade ? [12, 9, 8, 11] : [14, 13, 12, 11]).map((n) => `${U}.${n}`), b.put('seg7-ca', 'i34', { label: 'seg' }), true);
}

// the adders' pins: A1–A4, B1–B4, C0, Σ1–Σ4, C4
const ADDER = { 7483: { a: [10, 8, 3, 1], b: [11, 7, 4, 16], c0: 13, s: [9, 6, 2, 15], c4: 14 }, 74283: { a: [5, 3, 14, 12], b: [6, 2, 15, 11], c0: 7, s: [4, 1, 13, 10], c4: 9 } };
function adder(b, { chip }) {
  const P = ADDER[chip] || ADDER[7483];
  const A = [0, 1, 2, 3].map((k) => `${b.switch(2 + 2 * k, `a[${k}]`)}.out`), B = [0, 1, 2, 3].map((k) => `${b.switch(10 + 2 * k, `b[${k}]`)}.out`);
  const U = b.put(ADDER[chip] ? chip : '7483', 'f20');
  b.power(U);
  for (let k = 0; k < 4; k++) { b.link(A[k], `${U}.${P.a[k]}`); b.link(B[k], `${U}.${P.b[k]}`); }
  b.link(`${U}.${P.c0}`, '-');
  P.s.forEach((n, k) => b.led(30 + 3 * k, `s[${k}]`, `${U}.${n}`));
  b.led(42, 'cout', `${U}.${P.c4}`);
}

const GATE_ICS = ['7400', '7402', '7404', '7408', '7432', '7486'];
function gates(b, { chip }) {
  const type = GATE_ICS.includes(String(chip)) ? String(chip) : '7400';
  const U = b.put(type, 'f26');
  b.power(U);
  let k = 0;
  partDef(type).gates.forEach((g, i) => {
    g.ins.forEach((n, j) => b.link(`${b.switch(2 + 2 * k++, `${'ab'[j]}[${i}]`)}.out`, `${U}.${n}`));
    b.led(36 + 3 * i, `y[${i}]`, `${U}.${g.out}`);
  });
}

function comparator(b) {
  const A = [0, 1, 2, 3].map((k) => `${b.switch(2 + 2 * k, `a[${k}]`)}.out`), B = [0, 1, 2, 3].map((k) => `${b.switch(10 + 2 * k, `b[${k}]`)}.out`);
  const U = b.put('7485', 'f20');
  b.power(U);
  [10, 12, 13, 15].forEach((n, k) => b.link(A[k], `${U}.${n}`));
  [9, 11, 14, 1].forEach((n, k) => b.link(B[k], `${U}.${n}`));
  // the cascading inputs of a single 7485: A=B in high, A<B in and A>B in low
  b.link(`${U}.3`, '+'); b.link(`${U}.2`, '-'); b.link(`${U}.4`, '-');
  b.led(30, 'lt', `${U}.7`); b.led(33, 'eq', `${U}.6`); b.led(36, 'gt', `${U}.5`);
}

function decoderOrMux(b, { chip }) {
  const S = [0, 1, 2].map((k) => `${b.switch(2 + 2 * k, `s[${k}]`)}.out`);
  if (chip === '74151') {
    const D = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `${b.switch(8 + 2 * k, `d[${k}]`)}.out`);
    const U = b.put('74151', 'f28');
    b.power(U);
    [11, 10, 9].forEach((n, k) => b.link(S[k], `${U}.${n}`));
    [4, 3, 2, 1, 15, 14, 13, 12].forEach((n, k) => b.link(D[k], `${U}.${n}`));
    b.link(`${U}.7`, '-');   // (G̅: enabled)
    b.led(40, 'y', `${U}.5`); b.led(43, 'w', `${U}.6`);
    return;
  }
  const U = b.put('74138', 'f12');
  b.power(U);
  [1, 2, 3].forEach((n, k) => b.link(S[k], `${U}.${n}`));
  b.link(`${U}.4`, '-'); b.link(`${U}.5`, '-'); b.link(`${U}.6`, '+');   // (enabled: G2A̅, G2B̅ low, G1 high)
  // each LED from + to an active low output: the one chosen lit
  [15, 14, 13, 12, 11, 10, 9, 7].forEach((n, k) => {
    const id = b.put('led', `i${24 + 3 * k}`, { label: `y[${k}]` });
    b.link(`${id}.A`, '+'); b.link(`${id}.K`, `${U}.${n}`);
  });
}

function shift(b, { chip }) {
  const clk = button(b, 2, 'clk', true), clr = button(b, 8, 'clr', false);
  const din = `${b.switch(14, 'din')}.out`;
  if (chip === '74194') {
    const U = b.put('74194', 'f20');
    b.power(U);
    b.link(clk, `${U}.11`, 'yellow'); b.link(clr, `${U}.1`); b.link(din, `${U}.2`);
    // shifting right (S0 high, S1 low): SR SER into QA; the parallel and the left inputs on −
    b.link(`${U}.9`, '+');
    for (const n of [10, 3, 4, 5, 6, 7]) b.link(`${U}.${n}`, '-');
    [15, 14, 13, 12].forEach((n, k) => b.led(30 + 3 * k, `q[${k}]`, `${U}.${n}`));
    return;
  }
  const U = b.put('74164', 'f20');
  b.power(U);
  b.link(clk, `${U}.8`, 'yellow'); b.link(clr, `${U}.9`); b.link(din, `${U}.1`); b.link(`${U}.2`, '+');   // (B high: A the data)
  [3, 4, 5, 6, 10, 11, 12, 13].forEach((n, k) => b.led(30 + 3 * k, `q[${k}]`, `${U}.${n}`));
}

function flipflop(b) {
  const clk = button(b, 2, 'clk', true);
  const d = `${b.switch(8, 'd')}.out`, pre = `${b.switch(10, 'pre_n', { on: true })}.out`, clr = `${b.switch(12, 'clr_n', { on: true })}.out`;
  const U = b.put('7474', 'f16');
  b.power(U);
  b.link(clk, `${U}.3`, 'yellow'); b.link(d, `${U}.2`); b.link(pre, `${U}.4`); b.link(clr, `${U}.1`);
  // the second flip-flop unused, its inputs tied: PRE̅ and CLR̅ high, D and CLK low
  b.link(`${U}.10`, '+'); b.link(`${U}.13`, '+'); b.link(`${U}.12`, '-'); b.link(`${U}.11`, '-');
  b.led(26, 'q', `${U}.5`); b.led(29, 'qn', `${U}.6`);
}

const N = (key, label, def, min, max) => ({ key, label, def, min, max });
const O = (key, label, def, options) => ({ key, label, def, options });
const at = (f) => (m, params) => { const b = bench(m); f(b, params); return b.model; };
/** The assemblies: the template page's entries ({ id, label, text, params }) and each one's `build(m, params)`. */
export const ASSEMBLIES = [
  { id: 'seg7', label: '7-segment display', text: 'Four switches bcd[0]…bcd[3] into a BCD to 7-segment decoder and its display: a 7447 and a common anode display (its segments pulled up), or a 7448 and a common cathode one.',
    params: [O('display', 'Display:', 'ca', [['ca', 'Common anode (7447)'], ['cc', 'Common cathode (7448)']])], build: at(seg7) },
  { id: 'counter', label: 'Counter with display', text: 'A clock into a counter, its count on a 7447 and a common anode display: a 7490 (counting 0 to 9, QA into CKB) or a 74161 (0 to 15). Press rst first: it clears the count.',
    params: [O('chip', 'Counter:', '7490', [['7490', '7490 (decade)'], ['74161', '74161 (4-bit binary)']]), N('hz', 'Clock (Hz):', 1, 1, 50)], build: at(counter) },
  { id: 'adder', label: '4-bit adder', text: 'Eight switches a[0]…a[3] and b[0]…b[3] into a 4-bit adder (its carry in on −), its sum on the LEDs s[0]…s[3] and its carry out on cout.',
    params: [O('chip', 'Adder:', '7483', [['7483', '7483'], ['74283', '74283']])], build: at(adder) },
  { id: 'gates', label: 'Gate test bench', text: 'A gate IC on the board, powered: each gate\'s inputs on switches a[k] (and b[k]), its output on an LED y[k].',
    params: [O('chip', 'Gate IC:', '7400', [['7400', '7400 (NAND)'], ['7402', '7402 (NOR)'], ['7404', '7404 (NOT)'], ['7408', '7408 (AND)'], ['7432', '7432 (OR)'], ['7486', '7486 (XOR)']])], build: at(gates) },
  { id: 'comparator', label: 'Comparator', text: 'Eight switches a[0]…a[3] and b[0]…b[3] into a 7485 (its cascading inputs: A=B high), the LEDs lt, eq and gt its outputs A<B, A=B and A>B.', build: at(comparator) },
  { id: 'decoder', label: 'Decoder or multiplexer', text: 'Three switches s[0]…s[2] into a 74138, enabled, its outputs active low on 8 LEDs from + (the one chosen lit); or into a 74151, its data inputs on the switches d[0]…d[7], its outputs Y and W on the LEDs y and w.',
    params: [O('chip', 'IC:', '74138', [['74138', '74138 (3 to 8 decoder)'], ['74151', '74151 (8 to 1 multiplexer)']])], build: at(decoderOrMux) },
  { id: 'shift', label: 'Shift register', text: 'A button clk as a manual clock, a button clr that clears it and a data switch din into a 74164 (8 LEDs q[0]…q[7]) or a 74194 shifting right (4 LEDs q[0]…q[3]).',
    params: [O('chip', 'Register:', '74164', [['74164', '74164 (8-bit)'], ['74194', '74194 (4-bit universal)']])], build: at(shift) },
  { id: 'flipflop', label: 'Flip-flops', text: 'A 7474\'s first D flip-flop: a button clk, switches on d, pre_n and clr_n (both on: inactive), LEDs on q and qn; its second flip-flop\'s inputs tied.', build: at(flipflop) },
];
