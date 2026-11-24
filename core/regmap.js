// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A register map (`<name>.regs.json`, #5288, docs/SYSTEMS.md): the registers a System's FPGA peripheral shows its
// microcontroller over SPI or I²C, declared once, both sides generated from it (core/regmap-hdl.js the FPGA's slave in
// VHDL and Verilog, core/regmap-c.js the program's header). Its format read and written here, and its check.
// Isomorphic module (browser + Node).
//
//   { format: 'silinx-regmap', version: 1, name, bus: 'spi' | 'i2c', address (I²C: 7 bits),
//     registers: [ { name, addr, width, access: 'rw' | 'ro' | 'wo', reset, strobe } ] }
//
// A register takes ceil(width / 8) byte addresses from addr, its bytes the least significant first. `rw`: an output of
// the module, the value the program wrote, read back; `ro`: an input of the module, its logic's, read; `wo`: an output,
// read as 0. `strobe`: a pulse `<name>_wr`, one clock cycle, when its last byte is written. The protocol on the bus:
//   SPI (mode 0, MSB first, SS low for a transaction): a command byte, R << 7 | addr, then the data bytes, the address
//     incremented after each; in a read, MISO gives the registers' bytes from the second byte on;
//   I²C: a write [address + W, addr, data…], a read [address + W, addr] then a repeated START and [address + R, data…],
//     the address incremented after each byte.

const REGMAP_FORMAT = 'silinx-regmap';
const REGMAP_VERSION = 1;
const REGMAP_BUSES = ['spi', 'i2c'];
const REG_ACCESS = ['rw', 'ro', 'wo'];
/** The highest byte address (7 bits: SPI's command byte has the R bit). */
const REG_ADDR_MAX = 127;
/** The bus's ports of the generated module: a register's name is none of them. */
const BUS_PORTS = { spi: ['clk', 'sck', 'mosi', 'miso', 'ss'], i2c: ['clk', 'scl', 'sda'] };

/** The names the generated module uses itself: a register's name is none of them (nor ends with _q). */
const REGMAP_INTERNAL = ['sck_s', 'ss_s', 'mosi_s', 'scl_s', 'sda_s', 'rx', 'tx', 'rbyte', 'addr', 'bits', 'first', 'rd', 'b',
  'state', 'state_t', 'wnext', 'reading', 'pull', 'acked', 'rise', 'fall', 'i2c_address', 's_idle', 's_addr', 's_ptr', 's_wdata',
  's_ack', 's_rdata', 's_rack', 'rtl'];

const INTERNAL = new Set(REGMAP_INTERNAL);

/** Whether `path` is a register map. */
export const isRegmapFile = path => /\.regs\.json$/i.test(String(path || ''));

/** A register's bytes (its addresses). */
const regBytes = r => Math.max(1, Math.ceil(Number(r.width) / 8));

/** A new register map named `name`, on SPI, with one register (lang: its HDL's). */
export const newRegmap = (name, bus = 'spi', lang = null) => normalizeRegmap({ name, bus, lang, registers: [{ name: 'ctrl', addr: 0, width: 8, access: 'rw' }] });

const normalReg = r => {
  const out = { name: String(r?.name ?? ''), addr: r?.addr, width: r?.width ?? 8, access: r?.access ?? 'rw' };
  if (out.access !== 'ro') out.reset = r?.reset ?? 0;
  if (r?.strobe && out.access !== 'ro') out.strobe = true;
  return out;
};

/** A register map's model with every field in its place and order. */
export function normalizeRegmap(m) {
  const bus = String(m?.bus ?? 'spi');
  return { format: REGMAP_FORMAT, version: REGMAP_VERSION, name: String(m?.name ?? 'regs'), bus,
    ...(bus === 'i2c' ? { address: m?.address ?? 0x42 } : {}),
    registers: Array.isArray(m?.registers) ? m.registers.map(normalReg) : [],
    // (as a drawing's: its HDL's language, its HDL file, #5288)
    ...(m?.lang ? { lang: m.lang === 'verilog' ? 'verilog' : 'vhdl' } : {}), ...(m?.generatedFile ? { generatedFile: String(m.generatedFile) } : {}) };
}

/** A register map's text read: { regmap } or { error }. */
export function readRegmap(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return { error: `not a register map: ${e.message}` }; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.format !== REGMAP_FORMAT) return { error: `not a register map (its format is not '${REGMAP_FORMAT}')` };
  if (!Number.isInteger(m.version) || m.version < 1) return { error: 'not a register map (no version)' };
  if (m.version > REGMAP_VERSION) return { error: `a register map of version ${m.version}: this Silinx reads version ${REGMAP_VERSION}` };
  return { regmap: normalizeRegmap(m) };
}

/** A register map's text, as saved: its normalized model, two spaces, a last newline. */
export const writeRegmap = m => `${JSON.stringify(normalizeRegmap(m), null, 2)}\n`;

// an HDL identifier both VHDL and Verilog take: a letter, then letters, digits and single underscores, not at the end
const IDENT = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;
// the words neither language lets a port be named
const RESERVED = new Set(('abs access after alias all and architecture array assert attribute begin block body buffer bus case component configuration constant ' +
  'disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in inertial inout is label library linkage literal ' +
  'loop map mod nand new next nor not null of on open or others out package port postponed procedure process pure range record register reject rem report ' +
  'return rol ror select severity signal shared sla sll sra srl subtype then to transport type unaffected units until use variable wait when while with xnor xor ' +
  'always assign automatic default defparam disable edge endcase endfunction endmodule endtask event forever fork initial input integer join localparam ' +
  'module negedge output parameter posedge real reg repeat signed task time tri unsigned wire').split(' '));

/**
 * The map's problems: [{ severity: 'error' | 'warning', message }] (its name, its bus and address; each register's name,
 * address, width, access and reset; two registers on one address).
 */
export function checkRegmap(m) {
  const out = [];
  const err = message => out.push({ severity: 'error', message });
  const warn = message => out.push({ severity: 'warning', message });
  if (!IDENT.test(m.name) || RESERVED.has(m.name.toLowerCase())) err(`the map's name '${m.name}' is not a module's name: a letter, then letters, digits and single _`);
  if (!REGMAP_BUSES.includes(m.bus)) { err(`no bus '${m.bus}' (the buses: ${REGMAP_BUSES.join(', ')})`); return out; }
  if (m.bus === 'i2c' && !(Number.isInteger(m.address) && m.address >= 0x08 && m.address <= 0x77)) err(`the I²C address '${m.address}' is not one of 0x08 to 0x77 (7 bits, the reserved ones left out)`);
  if (!m.registers.length) warn('the map has no registers');
  const names = new Map(), at = new Map(), ports = new Set(BUS_PORTS[m.bus]);
  for (const r of m.registers) {
    const who = r.name || '(no name)';
    if (!IDENT.test(r.name) || RESERVED.has(r.name.toLowerCase())) { err(`${who}: not a register's name: a letter, then letters, digits and single _`); continue; }
    const lc = r.name.toLowerCase();
    if (names.has(lc)) { err(`two registers are named ${r.name}`); continue; }
    names.set(lc, r);
    if (ports.has(lc)) { err(`${r.name}: a port of the bus's (${BUS_PORTS[m.bus].join(', ')})`); continue; }
    if (INTERNAL.has(lc) || /_q$/.test(lc)) { err(`${r.name}: a name the generated module uses itself (${REGMAP_INTERNAL.join(', ')}, and names ending with _q)`); continue; }
    if (!(Number.isInteger(r.width) && r.width >= 1 && r.width <= 32)) { err(`${r.name}: its width '${r.width}' is not 1 to 32 bits`); continue; }
    if (!REG_ACCESS.includes(r.access)) { err(`${r.name}: its access '${r.access}' is not rw (written and read back), ro (read only) or wo (written only)`); continue; }
    const n = regBytes(r);
    if (!(Number.isInteger(r.addr) && r.addr >= 0 && r.addr + n - 1 <= REG_ADDR_MAX)) { err(`${r.name}: its address '${r.addr}' is not 0 to ${REG_ADDR_MAX + 1 - n} (its ${n} byte(s) at 0 to ${REG_ADDR_MAX})`); continue; }
    if (r.access !== 'ro' && !(Number.isInteger(r.reset) && r.reset >= 0 && r.reset < 2 ** r.width)) err(`${r.name}: its reset '${r.reset}' does not fit its ${r.width} bit(s)`);
    for (let k = 0; k < n; k++) {
      const o = at.get(r.addr + k);
      if (o) { err(`${r.name} and ${o.name} both at address ${r.addr + k}`); break; }
      at.set(r.addr + k, r);
    }
  }
  if (names.has(m.name.toLowerCase())) err(`the map's name ${m.name} is a register's: the module and its port one name`);
  for (const r of m.registers) if (r.strobe && names.has(`${r.name}_wr`.toLowerCase())) err(`${r.name}'s strobe ${r.name}_wr and the register ${names.get(`${r.name}_wr`.toLowerCase()).name}: one port's name`);
  return out;
}

/** The register map a module is made from, or one of its instances (`modules`: the names of its hierarchy, itself
 *  first; an elaborated design's: hierModules), among the project's maps' texts ({ path: text }): the first named as
 *  one of them (their case aside), or null (#5288: Simulate System says its link's accesses). */
export function regmapFor(texts, modules) {
  const names = (Array.isArray(modules) ? modules : [modules]).map(m => String(m).toLowerCase());
  const maps = Object.entries(texts || {}).filter(([p]) => isRegmapFile(p)).map(([, t]) => readRegmap(t).regmap).filter(Boolean);
  for (const n of names) { const m = maps.find(x => x.name.toLowerCase() === n); if (m) return m; }
  return null;
}

/** The modules of an elaborated design's hierarchy (core/compile.js elaborate's top), itself first. */
export const hierModules = node => (node ? [node.module || node.name, ...(node.children || []).flatMap(hierModules)] : []);

/** The map's registers in address order, each with its bytes ({ ...r, bytes }), for the generators. */
/** A register's address or a bus's: 0x and two hex digits, lower case (the generated files' and the editor's). */
export const hexByte = v => `0x${Number(v).toString(16).padStart(2, '0')}`;
export const regsByAddr = m => m.registers.map(r => ({ ...r, bytes: regBytes(r) })).sort((a, b) => a.addr - b.addr);
