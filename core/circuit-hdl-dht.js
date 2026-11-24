// A temperature and humidity sensor (DHT11, DHT22) in a circuit's HDL (#5470, core/circuit-dht.js the live simulation's):
// an entity of its own (<circuit>_dht, its generics its id, its model and what it senses in tenths), simulation only
// (behind `synthesis translate_off`: a sensor, no logic of the design); DATA read (`data_rd`) and driven open drain
// (`data`: '0' or released, 'Z'): while it is powered, a start held long enough and released, no sooner than its interval
// after the last or its power-on, answered 30 µs later as the live one answers: 80 µs low, 80 µs released, its 40 bits
// (50 µs low, then 26 µs or 70 µs released), 50 µs low. The same in VHDL and in Verilog (its times a reg of 64 bits:
// #5467), checked against it (test/circuit-dht.test.js). Isomorphic module.

/** The entity's name in a circuit. */
export const dhtEntity = (circuit) => `${circuit}_dht`;

/** Its VHDL (lines pushed to L). */
export function vhdlDht(L, name) {
  L.push('-- a temperature and humidity sensor (DHT11, DHT22), its answer timed as Silinx simulates it', 'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '',
    `entity ${name} is`, '  generic ( id : string := "DHT"; model : integer := 22; temp10 : integer := 250; hum10 : integer := 500 );',
    '  port ( vcc, gnd, data_rd : in std_logic; data : out std_logic );', `end entity ${name};`, '',
    `architecture model of ${name} is`, 'begin',
    '  process',
    '    variable fall, ready : time := 0 ns;',
    '    variable up, low : boolean := false;',
    '    variable h : integer range 0 to 255;',
    '    variable t : integer range 0 to 65535;',
    '    variable f : std_logic_vector(39 downto 0);',
    '  begin',
    '    data <= \'Z\';',
    '    if not (vcc = \'1\' and gnd = \'0\') then up := false; low := false;',
    '    else',
    '      if not up then',
    '        up := true;',
    '        if model = 11 then ready := now + 1 sec; else ready := now + 2 sec; end if;',
    '      end if;',
    '      if data_rd = \'0\' and not low then low := true; fall := now;',
    '      elsif data_rd /= \'0\' and low then',
    '        low := false;',
    '        if ((model = 11 and now - fall >= 18 ms) or (model /= 11 and now - fall >= 1 ms)) and now >= ready then',
    '          if model = 11 then ready := now + 1 sec; else ready := now + 2 sec; end if;',
    '          -- its 5 bytes: the humidity, the temperature (a DHT22 tenths, its sign bit), their sum',
    '          if model = 11 then',
    '            f(39 downto 8) := std_logic_vector(to_unsigned(hum10 / 10, 8)) & x"00" & std_logic_vector(to_unsigned(temp10 / 10, 8)) & x"00";',
    '          else',
    '            if temp10 < 0 then t := 32768 - temp10; else t := temp10; end if;',
    '            f(39 downto 8) := std_logic_vector(to_unsigned(hum10, 16)) & std_logic_vector(to_unsigned(t, 16));',
    '          end if;',
    '          h := (to_integer(unsigned(f(39 downto 32))) + to_integer(unsigned(f(31 downto 24))) + to_integer(unsigned(f(23 downto 16))) + to_integer(unsigned(f(15 downto 8)))) mod 256;',
    '          f(7 downto 0) := std_logic_vector(to_unsigned(h, 8));',
    '          wait for 30 us; data <= \'0\'; wait for 80 us; data <= \'Z\'; wait for 80 us;',
    '          for i in 39 downto 0 loop',
    '            data <= \'0\'; wait for 50 us; data <= \'Z\';',
    '            if f(i) = \'1\' then wait for 70 us; else wait for 26 us; end if;',
    '          end loop;',
    '          data <= \'0\'; wait for 50 us; data <= \'Z\';',
    '        end if;',
    '      end if;',
    '    end if;',
    '    wait on vcc, gnd, data_rd;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogDht(L, name) {
  L.push('// a temperature and humidity sensor (DHT11, DHT22), its answer timed as Silinx simulates it',
    `module ${name} #(parameter ID = "DHT", parameter MODEL = 22, parameter TEMP10 = 250, parameter HUM10 = 500) (input vcc, gnd, data_rd, output reg data);`,
    '  reg [63:0] fall, ready;   // (not a time: its 64 bits, #5467)',
    '  reg up, low;',
    '  reg [39:0] f;',
    '  integer i, t;',
    '  initial begin',
    '    data = 1\'bz; up = 1\'b0; low = 1\'b0; fall = 0; ready = 0;',
    '    forever begin',
    '      if (!(vcc === 1\'b1 && gnd === 1\'b0)) begin up = 1\'b0; low = 1\'b0; end',
    '      else begin',
    '        if (!up) begin up = 1\'b1; ready = $time + (MODEL == 11 ? 64\'d1000000000 : 64\'d2000000000); end',
    '        if (data_rd === 1\'b0 && !low) begin low = 1\'b1; fall = $time; end',
    '        else if (data_rd !== 1\'b0 && low) begin',
    '          low = 1\'b0;',
    '          if ($time - fall >= (MODEL == 11 ? 64\'d18000000 : 64\'d1000000) && $time >= ready) begin',
    '            ready = $time + (MODEL == 11 ? 64\'d1000000000 : 64\'d2000000000);',
    '            // (its 5 bytes: the humidity, the temperature, a DHT22 tenths and its sign bit, their sum)',
    '            if (MODEL == 11) begin f[39:32] = HUM10 / 10; f[31:24] = 8\'h00; f[23:16] = TEMP10 / 10; f[15:8] = 8\'h00; end',
    '            else begin t = TEMP10 < 0 ? 32768 - TEMP10 : TEMP10; f[39:24] = HUM10; f[23:8] = t; end',
    '            f[7:0] = f[39:32] + f[31:24] + f[23:16] + f[15:8];',
    '            #30000 data = 1\'b0; #80000 data = 1\'bz; #80000;',
    '            for (i = 39; i >= 0; i = i - 1) begin data = 1\'b0; #50000 data = 1\'bz; if (f[i]) #70000; else #26000; end',
    '            data = 1\'b0; #50000 data = 1\'bz;',
    '          end',
    '        end',
    '      end',
    '      @(vcc or gnd or data_rd);',
    '    end',
    '  end',
    'endmodule', '');
}
