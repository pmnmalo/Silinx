// A servo (SG90) in a circuit's HDL (#5347, core/circuit-servo.js the live simulation's): an entity of its own
// (<circuit>_servo, its generic id the part's), simulation only (behind `synthesis translate_off`: an actuator, no logic of
// the design), each pulse on its signal measured while it is powered (VCC 1, GND 0), from its rise to its fall in the
// simulation's time, its width the angle it asks for (0.5 ms 0°, 2.5 ms 180°, linear, rounded to a degree; beyond: its
// end), said when it changes: `M1 to 135` (its arm's motion is the live simulation's). The same in VHDL and in Verilog,
// checked against the live one (test/circuit-servo.test.js). Isomorphic module.

/** The entity's name in a circuit. */
export const servoEntity = (circuit) => `${circuit}_servo`;

/** Its VHDL (lines pushed to L). */
export function vhdlServo(L, name) {
  L.push('-- a servo (SG90), each pulse on its signal measured as Silinx simulates it: the angle it asks for said as it changes',
    'library ieee;', 'use ieee.std_logic_1164.all;', '',
    `entity ${name} is`, '  generic ( id : string := "M" );', '  port ( gnd, vcc, sig : in std_logic );', `end entity ${name};`, '',
    `architecture model of ${name} is`, 'begin',
    '  -- silinx: ignore data-as-clock (its signal read as the servo reads it: a pulse from its rise to its fall)',
    '  process (sig, vcc, gnd)',
    '    variable rise : time := 0 ns;',
    '    variable risen, pw : boolean := false;',
    '    variable w : integer range 0 to 2147483647 := 0;',
    '    variable a : integer range 0 to 180 := 90;',
    '    variable target : integer range 0 to 180 := 90;',
    '  begin',
    '    if not (vcc = \'1\' and gnd = \'0\') then risen := false; pw := false;',
    '    elsif not pw then pw := true; risen := sig = \'1\'; rise := now;',
    '    elsif sig = \'1\' then risen := true; rise := now;',
    '    elsif sig = \'0\' and risen then',
    '      risen := false;',
    '      w := (now - rise) / 1 ns;',
    '      if w <= 500000 then a := 0; elsif w >= 2500000 then a := 180; else a := ((w - 500000) * 180 + 1000000) / 2000000; end if;',
    '      if w > 0 and a /= target then target := a; report id & " to " & integer\'image(target); end if;',
    '    end if;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogServo(L, name) {
  L.push('// a servo (SG90), each pulse on its signal measured as Silinx simulates it: the angle it asks for said as it changes',
    `module ${name} #(parameter ID = "M") (input gnd, vcc, sig);`,
    '  reg risen, pw;',
    '  integer w, a, target;',
    '  time rise;',
    '  initial begin risen = 0; pw = 0; target = 90; rise = 0; end',
    '  // silinx: ignore data-as-clock clock-as-data latch sensitivity (its signal read as the servo reads it: a pulse from its rise to its fall)',
    '  always @(sig or vcc or gnd) begin',
    '    if (!(vcc === 1\'b1 && gnd === 1\'b0)) begin risen = 0; pw = 0; end',
    '    else if (!pw) begin pw = 1; risen = sig === 1\'b1; rise = $time; end',
    '    else if (sig === 1\'b1) begin risen = 1; rise = $time; end',
    '    else if (sig === 1\'b0 && risen) begin',
    '      risen = 0;',
    '      w = $time - rise;',
    '      a = w <= 500000 ? 0 : w >= 2500000 ? 180 : ((w - 500000) * 180 + 1000000) / 2000000;',
    '      if (w > 0 && a != target) begin target = a; $display("%0s to %0d", ID, target); end',
    '    end',
    '  end',
    'endmodule', '');
  // (a model's state held between its signal's edges: latches, on purpose, its lines said so)
  const at = L.findIndex((l) => l.startsWith('  always @(sig'));
  for (let i = at + 1; i < L.length && L[i] !== 'endmodule'; i++) if (/[=(]/.test(L[i])) L[i] += '   // silinx: ignore latch';
}
