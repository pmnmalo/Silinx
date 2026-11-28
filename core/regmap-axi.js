// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A register map's FPGA side on AXI4-Lite (#4688; the map: core/regmap.js, its SPI and I²C slaves core/regmap-hdl.js): a
// Zynq's PL registers seen by its PS's program, through its M_AXI_GP0, an AXI4-Lite slave named as the map, in VHDL and in
// Verilog. Its ports: s_axi_aclk, s_axi_aresetn, the AXI4-Lite channels (s_axi_aw*, w*, b*, ar*, r*: a 12-bit address, 4 KB),
// then each register's (an rw or wo register an output, an ro an input; a strobe <name>_wr an output, a pulse of one
// clock when its word is written). As Xilinx's AXI4-Lite slave template has it: a write taken when its address and its
// data are both valid (the address latched), written byte by byte as WSTRB says, then its response; a read's address
// latched, its data the next clock; every response OKAY; s_axi_aresetn low the registers' reset. A register is the word
// at its offset, its bits from bit 0, the others read as 0. Isomorphic ES module, no DOM.
import { regsByAddr } from './regmap.js';
import { header, byteOf } from './regmap-hdl.js';

const AW = 12;   // (the 4 KB window's address bits)
const bin = (v, w) => (v >>> 0).toString(2).padStart(w, '0').slice(-w);
const word = (r) => r.addr >>> 2;
// the AXI4-Lite channels' ports: [name, dir, width] (the slave's view)
const AXI = [['awaddr', 'in', AW], ['awvalid', 'in', 1], ['awready', 'out', 1], ['wdata', 'in', 32], ['wstrb', 'in', 4], ['wvalid', 'in', 1], ['wready', 'out', 1],
  ['bresp', 'out', 2], ['bvalid', 'out', 1], ['bready', 'in', 1], ['araddr', 'in', AW], ['arvalid', 'in', 1], ['arready', 'out', 1], ['rdata', 'out', 32],
  ['rresp', 'out', 2], ['rvalid', 'out', 1], ['rready', 'in', 1]].map(([n, d, w]) => [`s_axi_${n}`, d, w]);

// ---- VHDL

const vType = (w) => (w === 1 ? 'STD_LOGIC' : `STD_LOGIC_VECTOR (${w - 1} downto 0)`);
const vLit = (v, w) => (w === 1 ? `'${v & 1}'` : `"${bin(v, w)}"`);
// a register's value read as a 32-bit word: its bits, zeros above them (the word cleared, then its bits)
const vWord = (r) => {
  if (r.access === 'wo') return 'axi_rdata <= (others => \'0\');';
  const src = r.access === 'ro' ? r.name : `${r.name}_q`;
  return r.width === 32 ? `axi_rdata <= ${src};` : `axi_rdata <= (others => '0'); axi_rdata(${r.width === 1 ? '0' : `${r.width - 1} downto 0`}) <= ${src};`;
};

/** The map's AXI4-Lite slave in VHDL. */
export function axiVhdl(m) {
  const regs = regsByAddr(m), wr = regs.filter((r) => r.access !== 'ro'), st = regs.filter((r) => r.strobe);
  const ports = [['s_axi_aclk', 'in', 'STD_LOGIC'], ['s_axi_aresetn', 'in', 'STD_LOGIC'], ...AXI.map(([n, d, w]) => [n, d, vType(w)]),
    ...regs.map((r) => [r.name, r.access === 'ro' ? 'in' : 'out', vType(r.width)]), ...st.map((r) => [`${r.name}_wr`, 'out', 'STD_LOGIC'])];
  const pw = Math.max(...ports.map((p) => p[0].length)), dw = Math.max(...ports.map((p) => p[1].length));
  const resets = [...wr.map((r) => `${r.name}_q <= ${vLit(r.reset, r.width)};`), ...st.map((r) => `${r.name}_wr_q <= '0';`)];
  const writes = wr.map((r) => {
    const bytes = Array.from({ length: r.bytes }, (_, k) => {
      const { lo, hi } = byteOf(r, k);
      const dst = r.width === 1 ? `${r.name}_q` : `${r.name}_q(${hi} downto ${lo})`, src = r.width === 1 ? `s_axi_wdata(${lo})` : `s_axi_wdata(${hi} downto ${lo})`;
      return `                        if s_axi_wstrb(${k}) = '1' then ${dst} <= ${src}; end if;`;
    });
    return [`                    when "${bin(word(r), AW - 2)}" =>`, ...bytes, ...(r.strobe ? [`                        ${r.name}_wr_q <= '1';`] : [])];
  }).flat();
  const L = [...header(m, true), 'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', '', `entity ${m.name} is`,
    ...ports.map((p, i) => `${i ? '           ' : '    Port ( '}${p[0].padEnd(pw)} : ${p[1].padEnd(dw)} ${p[2]}${i === ports.length - 1 ? ');' : ';'}`), `end ${m.name};`, '',
    `architecture rtl of ${m.name} is`,
    `    signal axi_awaddr, axi_araddr : STD_LOGIC_VECTOR (${AW - 1} downto 0) := (others => '0');`,
    '    signal axi_awready, axi_wready, axi_bvalid, axi_arready, axi_rvalid : STD_LOGIC := \'0\';',
    '    signal axi_aw_en : STD_LOGIC := \'1\';', '    signal axi_wr : STD_LOGIC;', '    signal axi_rdata : STD_LOGIC_VECTOR (31 downto 0) := (others => \'0\');',
    ...wr.map((r) => `    signal ${r.name}_q : ${vType(r.width)} := ${vLit(r.reset, r.width)};`), ...st.map((r) => `    signal ${r.name}_wr_q : STD_LOGIC := '0';`),
    'begin', '    -- a write: its address and its data both taken', '    axi_wr <= axi_awready and s_axi_awvalid and axi_wready and s_axi_wvalid;', '',
    '    process (s_axi_aclk)', '    begin', '        if rising_edge(s_axi_aclk) then', '            if s_axi_aresetn = \'0\' then',
    '                axi_awready <= \'0\';', '                axi_wready <= \'0\';', '                axi_bvalid <= \'0\';', '                axi_aw_en <= \'1\';',
    ...resets.map((s) => `                ${s}`), '            else', ...st.map((r) => `                ${r.name}_wr_q <= '0';`),
    '                if axi_awready = \'0\' and s_axi_awvalid = \'1\' and s_axi_wvalid = \'1\' and axi_aw_en = \'1\' then',
    '                    axi_awready <= \'1\';', '                    axi_awaddr <= s_axi_awaddr;', '                    axi_aw_en <= \'0\';',
    '                elsif s_axi_bready = \'1\' and axi_bvalid = \'1\' then', '                    axi_aw_en <= \'1\';', '                    axi_awready <= \'0\';',
    '                else', '                    axi_awready <= \'0\';', '                end if;',
    '                if axi_wready = \'0\' and s_axi_wvalid = \'1\' and s_axi_awvalid = \'1\' and axi_aw_en = \'1\' then', '                    axi_wready <= \'1\';',
    '                else', '                    axi_wready <= \'0\';', '                end if;',
    '                if axi_wr = \'1\' then', `                    case axi_awaddr(${AW - 1} downto 2) is`, ...writes.map((s) => s.replace(/^ {20}/, '                        ').replace(/^ {24}(?=when)/, '                        ')),
    '                        when others => null;', '                    end case;', '                end if;',
    '                if axi_wr = \'1\' and axi_bvalid = \'0\' then', '                    axi_bvalid <= \'1\';',
    '                elsif s_axi_bready = \'1\' and axi_bvalid = \'1\' then', '                    axi_bvalid <= \'0\';', '                end if;',
    '            end if;', '        end if;', '    end process;', '',
    '    -- a read: its address taken, its data the next clock', '    process (s_axi_aclk)', '    begin', '        if rising_edge(s_axi_aclk) then',
    '            if s_axi_aresetn = \'0\' then', '                axi_arready <= \'0\';', '                axi_rvalid <= \'0\';', '            else',
    '                if axi_arready = \'0\' and s_axi_arvalid = \'1\' then', '                    axi_arready <= \'1\';', '                    axi_araddr <= s_axi_araddr;',
    '                else', '                    axi_arready <= \'0\';', '                end if;',
    '                if axi_arready = \'1\' and s_axi_arvalid = \'1\' and axi_rvalid = \'0\' then', '                    axi_rvalid <= \'1\';',
    `                    case axi_araddr(${AW - 1} downto 2) is`, ...regs.map((r) => `                        when "${bin(word(r), AW - 2)}" => ${vWord(r)}`),
    '                        when others => axi_rdata <= (others => \'0\');', '                    end case;',
    '                elsif axi_rvalid = \'1\' and s_axi_rready = \'1\' then', '                    axi_rvalid <= \'0\';', '                end if;',
    '            end if;', '        end if;', '    end process;', '',
    '    s_axi_awready <= axi_awready;', '    s_axi_wready <= axi_wready;', '    s_axi_bvalid <= axi_bvalid;', '    s_axi_bresp <= "00";',
    '    s_axi_arready <= axi_arready;', '    s_axi_rvalid <= axi_rvalid;', '    s_axi_rdata <= axi_rdata;', '    s_axi_rresp <= "00";',
    ...wr.map((r) => `    ${r.name} <= ${r.name}_q;`), ...st.map((r) => `    ${r.name}_wr <= ${r.name}_wr_q;`), 'end rtl;', ''];
  return L.join('\n');
}

// ---- Verilog

const gRange = (w) => (w === 1 ? '' : `[${w - 1}:0]`);
const gWord = (r) => (r.access === 'wo' ? '32\'h00000000' : r.width === 32 ? r.name : `{${32 - r.width}'b0, ${r.name}}`);

/** The map's AXI4-Lite slave in Verilog. */
export function axiVerilog(m) {
  const regs = regsByAddr(m), wr = regs.filter((r) => r.access !== 'ro'), st = regs.filter((r) => r.strobe);
  const ports = [['input  wire', 's_axi_aclk'], ['input  wire', 's_axi_aresetn'],
    ...AXI.map(([n, d, w]) => [`${d === 'in' ? 'input  wire' : ['s_axi_bresp', 's_axi_rresp'].includes(n) ? 'output wire' : 'output reg '} ${gRange(w)}`.trimEnd(), `${n}${d === 'out' && !['s_axi_bresp', 's_axi_rresp'].includes(n) ? ` = ${w}'d0` : ''}`]),
    ...regs.map((r) => (r.access === 'ro' ? [`input  wire ${gRange(r.width)}`.trimEnd(), r.name] : [`output reg  ${gRange(r.width)}`.trimEnd(), `${r.name} = ${r.width}'d${r.reset}`])),
    ...st.map((r) => ['output reg ', `${r.name}_wr = 1'b0`])];
  const tw = Math.max(...ports.map((p) => p[0].length));
  const writes = wr.map((r) => {
    const bytes = Array.from({ length: r.bytes }, (_, k) => {
      const { lo, hi } = byteOf(r, k);
      const dst = r.width === 1 ? r.name : `${r.name}[${hi}:${lo}]`, src = r.width === 1 ? `s_axi_wdata[${lo}]` : `s_axi_wdata[${hi}:${lo}]`;
      return `if (s_axi_wstrb[${k}]) ${dst} <= ${src};`;
    });
    return `                    ${AW - 2}'d${word(r)}: begin ${[...bytes, ...(r.strobe ? [`${r.name}_wr <= 1'b1;`] : [])].join(' ')} end`;
  });
  const L = [...header(m, false), `module ${m.name} (`, ...ports.map((p, i) => `    ${p[0].padEnd(tw)} ${p[1]}${i === ports.length - 1 ? '' : ','}`), ');',
    `    reg  [${AW - 1}:0] axi_awaddr = ${AW}'d0, axi_araddr = ${AW}'d0;`, '    reg         axi_aw_en = 1\'b1;',
    '    // a write: its address and its data both taken', '    wire        axi_wr = s_axi_awready && s_axi_awvalid && s_axi_wready && s_axi_wvalid;',
    '    assign s_axi_bresp = 2\'b00;', '    assign s_axi_rresp = 2\'b00;', '',
    '    always @(posedge s_axi_aclk) begin', '        if (!s_axi_aresetn) begin',
    '            s_axi_awready <= 1\'b0;', '            s_axi_wready <= 1\'b0;', '            s_axi_bvalid <= 1\'b0;', '            axi_aw_en <= 1\'b1;',
    ...wr.map((r) => `            ${r.name} <= ${r.width}'d${r.reset};`), ...st.map((r) => `            ${r.name}_wr <= 1'b0;`), '        end else begin',
    ...st.map((r) => `            ${r.name}_wr <= 1'b0;`),
    '            if (!s_axi_awready && s_axi_awvalid && s_axi_wvalid && axi_aw_en) begin', '                s_axi_awready <= 1\'b1;', '                axi_awaddr <= s_axi_awaddr;', '                axi_aw_en <= 1\'b0;',
    '            end else if (s_axi_bready && s_axi_bvalid) begin', '                axi_aw_en <= 1\'b1;', '                s_axi_awready <= 1\'b0;',
    '            end else', '                s_axi_awready <= 1\'b0;',
    '            s_axi_wready <= !s_axi_wready && s_axi_wvalid && s_axi_awvalid && axi_aw_en;',
    '            if (axi_wr) begin', `                case (axi_awaddr[${AW - 1}:2])`, ...writes, '                    default: ;', '                endcase', '            end',
    '            if (axi_wr && !s_axi_bvalid)', '                s_axi_bvalid <= 1\'b1;', '            else if (s_axi_bready && s_axi_bvalid)', '                s_axi_bvalid <= 1\'b0;',
    '        end', '    end', '',
    '    // a read: its address taken, its data the next clock', '    always @(posedge s_axi_aclk) begin', '        if (!s_axi_aresetn) begin',
    '            s_axi_arready <= 1\'b0;', '            s_axi_rvalid <= 1\'b0;', '        end else begin',
    '            if (!s_axi_arready && s_axi_arvalid) begin', '                s_axi_arready <= 1\'b1;', '                axi_araddr <= s_axi_araddr;',
    '            end else', '                s_axi_arready <= 1\'b0;',
    '            if (s_axi_arready && s_axi_arvalid && !s_axi_rvalid) begin', '                s_axi_rvalid <= 1\'b1;', `                case (axi_araddr[${AW - 1}:2])`,
    ...regs.map((r) => `                    ${AW - 2}'d${word(r)}: s_axi_rdata <= ${gWord(r)};`), '                    default: s_axi_rdata <= 32\'h00000000;', '                endcase',
    '            end else if (s_axi_rvalid && s_axi_rready)', '                s_axi_rvalid <= 1\'b0;', '        end', '    end', 'endmodule', ''];
  return L.join('\n');
}
