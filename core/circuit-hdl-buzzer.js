// A buzzer in a circuit's HDL (#5454, core/circuit-buzzer.js the live simulation's): an entity of its own
// (<circuit>_buzzer, its generic id the part's), simulation only (behind `synthesis translate_off`: a sounder, no logic of
// the design), its + read while its − is at 0: a rise within 50 ms of the last the tone of a wave, its frequency from the
// last rise, said when it changes (`BZ1 440 Hz`); a rise after its + fell 50 ms or more before (or its first) said `BZ1
// on`. The same in VHDL and in Verilog, checked against the live one (test/circuit-buzzer.test.js). Isomorphic module.

/** The entity's name in a circuit. */
export const buzzerEntity = (circuit) => `${circuit}_buzzer`;

/** Its VHDL (lines pushed to L). */
export function vhdlBuzzer(L, name) {
  L.push('-- a buzzer, its + read as Silinx simulates it: on, and the tone of a wave as it changes', 'library ieee;', 'use ieee.std_logic_1164.all;', '',
    `entity ${name} is`, '  generic ( id : string := "BZ" );', '  port ( pos, neg : in std_logic );', `end entity ${name};`, '',
    `architecture model of ${name} is`, 'begin',
    '  -- silinx: ignore data-as-clock (its + read as the buzzer reads it: from rise to rise)',
    '  process (pos, neg)',
    '    variable rise, fall : time := 0 ns;',
    '    variable risen, fell, high : boolean := false;',
    '    variable hz, said : integer range 0 to 2147483647 := 0;',
    '  begin',
    '    if neg /= \'0\' then risen := false; fell := false; high := false;',
    '    elsif pos = \'1\' then',
    '      if risen and now - rise < 50 ms then',
    '        hz := 1000000000 / ((now - rise) / 1 ns);',
    '        if hz /= said then said := hz; report id & " " & integer\'image(hz) & " Hz"; end if;',
    '      elsif not fell or now - fall >= 50 ms then said := 0; report id & " on";',
    '      end if;',
    '      risen := true; rise := now; high := true;',
    '    elsif pos = \'0\' and high then fell := true; fall := now; high := false;',
    '    end if;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogBuzzer(L, name) {
  L.push('// a buzzer, its + read as Silinx simulates it: on, and the tone of a wave as it changes',
    `module ${name} #(parameter ID = "BZ") (input pos, neg);`,
    '  reg risen, fell, high;',
    '  integer hz, said;',
    '  time rise, fall;',
    '  initial begin risen = 0; fell = 0; high = 0; said = 0; rise = 0; fall = 0; end',
    '  // silinx: ignore data-as-clock clock-as-data latch sensitivity (its + read as the buzzer reads it: from rise to rise)',
    '  always @(pos or neg) begin',
    '    if (neg !== 1\'b0) begin risen = 0; fell = 0; high = 0; end',
    '    else if (pos === 1\'b1) begin',
    '      if (risen && $time - rise < 50000000) begin',
    '        hz = 1000000000 / ($time - rise);',
    '        if (hz != said) begin said = hz; $display("%0s %0d Hz", ID, hz); end',
    '      end else if (!fell || $time - fall >= 50000000) begin said = 0; $display("%0s on", ID); end',
    '      risen = 1; rise = $time; high = 1;',
    '    end',
    '    else if (pos === 1\'b0 && high) begin fell = 1; fall = $time; high = 0; end',
    '  end',
    'endmodule', '');
  // (a model's state held between its +'s edges: latches, on purpose, its lines said so)
  const at = L.findIndex((l) => l.startsWith('  always @(pos'));
  for (let i = at + 1; i < L.length && L[i] !== 'endmodule'; i++) if (/[=(]/.test(L[i])) L[i] += '   // silinx: ignore latch';
}
