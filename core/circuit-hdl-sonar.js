// An ultrasonic range sensor (HC-SR04) in a circuit's HDL (#5456, core/circuit-sonar.js the live simulation's): an entity
// of its own (<circuit>_sonar, its generics its id and the object's distance, the part's `cm`), simulation only (behind
// `synthesis translate_off`: a sensor, no logic of the design), its echo driven while it is powered (VCC 1, GND 0, else
// Z): a trigger of 10 µs or more falls, 460 µs later its echo goes high for 58.3 µs a centimetre (38 ms out of its
// range, 2 to 400 cm), a trigger while it measures not seen. The same in VHDL and in Verilog, checked against the live
// one (test/circuit-sonar.test.js). Isomorphic module.

/** The entity's name in a circuit. */
export const sonarEntity = (circuit) => `${circuit}_sonar`;

/** Its VHDL (lines pushed to L). */
export function vhdlSonar(L, name) {
  L.push('-- an ultrasonic range sensor (HC-SR04), its echo timed as Silinx simulates it', 'library ieee;', 'use ieee.std_logic_1164.all;', '',
    `entity ${name} is`, '  generic ( id : string := "US"; cm : integer := 100 );', '  port ( vcc, gnd, trig : in std_logic; echo : out std_logic );', `end entity ${name};`, '',
    `architecture model of ${name} is`, 'begin',
    '  process',
    '    variable rise : time := 0 ns;',
    '    variable w : time := 0 ns;',
    '  begin',
    '    echo <= \'Z\';',
    '    while not (vcc = \'1\' and gnd = \'0\') loop wait on vcc, gnd; end loop;',
    '    echo <= \'0\';',
    '    loop',
    '      wait on trig, vcc, gnd;',
    '      exit when not (vcc = \'1\' and gnd = \'0\');',
    '      if trig = \'1\' then rise := now;',
    '      elsif now - rise >= 10 us then',
    '        if cm < 2 or cm > 400 then w := 38 ms; else w := cm * 58309 ns; end if;',
    '        wait for 460 us; echo <= \'1\'; wait for w; echo <= \'0\';',
    '      end if;',
    '    end loop;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogSonar(L, name) {
  L.push('// an ultrasonic range sensor (HC-SR04), its echo timed as Silinx simulates it',
    `module ${name} #(parameter ID = "US", parameter CM = 100) (input vcc, gnd, trig, output reg echo);`,
    '  time rise, w;',
    '  initial begin',
    '    echo = 1\'bz; rise = 0;',
    '    forever begin',
    '      while (!(vcc === 1\'b1 && gnd === 1\'b0)) @(vcc or gnd);',
    '      echo = 1\'b0;',
    '      while (vcc === 1\'b1 && gnd === 1\'b0) begin',
    '        @(trig or vcc or gnd);',
    '        if (vcc === 1\'b1 && gnd === 1\'b0) begin',
    '          if (trig === 1\'b1) rise = $time;',
    '          else if ($time - rise >= 10000) begin',
    '            w = (CM < 2 || CM > 400) ? 38000000 : CM * 58309;',
    '            #460000 echo = 1\'b1; #(w) echo = 1\'b0;',
    '          end',
    '        end',
    '      end',
    '      echo = 1\'bz;',
    '    end',
    '  end',
    'endmodule', '');
}
