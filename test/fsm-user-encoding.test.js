// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state diagram's encoding of the user's (#4908): each state's code typed (state.code), kept as binary digits; Check's
// errors (no code, not binary, too wide, widths that differ, a code twice), in Portuguese too; the encoding made the
// user's by a code typed or chosen, the other states keeping the codes they had; the HDL the codes as given (VHDL and
// Verilog: no warnings, compiled, elaborated and simulated as the model); the encoded table's unused codes X.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFsm, validateFsm, generateFsm, fsmEncoding, encodedTable, truthTablesOf, setEncoding, setStateCode, FSM_ALL_ENCODINGS, FSM_ENCODINGS,
  transitionTable, stateTable,
} from '../core/fsm.js';
import { compile, elaborate } from '../core/compile.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');

// A → B → C → A on go, z in C; one-hot codes of the user's, B's written with a blank and a _
const machine = (extra = {}, codes = { a: '001', b: '0 1_0', c: '100' }) => normalizeFsm({
  name: 'ue', lang: 'vhdl', encoding: 'user', inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: ['a', 'b', 'c'].map((id, i) => ({ id, name: id.toUpperCase(), x: 100 * i, y: 100, ...(codes[id] == null ? {} : { code: codes[id] }), ...(id === 'c' ? { outputs: { z: '1' } } : {}) })),
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'c', cond: 'go' }, { id: 't3', from: 'c', to: 'a', cond: 'go' }],
  initial: 'a', ...extra,
});
const errors = (m) => validateFsm(m).filter((d) => d.severity === 'error').map((d) => [d.message, d.state ?? null]);

test('#4908 the encoding of the user\'s: kept, its codes binary digits (blanks and _ left out), the states\' codes as given', () => {
  assert.deepEqual(FSM_ALL_ENCODINGS, [...FSM_ENCODINGS, 'user']);
  const m = machine();
  assert.equal(m.encoding, 'user');
  assert.deepEqual(m.states.map((s) => s.code), ['001', '010', '100']);
  assert.deepEqual(fsmEncoding(m).map((e) => [e.name, e.bits, e.width]), [['A', '001', 3], ['B', '010', 3], ['C', '100', 3]]);
  assert.deepEqual(errors(m), []);
  assert.deepEqual(normalizeFsm(JSON.parse(JSON.stringify(m))), m);
  // (an encoding not known: binary, as before)
  assert.equal(normalizeFsm({ ...m, encoding: 'own' }).encoding, 'binary');
});

test('#4908 Check: no code, not binary, too wide, a code twice (#5026: compared once zero-extended); in Portuguese', () => {
  const cases = [
    [{ a: '001', b: '', c: '100' }, [["State B has no code: in the encoding of the user's each state has its own", 'b']]],
    [{ a: '001', b: '0x0', c: '100' }, [["State B: its code '0x0' must be binary digits (0 and 1)", 'b']]],
    [{ a: '001', b: '1'.repeat(33), c: '100' }, [['State B: its code has 33 bits; a code has 32 at most', 'b']]],
    [{ a: '001', b: '100', c: '100' }, [['States B and C have the same code 100', 'c']]],
    [{ a: '011', b: '0011', c: '100' }, [['States A (011) and B (0011) have the same code once zero-extended to 4 bits: 0011', 'b']]],
  ];
  for (const [codes, want] of cases) assert.deepEqual(errors(machine({}, codes)), want, JSON.stringify(codes));
  assert.deepEqual(cases.flatMap(([codes]) => errors(machine({}, codes)).map(([x]) => t(x))), [
    'O estado B não tem código: na codificação definida pelo utilizador cada estado tem o seu',
    "Estado B: o seu código '0x0' tem de ser dígitos binários (0 e 1)",
    'Estado B: o seu código tem 33 bits; um código tem 32 no máximo',
    'Os estados B e C têm o mesmo código 100',
    'Os estados A (011) e B (0011) têm o mesmo código, completado com zeros à esquerda até 4 bits: 0011',
  ]);
  // (the codes of a machine in another encoding: not checked, kept)
  assert.deepEqual(errors(machine({ encoding: 'binary' }, { a: '1', b: 'x', c: '1' })), []);
});

test('#4908 the encoding chosen or a code typed: the user\'s, the other states keeping the codes they had; back to another, the codes kept', () => {
  const m = machine({ encoding: 'gray' }, {});
  const bitsOf = (id) => fsmEncoding(m).find((e) => e.id === id)?.bits;
  setEncoding(m, 'user', bitsOf);
  assert.deepEqual([m.encoding, m.states.map((s) => s.code)], ['user', ['00', '01', '11']]);
  setEncoding(m, 'onehot', bitsOf);
  assert.deepEqual([m.encoding, m.states.map((s) => s.code), fsmEncoding(m).map((e) => e.bits)], ['onehot', ['00', '01', '11'], ['001', '010', '100']]);
  // a code typed in the one-hot encoding: the user's, the others' one-hot codes kept? no: their codes kept, those they had
  setStateCode(m, 'b', '1 0', bitsOf);
  assert.deepEqual([m.encoding, m.states.map((s) => s.code)], ['user', ['00', '10', '11']]);
  // a state with no code: given the one it had
  const n = machine({ encoding: 'binary' }, {});
  setStateCode(n, 'c', '11', (id) => fsmEncoding(n).find((e) => e.id === id)?.bits);
  assert.deepEqual([n.encoding, n.states.map((s) => s.code), errors(n)], ['user', ['00', '01', '11'], []]);
  // cleared
  setStateCode(n, 'c', '', () => null);
  assert.deepEqual([n.states[2].code, errors(n).map(([x]) => x)], [undefined, ["State C has no code: in the encoding of the user's each state has its own"]]);
});

test('#4908 the HDL: the codes as given, no warnings, compiled, elaborated and simulated as the model; the unused codes X in the tables', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = machine({ lang });
    const g = generateFsm(m, lang);
    assert.deepEqual(g.warnings ?? [], [], lang);
    const consts = g.code.split('\n').filter((l) => /^\s*(constant|localparam)\b.*S_[ABC]\b/.test(l)).map((l) => l.trim());
    assert.deepEqual(consts, lang === 'vhdl'
      ? ['constant S_A : state_t := "001";', 'constant S_B : state_t := "010";', 'constant S_C : state_t := "100";']
      : ["localparam [2:0] S_A = 3'b001;", "localparam [2:0] S_B = 3'b010;", "localparam [2:0] S_C = 3'b100;"], lang);
    assert.match(g.code, /Encoding {4}: user \(3 state bits\)/);
    const path = lang === 'vhdl' ? 'ue.vhd' : 'ue.v';
    const lib = compile([{ path, lang, text: g.code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'ue').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);
    const vectors = randomVectors(m, 120, 4908);
    assert.deepEqual(runHdl(g.code, lang, m, vectors), runModel(m, vectors), `${lang}: simulated`);
  }
  // the encoded table: 3 state bits, the 5 codes not used don't cares
  const et = encodedTable(machine());
  assert.deepEqual(et.rows.filter((r) => r.unused).map((r) => r.q).filter((q, i, a) => a.indexOf(q) === i), ['000', '011', '101', '110', '111']);
  assert.deepEqual(et.rows.filter((r) => !r.unused && r.in === '1').map((r) => `${r.q}->${r.d}`), ['001->010', '010->100', '100->001']);
  assert.ok(!truthTablesOf(machine()).error);
});

test('#5026 codes of different widths: valid, the register the widest, the others zero-extended; shown as typed, extended in the encoded table', () => {
  const m = machine({}, { a: '0', b: '1', c: '1_00' });
  assert.deepEqual(errors(m), []);
  assert.deepEqual(validateFsm(m).filter((d) => d.severity === 'warning').map((d) => d.message), []);
  assert.deepEqual(fsmEncoding(m).map((e) => [e.name, e.width, e.bits, e.shown]), [['A', 3, '000', '0'], ['B', 3, '001', '1'], ['C', 3, '100', '100']]);
  // the tables show them as typed; the encoded table, at the register's width
  assert.deepEqual(transitionTable(m).rows.map((r) => [r.state, r.code, r.nextCode]).filter((r, i, a) => a.findIndex((x) => x[0] === r[0]) === i),
    [['A', '0', '1'], ['B', '1', '100'], ['C', '100', '0']]);
  assert.deepEqual(stateTable(m).rows.map((r) => r.code), ['0', '1', '100']);
  assert.deepEqual(encodedTable(m).rows.filter((r) => !r.unused && r.in === '1').map((r) => `${r.q}->${r.d}`), ['000->001', '001->100', '100->000']);
  // a state of 9 bits among short ones: valid, 9 state bits
  const w = machine({}, { a: '100000001', b: '11', c: '0' });
  assert.deepEqual([errors(w), fsmEncoding(w).map((e) => e.bits)], [[], ['100000001', '000000011', '000000000']]);
  // the same code once extended, whatever the leading zeros: Check's error on the second
  assert.deepEqual(errors(machine({}, { a: '1', b: '001', c: '10' })), [['States A (1) and B (001) have the same code once zero-extended to 3 bits: 001', 'b']]);
  assert.deepEqual(errors(machine({}, { a: '0', b: '00', c: '000' })), [['States A (0) and B (00) have the same code once zero-extended to 3 bits: 000', 'b'],
    ['States A (0) and C (000) have the same code once zero-extended to 3 bits: 000', 'c']]);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#5026 codes of mixed widths, the ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: the codes extended, no warnings, compiled, elaborated, simulated as the model and by hand`, () => {
    const m = machine({ lang }, { a: '0', b: '10', c: '1_0001' });
    const g = generateFsm(m, lang);
    assert.deepEqual(g.warnings ?? [], []);
    const consts = g.code.split('\n').filter((l) => /^\s*(constant|localparam)\b.*S_[ABC]\b/.test(l)).map((l) => l.trim());
    assert.deepEqual(consts, lang === 'vhdl'
      ? ['constant S_A : state_t := "00000";', 'constant S_B : state_t := "00010";', 'constant S_C : state_t := "10001";']
      : ["localparam [4:0] S_A = 5'b00000;", "localparam [4:0] S_B = 5'b00010;", "localparam [4:0] S_C = 5'b10001;"]);
    const lib = compile([{ path: lang === 'vhdl' ? 'ue.vhd' : 'ue.v', lang, text: g.code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), []);
    assert.deepEqual(elaborate(lib, 'ue').diags.map((e) => `${e.severity}: ${e.message}`), []);
    const vectors = randomVectors(m, 150, 5026);
    // by hand: A → B → C → A on go, z in C
    let s = 0;
    const want = vectors.map((v) => { const z = s === 2 ? '1' : '0'; if (v.go) s = (s + 1) % 3; return z; });
    assert.deepEqual(runModel(m, vectors), want);
    assert.deepEqual(runHdl(g.code, lang, m, vectors), want);
  });
}
