// Silinx - the XADC Wizard's module (#5385, the analog and digital roadmap #5387): the 7-series XADC reading the channels
// asked (the die temperature, VCCINT, VCCAUX, VCCBRAM, VP/VN, VAUX0..15) in its continuous sequence, each channel's last
// 12-bit code on an output of its own. Its settings, a spec, in a line of its header as the Clocking Wizard's
// (core/clocking.js wizardLine / readWizardSpec): the module is generated from it, opening it reopens the wizard.
//
// The module: DCLK its clock (the XADC's ADCCLK DCLK / CLKDIV, 26 MHz at most: CLKDIV = ⌈DCLK / 26 MHz⌉, 2 at least, UG480),
// its reset; the XADC in continuous sequence mode (INIT_41 2xxxh, its channels' bits in INIT_48 and INIT_49, the alarms
// off), each end of conversion (EOC) a DRP read of the channel converted (DADDR its CHANNEL: the status registers 00h, 01h,
// 02h, 03h, 06h, 10h-1Fh are the channels' numbers), its data (DO(15 downto 4)) latched into the channel's output as DRDY
// comes; EOS one DCLK at each pass's end. A VAUX channel's pins VAUXP / VAUXN its ports (<port>_p, <port>_n, on the
// board's analog header: Basys 3's JXADC), VP / VN theirs.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   XADC_CHANNELS              the channels: [{ id, label, ch (its channel number), reg, bit (its INIT_48 / INIT_49 bit) }]
//   planXadc(spec)             { clkdiv, adcMHz, sampleKsps, init: { 40, 41, 42, 48, 49 }, errors, notes }
//   xadcModule(spec)           { code, plan } (code '' when the plan has errors)

import { wizardLine } from './clocking.js';

/** The channels the wizard reads: their id, words, channel number and their sequence's register bit (48h: 8–14, 49h: VAUX). */
export const XADC_CHANNELS = [
  { id: 'temp', label: 'Die temperature', ch: 0, reg: 0x48, bit: 8 },
  { id: 'vccint', label: 'VCCINT', ch: 1, reg: 0x48, bit: 9 },
  { id: 'vccaux', label: 'VCCAUX', ch: 2, reg: 0x48, bit: 10 },
  { id: 'vpvn', label: 'VP / VN (dedicated input)', ch: 3, reg: 0x48, bit: 11 },
  { id: 'vccbram', label: 'VCCBRAM', ch: 6, reg: 0x48, bit: 14 },
  ...Array.from({ length: 16 }, (_, k) => ({ id: `vaux${k}`, label: `VAUX${k} (auxiliary input)`, ch: 16 + k, reg: 0x49, bit: k })),
];
const ADC_MAX_MHZ = 26;
const hex = (v) => v.toString(16).toUpperCase().padStart(4, '0');

/** The wizard's plan of a spec ({ dclkMHz, channels: [{ id, port }] }): the XADC's INIT_xx, its rates, the errors. */
export function planXadc(spec) {
  const errors = [], notes = [];
  const f = +spec.dclkMHz;
  if (!(f >= 8 && f <= 250)) errors.push('DCLK: from 8 to 250 MHz (UG480).');
  if (!spec.channels?.length) errors.push('Choose at least one channel.');
  const unknown = (spec.channels || []).filter((c) => !XADC_CHANNELS.some((x) => x.id === c.id));
  if (unknown.length) errors.push(`No channel ${unknown.map((c) => c.id).join(', ')}.`);
  const ids = (spec.channels || []).map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push('A channel is chosen twice.');
  const clkdiv = Math.max(2, Math.ceil(f / ADC_MAX_MHZ - 1e-9));
  const adcMHz = f / clkdiv;
  let i48 = 0, i49 = 0;
  for (const c of spec.channels || []) { const x = XADC_CHANNELS.find((y) => y.id === c.id); if (x) { if (x.reg === 0x48) i48 |= 1 << x.bit; else i49 |= 1 << x.bit; } }
  const n = (spec.channels || []).length || 1;
  // (a conversion every 26 ADCCLK cycles, the channels in turn: each one's rate)
  const sampleKsps = adcMHz * 1e3 / 26;
  notes.push(`ADCCLK ${+adcMHz.toFixed(3)} MHz (DCLK / ${clkdiv}): a conversion every 26 cycles, ${+sampleKsps.toFixed(1)} kSPS in all, ${+(sampleKsps / n).toFixed(1)} kSPS a channel.`);
  return { clkdiv, adcMHz, sampleKsps, init: { 40: 0x0000, 41: 0x2F0F, 42: clkdiv << 8, 48: i48, 49: i49 }, errors, notes };
}

/** The module of a spec (with its `name`, `lang`, `dclk`, `reset`, `eos`): { code, plan }; code '' when the plan has errors. */
export function xadcModule(spec) {
  const plan = planXadc(spec);
  if (plan.errors.length) return { code: '', plan };
  return { code: spec.lang === 'verilog' ? verilogOf(spec, plan) : vhdlOf(spec, plan), plan };
}

const chans = (spec) => spec.channels.map((c) => ({ ...XADC_CHANNELS.find((x) => x.id === c.id), port: c.port }));
const vaux = (spec) => chans(spec).filter((c) => c.ch >= 16);
function describe(spec, plan, c) {
  const how = (x) => (x.ch === 0 ? '(T + 273.15) × 4096 / 503.975' : x.ch < 16 && x.ch !== 3 ? 'V × 4096 / 3' : 'V × 4096, 0 to 1 V');
  return [
    `${c} XADC Wizard (Silinx): the 7-series XADC in its continuous sequence, each channel's last 12-bit code on its output.`,
    `${c} Do not edit: the module is generated from the line above; open it from the Design pane to change it.`,
    `${c}`,
    `${c}   ${spec.dclk.padEnd(12)} DCLK, ${+(+spec.dclkMHz).toFixed(3)} MHz`,
    ...(spec.reset ? [`${c}   ${spec.reset.padEnd(12)} 1 restarts the XADC (RESET)`] : []),
    ...chans(spec).map((x) => `${c}   ${x.port.padEnd(12)} ${x.label}: its code, 0 to 4095 (${how(x)})${x.ch >= 16 ? `; its pins ${x.port}_p, ${x.port}_n` : x.ch === 3 ? '; its pins vp, vn' : ''}`),
    ...(spec.eos ? [`${c}   ${spec.eos.padEnd(12)} 1 for a DCLK when every channel has been converted again (EOS)`] : []),
    ...plan.notes.map((n) => `${c} ${n}`),
  ];
}

function vhdlOf(spec, plan) {
  const C = chans(spec), V = vaux(spec), vp = C.some((x) => x.ch === 3);
  const ports = [`${spec.dclk} : in std_logic`, ...(spec.reset ? [`${spec.reset} : in std_logic`] : []), ...C.map((x) => `${x.port} : out std_logic_vector(11 downto 0)`),
    ...(spec.eos ? [`${spec.eos} : out std_logic`] : []), ...V.flatMap((x) => [`${x.port}_p : in std_logic`, `${x.port}_n : in std_logic`]), ...(vp ? ['vp : in std_logic', 'vn : in std_logic'] : [])];
  const L = [wizardLine(spec, 'vhdl'), ...describe(spec, plan, '--'), 'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', 'use IEEE.NUMERIC_STD.ALL;', 'library UNISIM;', 'use UNISIM.VComponents.all;', '',
    `entity ${spec.name} is`, '  port (', ports.map((p) => `    ${p}`).join(';\n'), '  );', `end ${spec.name};`, '', `architecture wizard of ${spec.name} is`,
    "  signal eoc, eos_i, drdy, den : std_logic := '0';", '  signal channel : std_logic_vector(4 downto 0);', '  signal daddr : std_logic_vector(6 downto 0);', '  signal do_r : std_logic_vector(15 downto 0);',
    '  signal vauxp, vauxn : std_logic_vector(15 downto 0);', "  signal pending : std_logic_vector(4 downto 0) := (others => '0');",
    ...C.map((x) => `  signal ${x.port}_r : std_logic_vector(11 downto 0) := (others => '0');`), 'begin',
    `  vauxp <= ${V.length ? `(${V.map((x) => `${x.ch - 16} => ${x.port}_p`).join(', ')}, others => '0')` : "(others => '0')"};`,
    `  vauxn <= ${V.length ? `(${V.map((x) => `${x.ch - 16} => ${x.port}_n`).join(', ')}, others => '0')` : "(others => '0')"};`,
    '  daddr <= "00" & channel;',
    '  adc : XADC',
    `    generic map (INIT_40 => X"${hex(plan.init[40])}", INIT_41 => X"${hex(plan.init[41])}", INIT_42 => X"${hex(plan.init[42])}", INIT_48 => X"${hex(plan.init[48])}", INIT_49 => X"${hex(plan.init[49])}")`,
    `    port map (DCLK => ${spec.dclk}, RESET => ${spec.reset || "'0'"}, DEN => den, DWE => '0', DADDR => daddr, DI => (others => '0'), DO => do_r, DRDY => drdy,`,
    `              CHANNEL => channel, EOC => eoc, EOS => eos_i, VP => ${vp ? 'vp' : "'0'"}, VN => ${vp ? 'vn' : "'0'"}, VAUXP => vauxp, VAUXN => vauxn,`,
    "              CONVST => '0', CONVSTCLK => '0', ALM => open, OT => open, BUSY => open, MUXADDR => open, JTAGBUSY => open, JTAGLOCKED => open, JTAGMODIFIED => open);",
    '  -- each end of conversion: its channel read over the DRP, its code latched when DRDY comes',
    `  process (${spec.dclk})`, '  begin', `    if rising_edge(${spec.dclk}) then`, '      den <= eoc;', "      if eoc = '1' then pending <= channel; end if;",
    "      if drdy = '1' then", '        case to_integer(unsigned(pending)) is',
    ...C.map((x) => `          when ${x.ch} => ${x.port}_r <= do_r(15 downto 4);`), '          when others => null;', '        end case;', '      end if;', '    end if;', '  end process;',
    ...C.map((x) => `  ${x.port} <= ${x.port}_r;`), ...(spec.eos ? [`  ${spec.eos} <= eos_i;`] : []), 'end wizard;', ''];
  return L.join('\n');
}

function verilogOf(spec, plan) {
  const C = chans(spec), V = vaux(spec), vp = C.some((x) => x.ch === 3);
  const ports = [`input ${spec.dclk}`, ...(spec.reset ? [`input ${spec.reset}`] : []), ...C.map((x) => `output [11:0] ${x.port}`), ...(spec.eos ? [`output ${spec.eos}`] : []),
    ...V.flatMap((x) => [`input ${x.port}_p`, `input ${x.port}_n`]), ...(vp ? ['input vp', 'input vn'] : [])];
  const bus = (s) => `{${Array.from({ length: 16 }, (_, k) => 15 - k).map((k) => { const x = V.find((y) => y.ch - 16 === k); return x ? `${x.port}_${s}` : "1'b0"; }).join(', ')}}`;
  const L = [wizardLine(spec, 'verilog'), ...describe(spec, plan, '//'), '`timescale 1ns / 1ps', '', `module ${spec.name} (`, ports.map((p) => `  ${p}`).join(',\n'), ');',
    '  wire eoc, eos_i, drdy;', '  wire [4:0] channel;', '  wire [15:0] do_r;', "  reg den = 1'b0;", "  reg [4:0] pending = 5'd0;", ...C.map((x) => `  reg [11:0] ${x.port}_r = 12'd0;`),
    `  XADC #(.INIT_40(16'h${hex(plan.init[40])}), .INIT_41(16'h${hex(plan.init[41])}), .INIT_42(16'h${hex(plan.init[42])}), .INIT_48(16'h${hex(plan.init[48])}), .INIT_49(16'h${hex(plan.init[49])})) adc (`,
    `    .DCLK(${spec.dclk}), .RESET(${spec.reset || "1'b0"}), .DEN(den), .DWE(1'b0), .DADDR({2'b00, channel}), .DI(16'd0), .DO(do_r), .DRDY(drdy),`,
    `    .CHANNEL(channel), .EOC(eoc), .EOS(eos_i), .VP(${vp ? 'vp' : "1'b0"}), .VN(${vp ? 'vn' : "1'b0"}), .VAUXP(${bus('p')}), .VAUXN(${bus('n')}),`,
    "    .CONVST(1'b0), .CONVSTCLK(1'b0), .ALM(), .OT(), .BUSY(), .MUXADDR(), .JTAGBUSY(), .JTAGLOCKED(), .JTAGMODIFIED());",
    '  // each end of conversion: its channel read over the DRP, its code latched when DRDY comes',
    `  always @(posedge ${spec.dclk}) begin`, '    den <= eoc;', '    if (eoc) pending <= channel;', '    if (drdy)', '      case (pending)',
    ...C.map((x) => `        5'd${x.ch}: ${x.port}_r <= do_r[15:4];`), '        default: ;', '      endcase', '  end',
    ...C.map((x) => `  assign ${x.port} = ${x.port}_r;`), ...(spec.eos ? [`  assign ${spec.eos} = eos_i;`] : []), 'endmodule', ''];
  return L.join('\n');
}
