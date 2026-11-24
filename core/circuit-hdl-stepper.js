// A stepper motor (28BYJ-48 on its ULN2003 board) in a circuit's HDL (#5476, core/circuit-stepper.js the live
// simulation's): an entity of its own (<circuit>_stepper, its generic id the part's), simulation only (behind `synthesis
// translate_off`: an actuator, no logic of the design), its coils' pattern read while it is powered (VCC 1, GND 0), its
// rotor following it as the live one's does (a neighbour's place, one or two half steps; no sooner than 1 ms after its
// last step), where its shaft is said once it stops (20 ms with no step): `M1 at 512 half steps`. The same in VHDL and in
// Verilog (Verilog's timer a process of its own, its times regs of 64 bits: #5464, #5467), checked against the live one
// (test/circuit-stepper.test.js). Isomorphic module.

/** The entity's name in a circuit. */
export const stepperEntity = (circuit) => `${circuit}_stepper`;

/** Its VHDL (lines pushed to L). */
export function vhdlStepper(L, name) {
  L.push('-- a stepper motor (28BYJ-48, ULN2003 board), its shaft as Silinx simulates it', 'library ieee;', 'use ieee.std_logic_1164.all;', '',
    `entity ${name} is`, '  generic ( id : string := "M" );', '  port ( vcc, gnd, in1, in2, in3, in4 : in std_logic );', `end entity ${name};`, '',
    `architecture model of ${name} is`, 'begin',
    '  process',
    '    variable steps : integer range -1000000000 to 1000000000 := 0;',
    '    variable bits : integer range 0 to 15;',
    '    variable p, d : integer range -8 to 8;',
    '    variable last : time := 0 ns;',
    '    variable started, moved : boolean := false;',
    '  begin',
    '    bits := 0;',
    '    if vcc = \'1\' and gnd = \'0\' then',
    '      if in1 = \'1\' then bits := bits + 1; end if;',
    '      if in2 = \'1\' then bits := bits + 2; end if;',
    '      if in3 = \'1\' then bits := bits + 4; end if;',
    '      if in4 = \'1\' then bits := bits + 8; end if;',
    '    end if;',
    '    -- its coils\' place in the cycle (half steps): one coil or two neighbours',
    '    case bits is',
    '      when 1 => p := 0; when 3 => p := 1; when 2 => p := 2; when 6 => p := 3;',
    '      when 4 => p := 4; when 12 => p := 5; when 8 => p := 6; when 9 => p := 7;',
    '      when others => p := -1;',
    '    end case;',
    '    if p >= 0 then',
    '      d := (p - steps) mod 8;',
    '      if d > 4 then d := d - 8; end if;',
    '      if d /= 0 and abs d <= 2 and (not started or now - last >= 1 ms) then',
    '        steps := steps + d; last := now; started := true; moved := true;',
    '      end if;',
    '    end if;',
    '    if moved and now - last >= 20 ms then report id & " at " & integer\'image(steps) & " half steps"; moved := false; end if;',
    '    if moved then wait on vcc, gnd, in1, in2, in3, in4 for last + 20 ms - now; else wait on vcc, gnd, in1, in2, in3, in4; end if;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogStepper(L, name) {
  L.push('// a stepper motor (28BYJ-48, ULN2003 board), its shaft as Silinx simulates it',
    `module ${name} #(parameter ID = "M") (input vcc, gnd, in1, in2, in3, in4);`,
    '  integer steps, bits, p, d;',
    '  reg [63:0] last, due;   // (not times: their 64 bits, #5467)',
    '  reg started, moved;',
    '  event arm, expire;',
    '  // (its timer: woken at due, again if due moved on meanwhile)',
    '  initial forever begin @(arm); while ($time < due) #(due - $time); -> expire; end',
    '  initial begin',
    '    steps = 0; last = 0; due = 0; started = 1\'b0; moved = 1\'b0;',
    '    forever begin',
    '      bits = (vcc === 1\'b1 && gnd === 1\'b0) ? {in4 === 1\'b1, in3 === 1\'b1, in2 === 1\'b1, in1 === 1\'b1} : 0;',
    '      // (its coils\' place in the cycle, half steps: one coil or two neighbours)',
    '      case (bits)',
    '        1: p = 0; 3: p = 1; 2: p = 2; 6: p = 3; 4: p = 4; 12: p = 5; 8: p = 6; 9: p = 7;',
    '        default: p = -1;',
    '      endcase',
    '      if (p >= 0) begin',
    '        d = (p - steps) % 8;',
    '        if (d < 0) d = d + 8;',
    '        if (d > 4) d = d - 8;',
    '        if (d != 0 && d >= -2 && d <= 2 && (!started || $time - last >= 64\'d1000000)) begin',
    '          steps = steps + d; last = $time; started = 1\'b1; moved = 1\'b1; due = $time + 64\'d20000000; -> arm;',
    '        end',
    '      end',
    '      if (moved && $time - last >= 64\'d20000000) begin $display("%0s at %0d half steps", ID, steps); moved = 1\'b0; end',
    '      @(vcc or gnd or in1 or in2 or in3 or in4 or expire);',
    '    end',
    '  end',
    'endmodule', '');
}
