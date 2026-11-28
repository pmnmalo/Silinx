// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A register map's FPGA side (#5288; the map: core/regmap.js): its registers behind an SPI or I²C slave, a module named
// as the map, in VHDL and in Verilog. Its ports: clk, the bus's (sck, mosi, miso, ss; or scl, sda, SDA an inout port
// pulled low or released), then each register's (an rw or wo register an output, an ro an input; a strobe <name>_wr an
// output). The bus's lines are sampled with clk (three flip-flops each): clk much faster than the bus's clock (50 MHz
// against 100 kHz, 125 kHz). Isomorphic ES module, no DOM.
//
//   const { code } = generateRegmap(map, { lang: 'vhdl' });

import { regsByAddr, hexByte } from './regmap.js';
import { axiVhdl, axiVerilog } from './regmap-axi.js';

const bin = (v, w) => (v >>> 0).toString(2).padStart(w, '0').slice(-w);
const hex32 = v => `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

// the header: what the module is, its bus's protocol, its registers (an AXI4-Lite slave's too: core/regmap-axi.js)
export function header(m, V) {
  const c = V ? '--' : '//', rule = c + '='.repeat(78), regs = regsByAddr(m);
  const bus = m.bus === 'axi'
    ? [`${c} Bus         : AXI4-Lite slave (s_axi_*), 32-bit data, a 4 KB window at the base address ${hex32(m.base)}: each`,
      `${c}               register a word at its offset, written byte by byte as WSTRB says; responses OKAY`]
    : m.bus === 'spi'
    ? [`${c} Bus         : SPI, mode 0, MSB first, SS low for a transaction: a command byte (R << 7 | address),`,
      `${c}               then the data bytes, the address incremented after each; a read's bytes on MISO from`,
      `${c}               the second byte on`]
    : [`${c} Bus         : I2C at the address ${hexByte(m.address)}: a write [address+W, register, data...], a read [address+W,`,
      `${c}               register] then a repeated START and [address+R, data...]; the register incremented after`,
      `${c}               each byte; SDA pulled low or released, never driven high`];
  const nw = Math.max(4, ...regs.map(r => r.name.length));
  return [rule, `${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`,
    `${c} Description : the registers of the register map ${m.name}.regs.json behind an ${{ spi: 'SPI', i2c: 'I2C', axi: 'AXI4-Lite' }[m.bus]} slave`,
    `${c} Generator   : Silinx register map (edit the map, not this file).`, ...bus,
    m.bus === 'axi' ? `${c} Clock       : s_axi_aclk (rising edge); s_axi_aresetn low the registers' reset` : `${c} Clock       : clk (rising edge), the bus's lines sampled with it`, c, `${c} Registers (address, name, width, access):`,
    ...regs.map(r => `${c}   ${hexByte(r.addr)}  ${r.name.padEnd(nw)}  ${String(r.width).padStart(2)} bit(s)  ${r.access}${r.access === 'ro' ? '' : `  reset ${r.reset}`}${r.strobe ? `, ${r.name}_wr a pulse when written` : ''}`),
    rule];
}

// a register's byte k: its bits [lo, hi], how many
export const byteOf = (r, k) => { const lo = 8 * k, n = Math.min(8, r.width - lo); return { lo, hi: lo + n - 1, n }; };

// ---- VHDL

const vType = w => (w === 1 ? 'STD_LOGIC' : `STD_LOGIC_VECTOR (${w - 1} downto 0)`);
const vLit = (v, w) => (w === 1 ? `'${v & 1}'` : `"${bin(v, w)}"`);
const vAddr = a => `"${bin(a, 7)}"`;
// what a read gives of byte k of r: its bits, zeros above them
function vByte(r, k) {
  if (r.access === 'wo') return '(others => \'0\')';
  const src = r.access === 'ro' ? r.name : `${r.name}_q`, { lo, hi, n } = byteOf(r, k);
  const bits = r.width === 1 ? src : `${src}(${hi} downto ${lo})`;
  return n === 8 ? bits : `"${'0'.repeat(8 - n)}" & ${bits}`;
}
// the writes of the byte `b` at addr: each writable register's byte, its strobe with its last one
function vWrites(regs, b, ind) {
  const out = [`${ind}case addr is`];
  for (const r of regs.filter(x => x.access !== 'ro')) {
    for (let k = 0; k < r.bytes; k++) {
      const { lo, hi, n } = byteOf(r, k);
      const dst = r.width === 1 ? `${r.name}_q` : `${r.name}_q(${hi} downto ${lo})`;
      const src = r.width === 1 ? `${b}(0)` : `${b}(${n - 1} downto 0)`;
      out.push(`${ind}    when ${vAddr(r.addr + k)} => ${dst} <= ${src};${r.strobe && k === r.bytes - 1 ? ` ${r.name}_wr_q <= '1';` : ''}`);
    }
  }
  out.push(`${ind}    when others => null;`, `${ind}end case;`);
  return out;
}

function vhdl(m) {
  const regs = regsByAddr(m), spi = m.bus === 'spi', wr = regs.filter(r => r.access !== 'ro'), st = regs.filter(r => r.strobe);
  const ports = [['clk', 'in', 'STD_LOGIC'], ...(spi ? [['sck', 'in'], ['mosi', 'in'], ['ss', 'in'], ['miso', 'out']] : [['scl', 'in'], ['sda', 'inout']]).map(([n, d]) => [n, d, 'STD_LOGIC']),
    ...regs.map(r => [r.name, r.access === 'ro' ? 'in' : 'out', vType(r.width)]), ...st.map(r => [`${r.name}_wr`, 'out', 'STD_LOGIC'])];
  const pw = Math.max(...ports.map(p => p[0].length)), dw = Math.max(...ports.map(p => p[1].length));
  const L = [...header(m, true), 'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', 'use IEEE.NUMERIC_STD.ALL;', '', `entity ${m.name} is`,
    ...ports.map((p, i) => `${i ? '           ' : '    Port ( '}${p[0].padEnd(pw)} : ${p[1].padEnd(dw)} ${p[2]}${i === ports.length - 1 ? ');' : ';'}`), `end ${m.name};`, '',
    `architecture rtl of ${m.name} is`];
  if (spi) L.push('    signal sck_s, ss_s, mosi_s : STD_LOGIC_VECTOR (2 downto 0) := (others => \'1\');');
  else {
    L.push(`    constant I2C_ADDRESS : STD_LOGIC_VECTOR (6 downto 0) := ${vAddr(m.address)};   -- ${hexByte(m.address)}`,
      '    type state_t is (S_IDLE, S_ADDR, S_PTR, S_WDATA, S_ACK, S_RDATA, S_RACK);', '    signal state, wnext : state_t := S_IDLE;',
      '    signal scl_s, sda_s : STD_LOGIC_VECTOR (2 downto 0) := (others => \'1\');');
  }
  L.push('    signal rx, tx, rbyte : STD_LOGIC_VECTOR (7 downto 0) := (others => \'0\');', '    signal addr : STD_LOGIC_VECTOR (6 downto 0) := (others => \'0\');',
    spi ? '    signal bits : unsigned (2 downto 0) := (others => \'0\');' : '    signal bits : unsigned (3 downto 0) := (others => \'0\');',
    spi ? '    signal first, rd : STD_LOGIC := \'0\';' : '    signal reading, pull, acked : STD_LOGIC := \'0\';',
    ...wr.map(r => `    signal ${r.name}_q : ${vType(r.width)} := ${vLit(r.reset, r.width)};`), ...st.map(r => `    signal ${r.name}_wr_q : STD_LOGIC := '0';`),
    'begin', '    -- the byte a read gives at addr',
    `    process (${['addr', ...regs.filter(r => r.access !== 'wo').map(r => (r.access === 'ro' ? r.name : `${r.name}_q`))].join(', ')})`, '    begin', '        case addr is');
  for (const r of regs) for (let k = 0; k < r.bytes; k++) L.push(`            when ${vAddr(r.addr + k)} => rbyte <= ${vByte(r, k)};`);
  L.push('            when others => rbyte <= (others => \'0\');', '        end case;', '    end process;', '');
  L.push(...(spi ? vSpi(regs, st) : vI2c(regs, st)));
  L.push(spi ? '    miso <= tx(7);' : '    sda <= \'0\' when pull = \'1\' else \'Z\';', ...wr.map(r => `    ${r.name} <= ${r.name}_q;`), ...st.map(r => `    ${r.name}_wr <= ${r.name}_wr_q;`), 'end rtl;', '');
  return L.join('\n');
}

const vInc = 'addr <= std_logic_vector(unsigned(addr) + 1);';
function vSpi(regs, st) {
  return ['    process (clk)', '        variable b : STD_LOGIC_VECTOR (7 downto 0);', '    begin', '        if rising_edge(clk) then',
    '            sck_s <= sck_s(1 downto 0) & sck;', '            ss_s <= ss_s(1 downto 0) & ss;', '            mosi_s <= mosi_s(1 downto 0) & mosi;',
    ...st.map(r => `            ${r.name}_wr_q <= '0';`),
    '            if ss_s(1) = \'1\' then                                  -- not selected', '                first <= \'1\';', '                bits <= (others => \'0\');', '                tx <= (others => \'0\');',
    '            elsif sck_s(2) = \'0\' and sck_s(1) = \'1\' then             -- SCK rising: a bit in', '                b := rx(6 downto 0) & mosi_s(1);', '                rx <= b;', '                bits <= bits + 1;',
    '                if bits = 7 then', '                    if first = \'1\' then                          -- the command: R, the address', '                        first <= \'0\';', '                        rd <= b(7);', '                        addr <= b(6 downto 0);',
    '                    elsif rd = \'0\' then                         -- a byte written', ...vWrites(regs, 'b', '                        '), `                        ${vInc}`, '                    end if;', '                end if;',
    '            elsif sck_s(2) = \'1\' and sck_s(1) = \'0\' then             -- SCK falling: the next bit out', '                if bits = 0 and first = \'0\' and rd = \'1\' then',
    '                    tx <= rbyte;', `                    ${vInc}`, '                else', '                    tx <= tx(6 downto 0) & \'0\';', '                end if;', '            end if;', '        end if;', '    end process;'];
}

function vI2c(regs, st) {
  const load = ind => [`${ind}tx <= rbyte(6 downto 0) & '0';`, `${ind}pull <= not rbyte(7);`, `${ind}${vInc}`, `${ind}bits <= to_unsigned(1, 4);`, `${ind}state <= S_RDATA;`];
  return ['    process (clk)', '        variable rise, fall : boolean;', '    begin', '        if rising_edge(clk) then',
    '            scl_s <= scl_s(1 downto 0) & scl;', '            sda_s <= sda_s(1 downto 0) & sda;', ...st.map(r => `            ${r.name}_wr_q <= '0';`),
    '            rise := scl_s(2) = \'0\' and scl_s(1) = \'1\';', '            fall := scl_s(2) = \'1\' and scl_s(1) = \'0\';',
    '            if scl_s(1) = \'1\' and sda_s(2) = \'1\' and sda_s(1) = \'0\' then      -- START', '                state <= S_ADDR;', '                bits <= (others => \'0\');', '                pull <= \'0\';',
    '            elsif scl_s(1) = \'1\' and sda_s(2) = \'0\' and sda_s(1) = \'1\' then   -- STOP', '                state <= S_IDLE;', '                pull <= \'0\';', '            else', '                case state is',
    '                    when S_ADDR | S_PTR | S_WDATA =>                        -- a byte in', '                        if rise then', '                            rx <= rx(6 downto 0) & sda_s(1);', '                            bits <= bits + 1;',
    '                        elsif fall and bits = 8 then', '                            pull <= \'1\';', '                            state <= S_ACK;', '                            wnext <= S_WDATA;', '                            if state = S_ADDR then',
    '                                reading <= rx(0);', '                                wnext <= S_PTR;', '                                if rx(7 downto 1) /= I2C_ADDRESS then         -- not ours',
    '                                    pull <= \'0\';', '                                    state <= S_IDLE;', '                                end if;', '                            elsif state = S_PTR then                    -- the register',
    '                                addr <= rx(6 downto 0);', '                            else                                        -- a byte written', ...vWrites(regs, 'rx', '                                '),
    `                                ${vInc}`, '                            end if;', '                        end if;', '                    when S_ACK =>                                           -- our ACK, then the next byte',
    '                        if fall then', '                            bits <= (others => \'0\');', '                            if reading = \'1\' then', ...load('                                '),
    '                            else', '                                pull <= \'0\';', '                                state <= wnext;', '                            end if;', '                        end if;',
    '                    when S_RDATA =>                                         -- a byte out', '                        if fall then', '                            if bits = 8 then', '                                pull <= \'0\';', '                                state <= S_RACK;',
    '                            else', '                                pull <= not tx(7);', '                                tx <= tx(6 downto 0) & \'0\';', '                                bits <= bits + 1;', '                            end if;', '                        end if;',
    '                    when S_RACK =>                                          -- the master\'s ACK: one more byte', '                        if rise then', '                            acked <= not sda_s(1);', '                        elsif fall then',
    '                            if acked = \'1\' then', ...load('                                '), '                            else', '                                state <= S_IDLE;', '                            end if;', '                        end if;',
    '                    when S_IDLE =>', '                        null;', '                end case;', '            end if;', '        end if;', '    end process;'];
}

// ---- Verilog

const gRange = w => (w === 1 ? '' : `[${w - 1}:0] `);
const gAddr = a => `7'd${a}`;
function gByte(r, k) {
  if (r.access === 'wo') return '8\'h00';
  const { lo, hi, n } = byteOf(r, k), bits = r.width === 1 ? r.name : `${r.name}[${hi}:${lo}]`;
  return n === 8 ? bits : `{${8 - n}'b0, ${bits}}`;
}
function gWrites(regs, b, ind) {
  const out = [`${ind}case (addr)`];
  for (const r of regs.filter(x => x.access !== 'ro')) {
    for (let k = 0; k < r.bytes; k++) {
      const { lo, hi, n } = byteOf(r, k);
      const dst = r.width === 1 ? r.name : `${r.name}[${hi}:${lo}]`, src = r.width === 1 ? `${b}[0]` : `${b}[${n - 1}:0]`;
      out.push(r.strobe && k === r.bytes - 1 ? `${ind}    ${gAddr(r.addr + k)}: begin ${dst} <= ${src}; ${r.name}_wr <= 1'b1; end` : `${ind}    ${gAddr(r.addr + k)}: ${dst} <= ${src};`);
    }
  }
  out.push(`${ind}    default: ;`, `${ind}endcase`);
  return out;
}

function verilog(m) {
  const regs = regsByAddr(m), spi = m.bus === 'spi', st = regs.filter(r => r.strobe);
  const ports = [['input  wire', 'clk'], ...(spi ? [['input  wire', 'sck'], ['input  wire', 'mosi'], ['input  wire', 'ss'], ['output wire', 'miso']] : [['input  wire', 'scl'], ['inout  wire', 'sda']]),
    ...regs.map(r => (r.access === 'ro' ? [`input  wire ${gRange(r.width)}`.trimEnd(), r.name] : [`output reg  ${gRange(r.width)}`.trimEnd(), `${r.name} = ${r.width}'d${r.reset}`])),
    ...st.map(r => ['output reg ', `${r.name}_wr = 1'b0`])];
  const tw = Math.max(...ports.map(p => p[0].length));
  const L = [...header(m, false), `module ${m.name} (`, ...ports.map((p, i) => `    ${p[0].padEnd(tw)} ${p[1]}${i === ports.length - 1 ? '' : ','}`), ');'];
  if (spi) L.push('    reg  [2:0] sck_s = 3\'b111, ss_s = 3\'b111, mosi_s = 3\'b111;');
  else {
    L.push(`    localparam [6:0] I2C_ADDRESS = ${gAddr(m.address)};   // ${hexByte(m.address)}`,
      '    localparam [2:0] S_IDLE = 3\'d0, S_ADDR = 3\'d1, S_PTR = 3\'d2, S_WDATA = 3\'d3, S_ACK = 3\'d4, S_RDATA = 3\'d5, S_RACK = 3\'d6;',
      '    reg  [2:0] state = S_IDLE, wnext = S_IDLE;', '    reg  [2:0] scl_s = 3\'b111, sda_s = 3\'b111;');
  }
  L.push('    reg  [7:0] rx = 8\'h00, tx = 8\'h00, rbyte;', '    reg  [6:0] addr = 7\'d0;', spi ? '    reg  [2:0] bits = 3\'d0;' : '    reg  [3:0] bits = 4\'d0;',
    spi ? '    reg        first = 1\'b0, rd = 1\'b0;' : '    reg        reading = 1\'b0, pull = 1\'b0, acked = 1\'b0;',
    ...(spi ? ['    wire [7:0] b = {rx[6:0], mosi_s[1]};'] : ['    wire       rise = !scl_s[2] && scl_s[1], fall = scl_s[2] && !scl_s[1];']),
    '', '    // the byte a read gives at addr', '    always @* begin', '        case (addr)');
  for (const r of regs) for (let k = 0; k < r.bytes; k++) L.push(`            ${gAddr(r.addr + k)}: rbyte = ${gByte(r, k)};`);
  L.push('            default: rbyte = 8\'h00;', '        endcase', '    end', '', ...(spi ? gSpi(regs, st) : gI2c(regs, st)),
    spi ? '    assign miso = tx[7];' : '    assign sda = pull ? 1\'b0 : 1\'bz;', 'endmodule', '');
  return L.join('\n');
}

function gSpi(regs, st) {
  return ['    always @(posedge clk) begin', '        sck_s <= {sck_s[1:0], sck};', '        ss_s <= {ss_s[1:0], ss};', '        mosi_s <= {mosi_s[1:0], mosi};', ...st.map(r => `        ${r.name}_wr <= 1'b0;`),
    '        if (ss_s[1]) begin                                   // not selected', '            first <= 1\'b1;', '            bits <= 3\'d0;', '            tx <= 8\'h00;',
    '        end else if (!sck_s[2] && sck_s[1]) begin            // SCK rising: a bit in', '            rx <= b;', '            bits <= bits + 3\'d1;', '            if (bits == 3\'d7) begin',
    '                if (first) begin                             // the command: R, the address', '                    first <= 1\'b0;', '                    rd <= b[7];', '                    addr <= b[6:0];',
    '                end else if (!rd) begin                      // a byte written', ...gWrites(regs, 'b', '                    '), '                    addr <= addr + 7\'d1;', '                end', '            end',
    '        end else if (sck_s[2] && !sck_s[1]) begin            // SCK falling: the next bit out', '            if (bits == 3\'d0 && !first && rd) begin', '                tx <= rbyte;', '                addr <= addr + 7\'d1;',
    '            end else', '                tx <= {tx[6:0], 1\'b0};', '        end', '    end'];
}

function gI2c(regs, st) {
  const load = ind => [`${ind}tx <= {rbyte[6:0], 1'b0};`, `${ind}pull <= !rbyte[7];`, `${ind}addr <= addr + 7'd1;`, `${ind}bits <= 4'd1;`, `${ind}state <= S_RDATA;`];
  return ['    always @(posedge clk) begin', '        scl_s <= {scl_s[1:0], scl};', '        sda_s <= {sda_s[1:0], sda};', ...st.map(r => `        ${r.name}_wr <= 1'b0;`),
    '        if (scl_s[1] && sda_s[2] && !sda_s[1]) begin             // START', '            state <= S_ADDR;', '            bits <= 4\'d0;', '            pull <= 1\'b0;',
    '        end else if (scl_s[1] && !sda_s[2] && sda_s[1]) begin    // STOP', '            state <= S_IDLE;', '            pull <= 1\'b0;', '        end else begin', '            case (state)',
    '                S_ADDR, S_PTR, S_WDATA:                              // a byte in', '                    if (rise) begin', '                        rx <= {rx[6:0], sda_s[1]};', '                        bits <= bits + 4\'d1;',
    '                    end else if (fall && bits == 4\'d8) begin', '                        pull <= 1\'b1;', '                        state <= S_ACK;', '                        wnext <= S_WDATA;', '                        if (state == S_ADDR) begin',
    '                            reading <= rx[0];', '                            wnext <= S_PTR;', '                            if (rx[7:1] != I2C_ADDRESS) begin       // not ours', '                                pull <= 1\'b0;', '                                state <= S_IDLE;', '                            end',
    '                        end else if (state == S_PTR)                 // the register', '                            addr <= rx[6:0];', '                        else begin                                   // a byte written',
    ...gWrites(regs, 'rx', '                            '), '                            addr <= addr + 7\'d1;', '                        end', '                    end',
    '                S_ACK:                                               // our ACK, then the next byte', '                    if (fall) begin', '                        bits <= 4\'d0;', '                        if (reading) begin', ...load('                            '),
    '                        end else begin', '                            pull <= 1\'b0;', '                            state <= wnext;', '                        end', '                    end',
    '                S_RDATA:                                             // a byte out', '                    if (fall) begin', '                        if (bits == 4\'d8) begin', '                            pull <= 1\'b0;', '                            state <= S_RACK;',
    '                        end else begin', '                            pull <= !tx[7];', '                            tx <= {tx[6:0], 1\'b0};', '                            bits <= bits + 4\'d1;', '                        end', '                    end',
    '                S_RACK:                                              // the master\'s ACK: one more byte', '                    if (rise)', '                        acked <= !sda_s[1];', '                    else if (fall) begin',
    '                        if (acked) begin', ...load('                            '), '                        end else', '                            state <= S_IDLE;', '                    end',
    '                default: ;', '            endcase', '        end', '    end'];
}

/** The map's module: { code, file: '<name>.vhd' | '<name>.v' } (lang: 'vhdl' or 'verilog'). The map is checked first
 *  (core/regmap.js checkRegmap): a map with errors gives a module that may not compile. */
export function generateRegmap(m, { lang = 'vhdl' } = {}) {
  const V = lang === 'vhdl';
  // (an AXI4-Lite slave, a Zynq's PL seen by its PS, #4688: core/regmap-axi.js)
  if (m.bus === 'axi') return { code: V ? axiVhdl(m) : axiVerilog(m), file: `${m.name}.${V ? 'vhd' : 'v'}` };
  return { code: V ? vhdl(m) : verilog(m), file: `${m.name}.${V ? 'vhd' : 'v'}` };
}
