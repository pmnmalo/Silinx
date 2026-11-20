// The sequence detector from a regular expression (#4902, core/regex-automata.js, core/seq-detector.js): the
// expressions' automata against JavaScript's own RegExp on every bit string up to 10 bits, overlapping or not, Moore and
// Mealy; the machines minimal (every two states told apart); a bit string giving the diagram it always gave (the
// detector of #2149, kept here as the reference); the errors; the HDL of a few detectors compiled, elaborated with no
// warnings and simulated in VHDL and Verilog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRegex, thompson, subsetDfa, minimize, languageOf, RegexError } from '../core/regex-automata.js';
import { detectorMachine, detectorTemplate, patternError } from '../core/seq-detector.js';
import { fsmTemplate, templateError } from '../core/chart-templates.js';
import { fsmFromSpec } from '../core/chart-wizard.js';
import { validateFsm, simulateFsm } from '../core/fsm.js';
import { generateFsm } from '../core/fsm-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { runHdl, runModel } from './fsm-sim.js';

const REGEXES = ['1', '0', '1011', '1(01)*1', '10+1', '1[01]1', '(110|101)', '110|101', '1.1', '0[1]?0', '(10)+', '1{3}', '1{2,4}0',
  '(0|1)*11', '0{2,}1', '1(0|11)*0', '[01]1[0]', '(1|0)(1|0)0', '(1[01]|0)1', '01*0', '1|00', '((10)?1)+0'];
const MODES = ['moore', 'mealy'].flatMap((type) => [true, false].map((overlap) => ({ type, overlap })));
const allBits = (n) => Array.from({ length: 1 << n }, (_, v) => v.toString(2).padStart(n, '0'));

// the reference: z after each bit, from JavaScript's RegExp: some suffix of the bits read matches (not overlapping:
// of the bits read since the last match)
function reference(re, bits, overlap) {
  const tail = new RegExp(`(?:${re})$`);
  let from = 0;
  return [...bits].map((_, t) => {
    const hit = tail.test(bits.slice(from, t + 1));
    if (hit && !overlap) from = t + 1;
    return hit ? 1 : 0;
  });
}
// a detector's machine run: z after each bit (Moore: of the state reached; Mealy: on the move)
function runMachine(m, type, bits) {
  let q = m.start;
  return [...bits].map((c) => {
    const b = +c, z = type === 'mealy' ? m.out[q][b] : m.out[m.next[q][b]];
    q = m.next[q][b];
    return z;
  });
}

test('#4902 every regular expression\'s detector, overlapping or not, Moore and Mealy, against RegExp on every bit string up to 10 bits', () => {
  const strings = allBits(10);   // (each one's prefixes: every shorter string too)
  for (const re of REGEXES) {
    for (const { type, overlap } of MODES) {
      const m = detectorMachine(re, overlap, type);
      for (const bits of strings) assert.deepEqual(runMachine(m, type, bits), reference(re, bits, overlap), `${re} ${type} overlap ${overlap} ${bits}`);
    }
  }
});

test('#4902 the expressions\' NFA and DFA recognise RegExp\'s language (a whole match) on every bit string up to 9 bits', () => {
  for (const re of [...REGEXES, '1*', '(0|1)*', '1?', '1[]', '1|[]']) {
    const nfa = thompson(parseRegex(re));
    const dfa = subsetDfa(nfa);
    const whole = new RegExp(`^(?:${re})$`);
    for (let n = 0; n <= 9; n++) {
      for (const bits of n ? allBits(n) : ['']) {
        let q = dfa.start;
        for (const c of bits) q = dfa.next[q][+c];
        assert.equal(dfa.accept[q], whole.test(bits), `${re} ${JSON.stringify(bits)}`);
      }
    }
    const some = Array.from({ length: 9 }, (_, k) => allBits(k + 1)).flat().some((s) => whole.test(s));
    assert.deepEqual(languageOf(nfa), { empty: !some && !whole.test(''), nullable: whole.test('') }, re);
  }
});

test('#4902 the detectors are minimal: every two states told apart by some bit string', () => {
  for (const re of REGEXES) {
    for (const { type, overlap } of MODES) {
      const m = detectorMachine(re, overlap, type);
      const n = m.next.length;
      // the outputs of the strings up to n bits from a state (Moore: its own output first)
      const trace = (q) => [type === 'moore' ? m.out[q] : '', ...Array.from({ length: n }, (_, k) => allBits(k + 1)).flat().map((s) => runMachine({ ...m, start: q }, type, s).join(''))].join(',');
      const traces = m.next.map((_, q) => trace(q));
      assert.equal(new Set(traces).size, n, `${re} ${type} overlap ${overlap}`);
    }
  }
  // 10+1 overlapping: Moore S0, S1 (a 1), S2 (1 then 0s), S3 (a match: on 0 as S1 on 0, on 1 as S1); Mealy S0, S1, S2
  assert.deepEqual(detectorMachine('10+1', true, 'moore'), { next: [[0, 1], [2, 1], [2, 3], [2, 1]], out: [0, 0, 0, 1], start: 0 });
  assert.deepEqual(detectorMachine('10+1', true, 'mealy'), { next: [[0, 1], [2, 1], [2, 1]], out: [[0, 0], [0, 0], [0, 1]], start: 0 });
  // 1(01)*1 searched in the bits: every match ends with 11, so its detector is that of 11 (three states, Moore)
  assert.deepEqual(detectorMachine('1(01)*1', true, 'moore'), detectorMachine('11', true, 'moore'));
  assert.deepEqual(detectorMachine('1(01)*1', false, 'mealy'), detectorMachine('11', false, 'mealy'));
});

// the detector of a bit string as #2149 made it (the reference: a bit string gives the same diagram)
function bitsDetector(p, overlap, type) {
  const k = p.length;
  const prefixIn = (s, max) => { for (let j = Math.min(max, s.length); j > 0; j--) if (s.endsWith(p.slice(0, j))) return j; return 0; };
  const after = (i, b) => (i === k ? (overlap ? prefixIn(p.slice(1) + b, k) : prefixIn(b, k)) : prefixIn(p.slice(0, i) + b, k));
  const count = type === 'moore' ? k + 1 : k;
  const st = Array.from({ length: count }, (_, i) => `S${i}`);
  const transitions = [];
  for (let i = 0; i < count; i++) {
    for (const b of ['1', '0']) {
      let j = after(i, b), outputs;
      if (type === 'mealy' && j === k) { outputs = { z: '1' }; j = overlap ? prefixIn(p.slice(1), k - 1) : 0; }
      transitions.push({ from: st[i], to: st[j], cond: b === '1' ? 'x' : '!x', ...(outputs ? { outputs } : {}) });
    }
  }
  return { type, ports: [{ name: 'x', dir: 'in', width: 1 }, { name: 'z', dir: 'out', width: 1 }], states: st, outputs: type === 'moore' ? { [st[k]]: { z: '1' } } : {}, transitions, layout: 'circle' };
}

test('#4902 a bit string, as a regular expression, gives the diagram #2149 gave: every pattern up to 9 bits, overlapping or not, Moore and Mealy', () => {
  let n = 0;
  for (let k = 1; k <= 9; k++) {
    for (const p of allBits(k)) {
      for (const { type, overlap } of MODES) {
        assert.deepEqual(detectorTemplate(p, overlap, type), bitsDetector(p, overlap, type), `${p} ${type} overlap ${overlap}`);
        n++;
      }
    }
  }
  assert.equal(n, 4088);
  // (and through the wizard's template, the parameters as typed)
  assert.deepEqual(fsmTemplate('detector', { pattern: ' 1011 ', overlap: 'no', type: 'mealy' }), bitsDetector('1011', false, 'mealy'));
});

test('#4902 the patterns refused, with their messages', () => {
  const E = (re, overlap = 'yes', type = 'moore') => templateError('fsm', 'detector', { pattern: re, overlap, type });
  const cases = [
    ['', 'Pattern: a bit string (1011) or a regular expression over 0 and 1 (1(01)*1).'],
    ['   ', 'Pattern: a bit string (1011) or a regular expression over 0 and 1 (1(01)*1).'],
    ['102', 'Pattern: \'2\' at position 3: not a bit (0, 1) nor one of . [ ] ( ) | * + ? { }.'],
    ['1 0', 'Pattern: \' \' at position 2: not a bit (0, 1) nor one of . [ ] ( ) | * + ? { }.'],
    ['1x', 'Pattern: \'x\' at position 2: not a bit (0, 1) nor one of . [ ] ( ) | * + ? { }.'],
    ['(1', 'Pattern: \'(\' at position 1 without its ).'],
    ['1(', 'Pattern: \'(\' at position 2 without its ).'],
    ['1)', 'Pattern: \')\' at position 2 without its (.'],
    ['()', 'Pattern: \'(\' at position 1: an empty group.'],
    ['*1', 'Pattern: nothing before \'*\' at position 1 to repeat.'],
    ['1|+', 'Pattern: nothing before \'+\' at position 3 to repeat.'],
    ['|1', 'Pattern: an empty alternative before \'|\' at position 1.'],
    ['1|', 'Pattern: an empty alternative before the end.'],
    ['(1|)0', 'Pattern: an empty alternative before \')\' at position 4.'],
    ['[2]', 'Pattern: \'[\' at position 1: [ ] holds the bits it allows, 0, 1 or both, then ].'],
    ['[01', 'Pattern: \'[\' at position 1: [ ] holds the bits it allows, 0, 1 or both, then ].'],
    ['1{3,2}', 'Pattern: \'{\' at position 2: {n}, {n,} or {n,m}, whole numbers from 0 to 16, n ≤ m.'],
    ['1{17}', 'Pattern: \'{\' at position 2: {n}, {n,} or {n,m}, whole numbers from 0 to 16, n ≤ m.'],
    ['1{,2}', 'Pattern: \'{\' at position 2: {n}, {n,} or {n,m}, whole numbers from 0 to 16, n ≤ m.'],
    ['1{2', 'Pattern: \'{\' at position 2: {n}, {n,} or {n,m}, whole numbers from 0 to 16, n ≤ m.'],
    ['1'.repeat(65), 'Pattern: at most 64 characters.'],
    // the language: empty, or with the empty string (z always 1)
    ['1[]', 'Pattern: it matches no bit string.'],
    ['1*', 'Pattern: it matches the empty string (no bits), so z would always be 1: make every match at least one bit long.'],
    ['(10)?', 'Pattern: it matches the empty string (no bits), so z would always be 1: make every match at least one bit long.'],
    ['1{0}', 'Pattern: it matches the empty string (no bits), so z would always be 1: make every match at least one bit long.'],
    ['.*|1', 'Pattern: it matches the empty string (no bits), so z would always be 1: make every match at least one bit long.'],
    // too big a detector (the bit 7 back: 2^7 states)
    ['1[01]{6}', 'Pattern: its detector would have 128 states, more than 64.'],
    ['((1{16}){16}){16}', 'Pattern: too big: its automaton would have too many states.'],
  ];
  for (const [re, want] of cases) assert.equal(E(re), want, JSON.stringify(re));
  // the limit by the machine's kind: 1[01]{5} overlapping has 64 states (Moore), its Mealy 32
  assert.equal(E('1[01]{5}'), null);
  assert.equal(detectorMachine('1[01]{5}', true, 'moore').next.length, 64);
  assert.equal(detectorMachine('1[01]{5}', true, 'mealy').next.length, 32);
  // the options checked first; the error of the core functions their RegexError
  assert.equal(E('1(', 'maybe'), 'Overlapping matches: choose one.');
  assert.equal(patternError('1(01)*1', false, 'mealy'), null);
  assert.throws(() => parseRegex(')'), (e) => e instanceof RegexError && e.message === 'Pattern: \')\' at position 1 without its (.');
  assert.throws(() => detectorTemplate('1*', true, 'moore'), RegexError);
});

test('#4902 minimize: unreachable states dropped, equivalent ones merged, numbered breadth-first (1 before 0)', () => {
  // 0 -1-> 1, 0 -0-> 2; 1 and 2 alike (both accepting, back to 0); 3 unreachable
  const m = minimize({ next: [[2, 1], [0, 0], [0, 0], [3, 3]], label: ['0', '1', '1', '0'], start: 0 });
  assert.deepEqual(m, { next: [[1, 1], [0, 0]], label: ['0', '1'], start: 0, classOf: [0, 1, 1, -1] });
});

// the FSM of a detector, as the wizard makes it
const fsmOf = (pattern, overlap, type, lang) => fsmFromSpec({ name: 'det', lang, ...fsmTemplate('detector', { pattern, overlap: overlap ? 'yes' : 'no', type }) });

for (const lang of ['vhdl', 'verilog']) {
  test(`#4902 detectors' ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: valid diagrams, compiled and elaborated with no warnings, simulated as RegExp says`, () => {
    let seed = 11;
    const bits = Array.from({ length: 120 }, () => { seed = (seed * 1103515245 + 12345) % 2147483648; return String(seed >> 16 & 1); }).join('');
    const vectors = [...bits].map((b) => ({ x: Number(b) }));
    for (const [re, overlap, type] of [['1(01)*1', true, 'moore'], ['10+1', false, 'mealy'], ['1[01]1', true, 'mealy'], ['(110|101)', false, 'moore']]) {
      const what = `${re} ${type} overlap ${overlap}`;
      const m = fsmOf(re, overlap, type, lang);
      assert.equal(m.type, type, what);
      assert.deepEqual(validateFsm(m).filter((d) => d.severity !== 'info').map((d) => `${d.severity}: ${d.message}`), [], what);
      const g = generateFsm(m, lang);
      const lib = compile([{ path: g.filename, lang, text: g.code }]);
      assert.deepEqual([...lib.errors, ...elaborate(lib, 'det').diags].map((d) => `${d.severity}: ${d.message}`), [], what);
      // z sampled before each clock edge: Mealy's after the bit, Moore's after the bit before
      const ref = reference(re, bits, overlap);
      const want = (type === 'mealy' ? ref : [0, ...ref.slice(0, -1)]).map(String);
      assert.deepEqual(runModel(m, vectors), want, what);
      assert.deepEqual(runHdl(g.code, lang, m, vectors), want, what);
    }
    // (the model's own simulation as the machine's)
    assert.equal(simulateFsm(fsmOf('1(01)*1', true, 'mealy', lang), vectors).length, 120);
  });
}
