// Unit tests (#5076): core/hdl-emit-fsm.js, the state machines' skeleton the ASM chart's and the state diagram's
// generators share: the entity and the module (clock and reset first, an aligned table), the state type and constants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VHDL_USER_ENCODING, machineEntity, machineModule, vhdlStates, vlogStates } from '../core/hdl-emit-fsm.js';
import { generateFsm, normalizeFsm } from '../core/fsm.js';

const M = { name: 'det', clock: 'clk', reset: { name: 'reset' }, inputs: [{ name: 'x', width: 1 }, { name: 'data', width: 8 }], outputs: [{ name: 'z', width: 1 }, { name: 'count', width: 4 }] };

test('machineEntity: clock and reset first, the names and the modes in columns', () => {
  assert.deepEqual(machineEntity(M), ['entity det is', '    port (',
    '        clk   : in  std_logic;', '        reset : in  std_logic;', '        x     : in  std_logic;', '        data  : in  std_logic_vector(7 downto 0);',
    '        z     : out std_logic;', '        count : out std_logic_vector(3 downto 0)', '    );', 'end entity det;']);
  // the ASM chart's parameters (integers), aligned; a machine with no inputs nor outputs
  assert.deepEqual(machineEntity({ ...M, inputs: [], outputs: [] }, { generics: [{ name: 'N', default: 8 }, { name: 'DELAY', default: 0 }] }),
    ['entity det is', '    generic (', '        N     : integer := 8;', '        DELAY : integer := 0', '    );', '    port (',
      '        clk   : in  std_logic;', '        reset : in  std_logic', '    );', 'end entity det;']);
});

test('machineModule: the ranges in a column, the outputs\' kind, the parameters', () => {
  assert.deepEqual(machineModule(M), ['module det (', '    input  wire       clk,', '    input  wire       reset,', '    input  wire       x,',
    '    input  wire [7:0] data,', '    output reg        z,', '    output reg  [3:0] count', ');']);
  assert.deepEqual(machineModule({ ...M, inputs: [], outputs: [{ name: 'z', width: 1, registered: true }] }, { outKind: (p) => (p.registered ? 'wire' : 'reg '), generics: [{ name: 'N', default: 8 }] }),
    ['module det #(', '    parameter N = 8', ') (', '    input  wire clk,', '    input  wire reset,', '    output wire z', ');']);
});

test('vhdlStates / vlogStates: an enumeration, or a subtype and its constants; a single state', () => {
  const enc = [{ constName: 'S_IDLE', bits: '00' }, { constName: 'S_A', bits: '01' }, { constName: 'S_LONG', bits: '10' }];
  assert.deepEqual(vhdlStates(enc, 2, 'enum'), ['    -- state encoding', '    type state_t is (S_IDLE, S_A, S_LONG);']);
  assert.deepEqual(vhdlStates(enc, 2, 'binary'), ['    -- state encoding', '    subtype state_t is std_logic_vector(1 downto 0);',
    '    constant S_IDLE : state_t := "00";', '    constant S_A    : state_t := "01";', '    constant S_LONG : state_t := "10";']);
  assert.deepEqual(vlogStates(enc, 2), ['    // ---------------------------------------------------------------- state encoding',
    "    localparam [1:0] S_IDLE = 2'b00;", "    localparam [1:0] S_A    = 2'b01;", "    localparam [1:0] S_LONG = 2'b10;"]);
  // one state of one bit: no range
  assert.deepEqual(vhdlStates([{ constName: 'S0', bits: '0' }], 1, 'binary').slice(1), ['    subtype state_t is std_logic_vector(0 downto 0);', '    constant S0 : state_t := "0";']);
  assert.deepEqual(vlogStates([{ constName: 'S0', bits: '0' }], 1).slice(1), ["    localparam S0 = 1'b0;"]);
  assert.deepEqual(VHDL_USER_ENCODING, ['    attribute fsm_encoding : string;', '    attribute fsm_encoding of state_reg : signal is "user";']);
});

test('the state diagram\'s generator writes its entity, module and states with them', () => {
  const f = normalizeFsm({ name: 'blink', clock: 'clk', reset: { name: 'rst' }, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'led', width: 1, default: '0' }],
    encoding: 'binary', states: [{ id: 'a', name: 'OFF', x: 0, y: 0 }, { id: 'b', name: 'ON', x: 100, y: 0 }], initial: 'a',
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'a', cond: '' }] });
  for (const lang of ['vhdl', 'verilog']) {
    const code = generateFsm({ ...f, lang }, lang).code;
    const head = lang === 'vhdl' ? machineEntity(f) : machineModule(f);
    assert.ok(code.includes(head.join('\n')), lang);
    const states = lang === 'vhdl' ? vhdlStates([{ constName: 'S_OFF', bits: '0' }, { constName: 'S_ON', bits: '1' }], 1, 'binary') : vlogStates([{ constName: 'S_OFF', bits: '0' }, { constName: 'S_ON', bits: '1' }], 1);
    assert.ok(code.includes(states.join('\n')), code);
  }
});
