// The Pmods of #5384 on a board, through a System (the coordinator's choice for tonight, #5384): an FPGA node (a Basys 2
// design reading the Pmod AD1 over SPI, its code's top 8 bits on its LEDs) and a circuit node with the board as a part
// (fpga-basys2) and a Pmod AD1 wired to its JA header, a potentiometer on its A0 from the board's 3V3: the design reads
// the wiper's voltage, its LEDs the code of UG… the AD7476A's code = ⌊VIN × 4096 / VCC⌋; the potentiometer turned, the
// code follows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSystem } from '../core/system-doc.js';
import { normalizeCircuit } from '../core/circuit.js';
import { partPins } from '../core/circuit-parts.js';
import { systemInputs, systemFromInputs, systemReport } from '../core/system-run.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { designOf } from './compiled-diff.js';

// an SPI master at 50 MHz / 16: CS low, 16 SCK periods (SCK idle high; D0 read as SCK falls, the AD7476A setting its
// next bit then: CS's fall puts out bit 15, each fall the next), the 12-bit code latched, its top 8 bits on led; again and again
const ADREAD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity adread is
  port (clk : in std_logic; cs, sck : out std_logic; d0 : in std_logic; led : out std_logic_vector(7 downto 0));
end adread;
architecture rtl of adread is
  signal div : unsigned(2 downto 0) := (others => '0');
  signal bitn : unsigned(5 downto 0) := (others => '0');
  signal sh : std_logic_vector(15 downto 0) := (others => '0');
  signal code : std_logic_vector(11 downto 0) := (others => '0');
  signal sck_r, cs_r : std_logic := '1';
begin
  process (clk)
  begin
    if rising_edge(clk) then
      div <= div + 1;
      if div = 7 then
        if bitn = 0 then cs_r <= '0'; sck_r <= '1'; bitn <= bitn + 1;
        elsif bitn <= 32 then
          sck_r <= not sck_r;
          if sck_r = '1' then sh <= sh(14 downto 0) & d0; end if;
          bitn <= bitn + 1;
        elsif bitn = 33 then cs_r <= '1'; code <= sh(11 downto 0); bitn <= bitn + 1;
        elsif bitn = 40 then bitn <= (others => '0');
        else bitn <= bitn + 1;
        end if;
      end if;
    end if;
  end process;
  cs <= cs_r; sck <= sck_r;
  led <= code(11 downto 4);
end rtl;
`;
const LEDS = ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'];
const FPGA = { id: 'fpga', kind: 'fpga', module: 'adread', board: 'basys2', variant: '250',
  pins: { clk: 'B8', cs: 'B2', d0: 'A3', sck: 'B5', ...Object.fromEntries(LEDS.map((l, k) => [`led<${k}>`, l])) }, interfaces: [] };
const BENCH = { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] };
const system = () => normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [FPGA, BENCH], links: [] });

// the bench: the Basys 2 (fpga) below; the AD1 above it, its J1 wired to JA (CS JA1, D0 JA2, SCK JA4, GND, 3V3); RV1
// from the board's 3V3 to its GND, its wiper on A0
function bench(pos) {
  const parts = [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'AD1', type: 'pmod-ad1', x: 0, y: 20 }, { id: 'RV1', type: 'potentiometer', x: 10, y: 10, pos }];
  const at = (ref) => { const [id, n] = ref.split('.'); const q = partPins(parts.find((p) => p.id === id)).find((x) => String(x.n) === n); return [q.x, q.y]; };
  const joins = [['F1.1', 'AD1.1'], ['F1.2', 'AD1.2'], ['F1.4', 'AD1.4'], ['F1.5', 'AD1.5', 'RV1.3'], ['F1.6', 'AD1.6', 'RV1.1'], ['RV1.2', 'AD1.7']];
  const wires = [];
  for (const list of joins) for (const r of list.slice(1)) wires.push({ id: `w${wires.length + 1}`, points: [at(list[0]), at(r)] });
  return normalizeCircuit({ name: 'bench', parts, wires });
}

const netlist = await netlistOf(designOf([{ path: 'src/adread.vhd', lang: 'vhdl', role: 'design', text: ADREAD }], 'adread'), { run: yosysNode });
const PORTS = { adread: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'cs', dir: 'out', width: 1 }, { name: 'sck', dir: 'out', width: 1 }, { name: 'd0', dir: 'in', width: 1 }, { name: 'led', dir: 'out', width: 8 }] };

async function run(pos, us = 60) {
  const sys = system();
  const inputs = await systemInputs(sys, { ports: PORTS, netlist: () => netlist, circuit: async () => JSON.stringify(bench(pos)) });
  assert.equal(inputs.error, undefined);
  const r = systemFromInputs(sys, inputs);
  assert.equal(r.error, undefined);
  r.sim.run(us * 1e6);
  const f = r.sim.nodes.get('fpga');
  return { r, rep: systemReport(r), leds: LEDS.map((_, k) => f.value(`led[${k}]`)).reverse().join('') };
}

test('#5384 a Basys 2 reads a Pmod AD1 through a System: a potentiometer at 25 % and 75 % of 3.3 V, its code\'s top bits on the LEDs', async () => {
  // (the wiper at pos % from its end 1 (3V3): VIN = 3.3 × (1 − pos / 100); code ⌊VIN × 4096 / 3.3⌋ less its load's few mV)
  for (const [pos, want] of [[25, 3072 >> 4], [75, 1024 >> 4]]) {
    const { rep, leds } = await run(pos);
    assert.deepEqual([rep.errors, rep.warnings], [[], []]);
    const got = parseInt(leds, 2);
    assert.ok(Math.abs(got - want) <= 1, `${pos} %: LEDs ${leds}, want about ${want.toString(2).padStart(8, '0')}`);
  }
});
