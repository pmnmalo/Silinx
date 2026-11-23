// A character LCD 16×2 (HD44780) in a circuit's HDL (#5330, core/circuit-lcd.js the live simulation's): an entity of its
// own (<circuit>_lcd1602, its generic id the part's), simulation only (behind `synthesis translate_off`: a display, no
// logic of the design), its controller as the live one: a write on E's falling edge while powered (VDD 1, VSS 0; reset
// while not), RS a command or a character, 8-bit or 4-bit mode, the DDRAM's two lines, the shifts, the CGRAM addressed;
// after a write that changes what it shows, its lines reported (`LCD1 |Hello           |world           |`, `LCD1 off`
// while its display is off; a character outside printable ASCII but \, ~ and DEL as ?). The same in VHDL and in Verilog,
// checked against the live one (test/circuit-lcd.test.js). Isomorphic module.

const PORTS = ['vss', 'vdd', 'rs', 'rw', 'e', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];
/** Its ports, the pins' names in lower case, in its pins' order (V0, A and K not connected: none). */
export const LCD_PORTS = PORTS;

/** The entity's name in a circuit. */
export const lcdEntity = (circuit) => `${circuit}_lcd1602`;

/** Its VHDL (lines pushed to L). */
export function vhdlLcd(L, name) {
  L.push('-- a character LCD 16x2 (HD44780), its controller as Silinx simulates it: its lines reported after each write',
    'library ieee;', 'use ieee.std_logic_1164.all;', '',
    `entity ${name} is`, '  generic ( id : string := "LCD" );', `  port ( ${PORTS.join(', ')} : in std_logic );`, `end entity ${name};`, '',
    `architecture model of ${name} is`, 'begin',
    '  -- silinx: ignore data-as-clock (E read as the module reads it: a write as it falls)',
    '  process (e, vdd, vss)',
    '    type ram_t is array (0 to 127) of natural range 0 to 255;',
    '    variable ram : ram_t := (others => 32);',
    '    variable ac, a : integer range 0 to 127 := 0;',
    '    variable cg, half : integer range 0 to 63 := 0;',
    '    variable b : integer range -1 to 255 := 0;',
    '    variable span : integer range 40 to 80 := 80;',
    '    variable shift : integer range -1000000 to 1000000 := 0;',
    '    variable inc, autoshift, disp, eight, two, inhalf, incg, pw : boolean := false;',
    '    variable l1, l2 : string(1 to 16) := (others => \' \');',
    '    variable said : string(1 to 35) := (others => \' \');',
    '    variable shown : string(1 to 35);',
    '    function bit_of(s : std_logic) return natural is begin if s = \'1\' then return 1; else return 0; end if; end function;',
    '    function chr(c : natural) return character is begin',
    '      if c >= 32 and c <= 125 and c /= 92 then return character\'val(c); else return \'?\'; end if; end function;',
    '  begin',
    '    if not (vdd = \'1\' and vss = \'0\') then',
    '      ram := (others => 32); ac := 0; cg := 0; incg := false; inc := true; autoshift := false; disp := false;',
    '      eight := true; two := false; inhalf := false; shift := 0; pw := false;',
    '      said := (others => \' \'); said(1) := \'o\'; said(2) := \'f\'; said(3) := \'f\';   -- (off at power-on: not said)',
    '    elsif pw and falling_edge(e) then',
    '      b := bit_of(d7) * 128 + bit_of(d6) * 64 + bit_of(d5) * 32 + bit_of(d4) * 16 + bit_of(d3) * 8 + bit_of(d2) * 4 + bit_of(d1) * 2 + bit_of(d0);',
    '      if not eight then',
    '        if not inhalf then half := b / 16; inhalf := true; b := -1;',
    '        else b := half * 16 + b / 16; inhalf := false; end if;',
    '      end if;',
    '      if b >= 0 and rs = \'1\' then',
    '        if incg then cg := (cg + 1) mod 64;   -- (its rows kept off the screen)',
    '        else',
    '          ram(ac) := b;',
    '          if inc then if two then if ac = 39 then ac := 64; elsif ac = 103 then ac := 0; else ac := ac + 1; end if; else ac := (ac + 1) mod 80; end if;',
    '          else if two then if ac = 0 then ac := 103; elsif ac = 64 then ac := 39; else ac := ac - 1; end if; else ac := (ac + 79) mod 80; end if; end if;',
    '          if autoshift then if inc then shift := shift + 1; else shift := shift - 1; end if; end if;',
    '        end if;',
    '      elsif b >= 128 then ac := b - 128; incg := false;',
    '      elsif b >= 64 then cg := b - 64; incg := true;',
    '      elsif b >= 32 then eight := (b / 16) mod 2 = 1; two := (b / 8) mod 2 = 1;',
    '      elsif b >= 16 then',
    '        if (b / 8) mod 2 = 1 then if (b / 4) mod 2 = 1 then shift := shift - 1; else shift := shift + 1; end if;',
    '        elsif (b / 4) mod 2 = 1 then if two then if ac = 39 then ac := 64; elsif ac = 103 then ac := 0; else ac := ac + 1; end if; else ac := (ac + 1) mod 80; end if;',
    '        else if two then if ac = 0 then ac := 103; elsif ac = 64 then ac := 39; else ac := ac - 1; end if; else ac := (ac + 79) mod 80; end if; end if;',
    '      elsif b >= 8 then disp := (b / 4) mod 2 = 1;',
    '      elsif b >= 4 then inc := (b / 2) mod 2 = 1; autoshift := b mod 2 = 1;',
    '      elsif b >= 2 then ac := 0; shift := 0; incg := false;',
    '      elsif b = 1 then ram := (others => 32); ac := 0; shift := 0; inc := true; incg := false;',
    '      end if;',
    '      if b >= 0 then',
    '        if two then span := 40; else span := 80; end if;',
    '        for c in 0 to 15 loop',
    '          a := ((c + shift) mod span + span) mod span;',
    '          l1(c + 1) := chr(ram(a));',
    '          if two then l2(c + 1) := chr(ram(64 + a)); else l2(c + 1) := \' \'; end if;',
    '        end loop;',
    '        if disp then shown := \'|\' & l1 & \'|\' & l2 & \'|\'; else shown := (others => \' \'); shown(1) := \'o\'; shown(2) := \'f\'; shown(3) := \'f\'; end if;',
    '        if shown /= said then',
    '          said := shown;',
    '          if disp then report id & " " & shown; else report id & " off"; end if;',
    '        end if;',
    '      end if;',
    '    end if;',
    '    if vdd = \'1\' and vss = \'0\' then pw := true; end if;',
    '  end process;',
    'end architecture model;', '');
}

/** Its Verilog (lines pushed to L). */
export function verilogLcd(L, name) {
  const step = (up) => (up
    ? 'if (two) ac = (ac == 39) ? 64 : (ac == 103) ? 0 : ac + 1; else ac = (ac + 1) % 80;'
    : 'if (two) ac = (ac == 0) ? 103 : (ac == 64) ? 39 : ac - 1; else ac = (ac + 79) % 80;');
  L.push('// a character LCD 16x2 (HD44780), its controller as Silinx simulates it: its lines reported after each write',
    `module ${name} #(parameter ID = "LCD") (input ${PORTS.join(', ')});`,
    '  reg [7:0] ram [0:127];',
    '  integer ac, cg, shift, half, b, span, a, k;',
    '  reg inc, autoshift, disp, eight, two, inhalf, incg, pw;',
    '  reg [8*35-1:0] shown, said;',
    '  function [7:0] chr(input [7:0] c); chr = (c >= 32 && c <= 125 && c != 92) ? c : "?"; endfunction',
    '  task reset; begin for (k = 0; k < 128; k = k + 1) ram[k] = 32; ac = 0; cg = 0; incg = 0; inc = 1; autoshift = 0; disp = 0;',
    '    eight = 1; two = 0; inhalf = 0; shift = 0; pw = 0; said = "off"; end endtask',
    '  initial reset;',
    '  // silinx: ignore latch (powered: kept until the supply goes)',
    '  always @(vdd or vss) if (!(vdd === 1\'b1 && vss === 1\'b0)) reset; else pw = 1;',
    '  // silinx: ignore data-as-clock clock-as-data (E read as the module reads it: a write as it falls)',
    '  always @(negedge e) if (pw && vdd === 1\'b1 && vss === 1\'b0) begin',
    '    b = {d7 === 1\'b1, d6 === 1\'b1, d5 === 1\'b1, d4 === 1\'b1, d3 === 1\'b1, d2 === 1\'b1, d1 === 1\'b1, d0 === 1\'b1};',
    '    if (!eight) begin',
    '      if (!inhalf) begin half = b / 16; inhalf = 1; b = -1; end',
    '      else begin b = half * 16 + b / 16; inhalf = 0; end',
    '    end',
    '    if (b >= 0 && rs === 1\'b1) begin',
    '      if (incg) cg = (cg + 1) % 64;   // (its rows kept off the screen)',
    '      else begin',
    `        ram[ac] = b; if (inc) begin ${step(true)} end else begin ${step(false)} end`,
    '        if (autoshift) shift = inc ? shift + 1 : shift - 1;',
    '      end',
    '    end',
    '    else if (b >= 128) begin ac = b - 128; incg = 0; end',
    '    else if (b >= 64) begin cg = b - 64; incg = 1; end',
    '    else if (b >= 32) begin eight = (b / 16) % 2; two = (b / 8) % 2; end',
    '    else if (b >= 16) begin',
    '      if ((b / 8) % 2) shift = ((b / 4) % 2) ? shift - 1 : shift + 1;',
    `      else if ((b / 4) % 2) begin ${step(true)} end else begin ${step(false)} end`,
    '    end',
    '    else if (b >= 8) disp = (b / 4) % 2;',
    '    else if (b >= 4) begin inc = (b / 2) % 2; autoshift = b % 2; end',
    '    else if (b >= 2) begin ac = 0; shift = 0; incg = 0; end',
    '    else if (b == 1) begin for (k = 0; k < 128; k = k + 1) ram[k] = 32; ac = 0; shift = 0; inc = 1; incg = 0; end',
    '    if (b >= 0) begin',
    '      span = two ? 40 : 80;',
    '      shown = {"|", 128\'d0, "|", 128\'d0, "|"};',
    '      for (k = 0; k < 16; k = k + 1) begin',
    '        a = ((k + shift) % span + span) % span;',
    '        shown[8*(34-k)-1 -: 8] = chr(ram[a]);',
    '        shown[8*(17-k)-1 -: 8] = two ? chr(ram[64 + a]) : " ";',
    '      end',
    '      if (!disp) shown = "off";',
    '      if (shown !== said) begin said = shown; if (disp) $display("%0s %0s", ID, shown); else $display("%0s off", ID); end',
    '    end',
    '  end',
    'endmodule', '');
  // (a model whose writes run in order: blocking, on purpose, its lines said so)
  const at = L.findIndex((l) => l.startsWith('  always @(negedge e)'));
  for (let i = at + 1; i < L.length && L[i] !== 'endmodule'; i++) if (/[^=!<>]=[^=]/.test(L[i])) L[i] += '   // silinx: ignore blocking';
}
