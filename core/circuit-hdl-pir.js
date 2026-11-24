// A motion sensor (PIR, HC-SR501) in a circuit's HDL (#5463, core/circuit-pir.js the live simulation's): an entity of its
// own (<circuit>_pir, its generics its id, its hold time in ms and its jumper), simulation only (behind `synthesis
// translate_off`: a sensor, no logic of the design); `motion` its input (someone moving: the circuit's input port of the
// part's name), its OUT driven while it is powered (VCC 1, GND 0, else Z): someone moving sets it for its hold time
// (retriggering: its hold time after the last movement), then it is blind for 2.5 s. The same steps as the live one's at
// each change of its inputs and at its own times, in VHDL and in Verilog, checked against it (test/circuit-pir.test.js).
// Verilog's timer a process of its own (no fork, #5464), its due time a reg of 64 bits (#5467); VHDL's input copied to a
// signal (#5465). Isomorphic module.

/** The entity's name in a circuit. */
export const pirEntity = (circuit) => `${circuit}_pir`;

/** Its VHDL (lines pushed to L). */
export function vhdlPir(L, name) {
  L.push('-- a motion sensor (PIR, HC-SR501), its output timed as Silinx simulates it', 'library ieee;', 'use ieee.std_logic_1164.all;', '',
    `entity ${name} is`, '  generic ( id : string := "PIR"; hold_ms : integer := 3000; retrig : integer := 1 );', '  port ( vcc, gnd, motion : in std_logic; q : out std_logic );', `end entity ${name};`, '',
    `architecture model of ${name} is`, '  signal mv : std_logic;   -- (its input copied: a wait on a port driven from Verilog, #5465)', 'begin',
    '  mv <= motion;',
    '  process',
    '    variable ph : integer range 0 to 2 := 0;   -- 0 idle, 1 its output on, 2 blind',
    '    variable due : time := 0 ns;',
    '    variable was, m : boolean := false;',
    '  begin',
    '    if not (vcc = \'1\' and gnd = \'0\') then',
    '      q <= \'Z\'; ph := 0; was := false;',
    '    else',
    '      m := mv = \'1\';',
    '      if ph = 1 then',
    '        if retrig /= 0 and (m or was) then due := now + hold_ms * 1 ms;',
    '        elsif now >= due then ph := 2; due := now + 2500 ms;',
    '        end if;',
    '      elsif ph = 2 and now >= due then ph := 0;',
    '      end if;',
    '      if ph = 0 and m then ph := 1; due := now + hold_ms * 1 ms; end if;',
    '      was := m;',
    '      if ph = 1 then q <= \'1\'; else q <= \'0\'; end if;',
    '    end if;',
    '    if ph /= 0 and due > now then wait on vcc, gnd, mv for due - now; else wait on vcc, gnd, mv; end if;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogPir(L, name) {
  L.push('// a motion sensor (PIR, HC-SR501), its output timed as Silinx simulates it',
    `module ${name} #(parameter ID = "PIR", parameter HOLD_MS = 3000, parameter RETRIG = 1) (input vcc, gnd, motion, output reg q);`,
    '  integer ph;   // 0 idle, 1 its output on, 2 blind',
    '  reg [63:0] due;   // (not a time: its 64 bits, #5467)',
    '  reg was, m;',
    '  event arm, expire;',
    '  // (its timer: woken at due, again if due moved on meanwhile)',
    '  initial forever begin @(arm); while ($time < due) #(due - $time); -> expire; end',
    '  initial begin',
    '    q = 1\'bz; ph = 0; due = 0; was = 1\'b0;',
    '    forever begin',
    '      if (!(vcc === 1\'b1 && gnd === 1\'b0)) begin q = 1\'bz; ph = 0; was = 1\'b0; end',
    '      else begin',
    '        m = motion === 1\'b1;',
    '        if (ph == 1) begin',
    '          if (RETRIG != 0 && (m || was)) begin due = $time + HOLD_MS * 64\'d1000000; -> arm; end',
    '          else if ($time >= due) begin ph = 2; due = $time + 64\'d2500000000; -> arm; end',
    '        end else if (ph == 2 && $time >= due) ph = 0;',
    '        if (ph == 0 && m) begin ph = 1; due = $time + HOLD_MS * 64\'d1000000; -> arm; end',
    '        was = m;',
    '        q = ph == 1 ? 1\'b1 : 1\'b0;',
    '      end',
    '      @(vcc or gnd or motion or expire);',
    '    end',
    '  end',
    'endmodule', '');
}
