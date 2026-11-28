// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq node's PL top (#4688, part 2): Silinx writes it, as Vivado's processing_system7 wrapper and a block design would,
// with no block design. It holds:
//   - the PS7, the processing system's hard block (its fixed IO, the MIO and the DDR's, brought out to top-level ports
//     through BIBUFs, as the PS's pins are; FCLK_CLK0 through a BUFG, FCLK_RESET0_N the PL's reset);
//   - its M_AXI_GP0 (AXI3, 32 bits) bridged to AXI4-Lite: the PS's word accesses are single beats; a write's and a read's
//     ID kept and given back with its response, RLAST always high; the address's low 12 bits the slave's;
//   - the register map's AXI4-Lite slave (core/regmap-axi.js), clocked by FCLK_CLK0;
//   - the student's module: its ports named as the map's registers wired to them (an rw or wo register, or a strobe
//     <name>_wr, to an input of the same width; an ro register from an output), a port `clk` not on a board's pin given
//     FCLK_CLK0, every other port a port of the top (the board's pins).
// The PS7's port names are UG585's and Vivado's unisim PS7's (MAXIGP0*, FCLKCLK, FCLKRESETN, MIO, DDR*, PSCLK, PSPORB,
// PSSRSTB). The top is built by Vivado (the PS7 a hard block); the PS is set up by Silinx's ps7_init over JTAG
// (core/zynq-ps7.js, its post-configuration once the PL is configured). Isomorphic ES module, no DOM.
//
//   const { code, file, top, errors } = zynqPlTop({ module: { name, ports: [{ name, dir, width }] }, map, pins, lang });

// the PS7's fixed IO: [the top's port, the PS7's port, width]
const FIXED = [['FIXED_IO_mio', 'MIO', 54], ['FIXED_IO_ps_clk', 'PSCLK', 1], ['FIXED_IO_ps_porb', 'PSPORB', 1], ['FIXED_IO_ps_srstb', 'PSSRSTB', 1],
  ['DDR_addr', 'DDRA', 15], ['DDR_ba', 'DDRBA', 3], ['DDR_cas_n', 'DDRCASB', 1], ['DDR_cke', 'DDRCKE', 1], ['DDR_ck_n', 'DDRCKN', 1], ['DDR_ck_p', 'DDRCKP', 1],
  ['DDR_cs_n', 'DDRCSB', 1], ['DDR_dm', 'DDRDM', 4], ['DDR_dq', 'DDRDQ', 32], ['DDR_dqs_n', 'DDRDQSN', 4], ['DDR_dqs_p', 'DDRDQSP', 4], ['DDR_reset_n', 'DDRDRSTB', 1],
  ['DDR_odt', 'DDRODT', 1], ['DDR_ras_n', 'DDRRASB', 1], ['DDR_vrn', 'DDRVRN', 1], ['DDR_vrp', 'DDRVRP', 1], ['DDR_we_n', 'DDRWEB', 1]];
// M_AXI_GP0's signals the bridge uses: [its name, the PS7's direction (out: the PS drives it), width]
export const GP0 = [['ARADDR', 'out', 32], ['ARID', 'out', 12], ['ARVALID', 'out', 1], ['AWADDR', 'out', 32], ['AWID', 'out', 12], ['AWVALID', 'out', 1],
  ['BREADY', 'out', 1], ['RREADY', 'out', 1], ['WDATA', 'out', 32], ['WSTRB', 'out', 4], ['WVALID', 'out', 1],
  ['ACLK', 'in', 1], ['ARREADY', 'in', 1], ['AWREADY', 'in', 1], ['BID', 'in', 12], ['BRESP', 'in', 2], ['BVALID', 'in', 1],
  ['RDATA', 'in', 32], ['RID', 'in', 12], ['RLAST', 'in', 1], ['RRESP', 'in', 2], ['RVALID', 'in', 1], ['WREADY', 'in', 1]];
const gp = (s) => `gp0_${s.toLowerCase()}`;

/**
 * How the module's ports meet the map's registers: { slave: [[the slave's port, the module's port]], fclk (the module's
 * clk to FCLK_CLK0), board: [the module's ports to the top], errors }.
 */
export function plTopWiring(module, map, pins = {}) {
  const errors = [], slave = [], used = new Set();
  const port = (n) => module.ports.find((p) => p.name.toLowerCase() === n.toLowerCase());
  const want = [...map.registers.map((r) => [r.name, r.access === 'ro' ? 'out' : 'in', r.width, r.name]),
    ...map.registers.filter((r) => r.strobe && r.access !== 'ro').map((r) => [`${r.name}_wr`, 'in', 1, `${r.name}'s strobe`])];
  for (const [name, dir, width, what] of want) {
    const p = port(name);
    if (!p) { errors.push(`the module ${module.name} has no port ${name} for the register map ${map.name}'s ${what}`); continue; }
    if (p.dir !== dir) { errors.push(`${module.name}'s ${p.name} is an ${p.dir === 'in' ? 'input' : 'output'}: the register map ${map.name}'s ${what} is ${dir === 'in' ? 'written by the PS, an input of the module' : 'read by the PS, an output of the module'}`); continue; }
    if ((p.width ?? 1) !== width) { errors.push(`${module.name}'s ${p.name} is ${p.width ?? 1} bit(s), the register map ${map.name}'s ${what} ${width}`); continue; }
    slave.push([name, p.name]); used.add(p.name);
  }
  const clk = port('clk');
  const fclk = clk && clk.dir === 'in' && (clk.width ?? 1) === 1 && !Object.keys(pins).some((k) => k.toLowerCase() === 'clk') ? clk.name : null;
  if (fclk) used.add(fclk);
  return { slave, fclk, board: module.ports.filter((p) => !used.has(p.name)), errors };
}

const vRange = (w) => (w === 1 ? '' : `[${w - 1}:0]`);

function verilog(top, module, map, w, fixedIo) {
  const FX = fixedIo ? FIXED : [];
  const L = [`// ${top}: the Zynq PL's top of ${module.name}, written by Silinx (#4688): the PS7, its M_AXI_GP0 bridged to the register`,
    `// map ${map.name}'s AXI4-Lite slave, and the module. Generated (edit the map and the module, not this file).`, `module ${top} (`];
  const ports = [...FX.map(([n, , wd]) => `    inout  wire ${vRange(wd).padEnd(7)}${n}`), ...w.board.map((p) => `    ${p.dir === 'in' ? 'input ' : p.dir === 'out' ? 'output' : 'inout '} wire ${vRange(p.width ?? 1).padEnd(7)}${p.name}`)];
  L.push(ports.join(',\n'), ');');
  L.push(...FX.map(([, ps, wd]) => `    wire ${vRange(wd).padEnd(7)}ps_${ps.toLowerCase()};`),
    '    wire [3:0]  fclk_clk, fclk_resetn;', '    wire        fclk;', ...GP0.map(([s, , wd]) => `    wire ${vRange(wd).padEnd(7)}${gp(s)};`),
    '    reg  [11:0] gp0_awid_q = 12\'d0, gp0_arid_q = 12\'d0;', '',
    `    // the PS7: ${fixedIo ? 'its fixed IO through BIBUFs, ' : 'its fixed IO the PS\'s own pins (none in this flow), '}FCLK_CLK0 through a BUFG`,
    '    PS7 ps7_i (', [...FX.map(([, ps]) => `        .${ps}(ps_${ps.toLowerCase()})`), '        .FCLKCLK(fclk_clk)', '        .FCLKRESETN(fclk_resetn)',
      ...GP0.map(([s]) => `        .MAXIGP0${s}(${gp(s)})`)].join(',\n'), '    );');
  for (const [n, ps, wd] of FX) {
    if (wd === 1) L.push(`    BIBUF bibuf_${ps.toLowerCase()} (.IO(ps_${ps.toLowerCase()}), .PAD(${n}));`);
    else L.push(`    genvar g_${ps.toLowerCase()};`, `    generate for (g_${ps.toLowerCase()} = 0; g_${ps.toLowerCase()} < ${wd}; g_${ps.toLowerCase()} = g_${ps.toLowerCase()} + 1) begin : bibuf_${ps.toLowerCase()}`,
      `        BIBUF b (.IO(ps_${ps.toLowerCase()}[g_${ps.toLowerCase()}]), .PAD(${n}[g_${ps.toLowerCase()}]));`, '    end endgenerate');
  }
  L.push('    BUFG bufg_fclk0 (.I(fclk_clk[0]), .O(fclk));', '    assign gp0_aclk = fclk;', '',
    '    // M_AXI_GP0 (AXI3) to AXI4-Lite: single beats, each ID given back with its response, RLAST high',
    '    always @(posedge fclk) begin', '        if (gp0_awvalid && gp0_awready) gp0_awid_q <= gp0_awid;', '        if (gp0_arvalid && gp0_arready) gp0_arid_q <= gp0_arid;', '    end',
    '    assign gp0_bid = gp0_awid_q;', '    assign gp0_rid = gp0_arid_q;', '    assign gp0_rlast = 1\'b1;', '',
    `    ${map.name} regs (`, ['        .s_axi_aclk(fclk)', '        .s_axi_aresetn(fclk_resetn[0])', '        .s_axi_awaddr(gp0_awaddr[11:0])', '        .s_axi_awvalid(gp0_awvalid)',
      '        .s_axi_awready(gp0_awready)', '        .s_axi_wdata(gp0_wdata)', '        .s_axi_wstrb(gp0_wstrb)', '        .s_axi_wvalid(gp0_wvalid)', '        .s_axi_wready(gp0_wready)',
      '        .s_axi_bresp(gp0_bresp)', '        .s_axi_bvalid(gp0_bvalid)', '        .s_axi_bready(gp0_bready)', '        .s_axi_araddr(gp0_araddr[11:0])', '        .s_axi_arvalid(gp0_arvalid)',
      '        .s_axi_arready(gp0_arready)', '        .s_axi_rdata(gp0_rdata)', '        .s_axi_rresp(gp0_rresp)', '        .s_axi_rvalid(gp0_rvalid)', '        .s_axi_rready(gp0_rready)',
      ...w.slave.map(([s, m]) => `        .${s}(r_${m})`)].join(',\n'), '    );');
  // (the registers' nets between the slave and the module)
  const reg = (m) => module.ports.find((p) => p.name === m);
  L.splice(L.indexOf('    reg  [11:0] gp0_awid_q = 12\'d0, gp0_arid_q = 12\'d0;'), 0, ...w.slave.map(([, m]) => `    wire ${vRange(reg(m).width ?? 1).padEnd(7)}r_${m};`));
  L.push(`    ${module.name} user (`, [...(w.fclk ? [`        .${w.fclk}(fclk)`] : []), ...w.slave.map(([, m]) => `        .${m}(r_${m})`), ...w.board.map((p) => `        .${p.name}(${p.name})`)].join(',\n'), '    );', 'endmodule', '');
  return L.join('\n');
}

const vType = (wd) => (wd === 1 ? 'STD_LOGIC' : `STD_LOGIC_VECTOR (${wd - 1} downto 0)`);

function vhdl(top, module, map, w, fixedIo) {
  const FX = fixedIo ? FIXED : [];
  const reg = (m) => module.ports.find((p) => p.name === m);
  const vdir = (d) => (d === 'in' ? 'in   ' : d === 'out' ? 'out  ' : 'inout');
  const ports = [...FX.map(([n, , wd]) => [n, 'inout', vType(wd)]), ...w.board.map((p) => [p.name, vdir(p.dir).trim(), vType(p.width ?? 1)])];
  const pw = Math.max(...ports.map((p) => p[0].length));
  const L = [`-- ${top}: the Zynq PL's top of ${module.name}, written by Silinx (#4688): the PS7, its M_AXI_GP0 bridged to the register`,
    `-- map ${map.name}'s AXI4-Lite slave, and the module. Generated (edit the map and the module, not this file).`,
    'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', 'library UNISIM;', 'use UNISIM.VCOMPONENTS.ALL;', '', `entity ${top} is`,
    ...ports.map((p, i) => `${i ? '           ' : '    Port ( '}${p[0].padEnd(pw)} : ${p[1].padEnd(5)} ${p[2]}${i === ports.length - 1 ? ');' : ';'}`), `end ${top};`, '',
    `architecture rtl of ${top} is`,
    '    component PS7', '        port (', [...FX.map(([, ps, wd]) => `            ${ps} : inout ${vType(wd)}`), '            FCLKCLK : out STD_LOGIC_VECTOR (3 downto 0)',
      '            FCLKRESETN : out STD_LOGIC_VECTOR (3 downto 0)', ...GP0.map(([s, d, wd]) => `            MAXIGP0${s} : ${d === 'out' ? 'out' : 'in'} ${vType(wd)}`)].join(';\n'), '        );', '    end component;',
    ...(fixedIo ? ['    component BIBUF', '        port ( IO : inout STD_LOGIC; PAD : inout STD_LOGIC );', '    end component;'] : []),
    '    component BUFG', '        port ( I : in STD_LOGIC; O : out STD_LOGIC );', '    end component;',
    ...FX.map(([, ps, wd]) => `    signal ps_${ps.toLowerCase()} : ${vType(wd)};`), '    signal fclk_clk, fclk_resetn : STD_LOGIC_VECTOR (3 downto 0);', '    signal fclk : STD_LOGIC;',
    ...GP0.map(([s, , wd]) => `    signal ${gp(s)} : ${vType(wd)};`), '    signal gp0_awid_q, gp0_arid_q : STD_LOGIC_VECTOR (11 downto 0) := (others => \'0\');',
    ...w.slave.map(([, m]) => `    signal r_${m} : ${vType(reg(m).width ?? 1)};`), 'begin', `    -- the PS7: ${fixedIo ? 'its fixed IO through BIBUFs, ' : 'its fixed IO the PS\'s own pins (none in this flow), '}FCLK_CLK0 through a BUFG`,
    '    ps7_i : PS7', '        port map (', [...FX.map(([, ps]) => `            ${ps} => ps_${ps.toLowerCase()}`), '            FCLKCLK => fclk_clk', '            FCLKRESETN => fclk_resetn',
      ...GP0.map(([s]) => `            MAXIGP0${s} => ${gp(s)}`)].join(',\n'), '        );'];
  for (const [n, ps, wd] of FX) {
    const s = ps.toLowerCase();
    if (wd === 1) L.push(`    bibuf_${s} : BIBUF port map ( IO => ps_${s}, PAD => ${n} );`);
    else L.push(`    bibuf_${s} : for i in 0 to ${wd - 1} generate`, `        b : BIBUF port map ( IO => ps_${s}(i), PAD => ${n}(i) );`, '    end generate;');
  }
  L.push('    bufg_fclk0 : BUFG port map ( I => fclk_clk(0), O => fclk );', '    gp0_aclk <= fclk;', '',
    '    -- M_AXI_GP0 (AXI3) to AXI4-Lite: single beats, each ID given back with its response, RLAST high',
    '    process (fclk)', '    begin', '        if rising_edge(fclk) then', '            if gp0_awvalid = \'1\' and gp0_awready = \'1\' then gp0_awid_q <= gp0_awid; end if;',
    '            if gp0_arvalid = \'1\' and gp0_arready = \'1\' then gp0_arid_q <= gp0_arid; end if;', '        end if;', '    end process;',
    '    gp0_bid <= gp0_awid_q;', '    gp0_rid <= gp0_arid_q;', '    gp0_rlast <= \'1\';', '',
    `    regs : entity work.${map.name}`, '        port map (', ['            s_axi_aclk => fclk', '            s_axi_aresetn => fclk_resetn(0)', '            s_axi_awaddr => gp0_awaddr(11 downto 0)',
      '            s_axi_awvalid => gp0_awvalid', '            s_axi_awready => gp0_awready', '            s_axi_wdata => gp0_wdata', '            s_axi_wstrb => gp0_wstrb', '            s_axi_wvalid => gp0_wvalid',
      '            s_axi_wready => gp0_wready', '            s_axi_bresp => gp0_bresp', '            s_axi_bvalid => gp0_bvalid', '            s_axi_bready => gp0_bready', '            s_axi_araddr => gp0_araddr(11 downto 0)',
      '            s_axi_arvalid => gp0_arvalid', '            s_axi_arready => gp0_arready', '            s_axi_rdata => gp0_rdata', '            s_axi_rresp => gp0_rresp', '            s_axi_rvalid => gp0_rvalid',
      '            s_axi_rready => gp0_rready', ...w.slave.map(([s, m]) => `            ${s} => r_${m}`)].join(',\n'), '        );',
    `    user : entity work.${module.name}`, '        port map (', [...(w.fclk ? [`            ${w.fclk} => fclk`] : []), ...w.slave.map(([, m]) => `            ${m} => r_${m}`), ...w.board.map((p) => `            ${p.name} => ${p.name}`)].join(',\n'), '        );',
    'end rtl;', '');
  return L.join('\n');
}

/**
 * The PL's top of a Zynq node: its module `module` ({ name, ports: [{ name, dir, width }] }) and its AXI4-Lite register map
 * `map` (core/regmap.js), `pins` the node's (a module's port on a board's pin); fixedIo: the PS7's fixed IO brought out
 * (Vivado's; false the Silinx toolchain's, whose flow has no PS pins: the PS7's MIO and DDR left unconnected): { code, file (`<module>_zynq.v` | `.vhd`),
 * top (`<module>_zynq`), errors } (errors: the module's ports that do not meet the map's registers; no code then).
 */
export function zynqPlTop({ module, map, pins = {}, lang = 'vhdl', fixedIo = true }) {
  if (map?.bus !== 'axi') return { errors: [`the register map ${map?.name} is not on AXI4-Lite: its bus is ${map?.bus}`] };
  const w = plTopWiring(module, map, pins);
  const top = `${module.name}_zynq`;
  if (w.errors.length) return { top, errors: w.errors };
  const V = lang === 'vhdl';
  return { code: V ? vhdl(top, module, map, w, fixedIo) : verilog(top, module, map, w, fixedIo), file: `${top}.${V ? 'vhd' : 'v'}`, top, errors: [] };
}
