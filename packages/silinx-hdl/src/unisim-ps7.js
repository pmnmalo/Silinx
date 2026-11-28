// Silinx - the Zynq-7000's processing system's primitive (#4688): the PS7, the hard block a Zynq node's PL top instantiates
// (core/zynq-pl-top.js), as Silinx's front end checks it, simulates it and passes it to the synthesis (Yosys's cells_xtra.v
// knows it; nextpnr's xilinx arch places it in its PSS2 tile). Silinx's own model, from UG585's port list: not the A9 (the
// PS's program is not simulated here, #4689), but its clock and reset as the PL sees them: FCLK_CLK0 a clock of
// FCLK0_PERIOD (50 MHz, Silinx's ps7_init's on the Zybo Z7, by default), FCLK_RESET0_N released after four of its periods;
// M_AXI_GP0 idle (no access: its VALIDs and READYs low). Its fixed IO (MIO, DDR*, PS*) are its own pins: not driven. The
// BIBUF, the buffer Vivado puts between them and the top's ports: nothing in a simulation. No timing; the Xilinx UNISIM
// sources are not used (nor redistributed).

const vec = (n, w, dir) => `${n} : ${dir} std_logic_vector(${w - 1} downto 0)`;
const bit = (n, dir) => `${n} : ${dir} std_logic`;
const FIXED = [['MIO', 54], ['PSCLK', 1], ['PSPORB', 1], ['PSSRSTB', 1], ['DDRA', 15], ['DDRBA', 3], ['DDRCASB', 1], ['DDRCKE', 1], ['DDRCKN', 1], ['DDRCKP', 1],
  ['DDRCSB', 1], ['DDRDM', 4], ['DDRDQ', 32], ['DDRDQSN', 4], ['DDRDQSP', 4], ['DDRDRSTB', 1], ['DDRODT', 1], ['DDRRASB', 1], ['DDRVRN', 1], ['DDRVRP', 1], ['DDRWEB', 1]];
// M_AXI_GP0's ports: [name, the PS7's direction, width]
const GP0 = [['ARADDR', 'out', 32], ['ARBURST', 'out', 2], ['ARCACHE', 'out', 4], ['ARESETN', 'out', 1], ['ARID', 'out', 12], ['ARLEN', 'out', 4], ['ARLOCK', 'out', 2],
  ['ARPROT', 'out', 3], ['ARQOS', 'out', 4], ['ARSIZE', 'out', 2], ['ARVALID', 'out', 1], ['AWADDR', 'out', 32], ['AWBURST', 'out', 2], ['AWCACHE', 'out', 4], ['AWID', 'out', 12],
  ['AWLEN', 'out', 4], ['AWLOCK', 'out', 2], ['AWPROT', 'out', 3], ['AWQOS', 'out', 4], ['AWSIZE', 'out', 2], ['AWVALID', 'out', 1], ['BREADY', 'out', 1], ['RREADY', 'out', 1],
  ['WDATA', 'out', 32], ['WID', 'out', 12], ['WLAST', 'out', 1], ['WSTRB', 'out', 4], ['WVALID', 'out', 1],
  ['ACLK', 'in', 1], ['ARREADY', 'in', 1], ['AWREADY', 'in', 1], ['BID', 'in', 12], ['BRESP', 'in', 2], ['BVALID', 'in', 1], ['RDATA', 'in', 32], ['RID', 'in', 12],
  ['RLAST', 'in', 1], ['RRESP', 'in', 2], ['RVALID', 'in', 1], ['WREADY', 'in', 1]];

const ports = [...FIXED.map(([n, w]) => (w === 1 ? bit(n, 'inout') : vec(n, w, 'inout'))), vec('FCLKCLK', 4, 'out'), vec('FCLKRESETN', 4, 'out'),
  ...GP0.map(([n, d, w]) => (w === 1 ? bit(`MAXIGP0${n}`, d) : vec(`MAXIGP0${n}`, w, d)))];

/** The PS7's and the BIBUF's models (VHDL), UNISIM's. */
export const UNISIM_PS7_VHDL = `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity PS7 is
  generic (FCLK0_PERIOD : time := 20 ns);
  port (
    ${ports.join(';\n    ')});
end PS7;
architecture silinx of PS7 is
  signal clk0 : std_logic := '0';
  signal rst0 : std_logic := '0';
begin
  clk0 <= not clk0 after FCLK0_PERIOD / 2;
  rst0 <= '1' after 4 * FCLK0_PERIOD;
  FCLKCLK <= "000" & clk0;
  FCLKRESETN <= "000" & rst0;
${GP0.filter(([, d]) => d === 'out').map(([n, , w]) => `  MAXIGP0${n} <= ${w === 1 ? (n === 'ARESETN' ? 'rst0' : "'0'") : '(others => \'0\')'};`).join('\n')}
end silinx;

library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity BIBUF is
  port (IO : inout std_logic; PAD : inout std_logic);
end BIBUF;
architecture silinx of BIBUF is
begin
end silinx;
`;
