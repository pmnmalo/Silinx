// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq board's PS program loaded and started by the user's OpenOCD (#4687, part 3b: the local server's and the MCP's
// way; the browser's is Silinx's own engine over WebUSB, core/zynq-ps-load.js). The Tcl is written from the same plan
// (core/zynq-ps-load.js psLoadPlan) and refused by the same check before anything is written (planRefusal): its only
// writes are ps7_init's registers of the SLCR and the plan's segments in the OCM, as binary files beside it.
//
// The board's USB-JTAG is a Digilent FT2232H (the Zybo Z7's, the Arty Z7's): its channel A with openFPGALoader's
// digilent pins (core/ftdi-jtag.js CABLES.digilent: low byte 0xE8 / 0xEB, high byte 0x00 / 0x60, OpenOCD's
// interface/ftdi/digilent-hs1.cfg). The chip is OpenOCD's own target/zynq_7000.cfg (the DAP and the PL's TAP; CPU 0
// zynq.cpu0). The steps are the engine's: CPU 0 halted, its MMU and caches off and its instruction cache and branch
// predictor invalidated, ps7_init (mww, mmw, a poll of PLL_STATUS's locks), the segments loaded and verified, the CPSR
// the Supervisor mode with its interrupts off, CPU 0 resumed at the entry, OpenOCD shut down. Isomorphic module.
import { planRefusal } from './zynq-ps-load.js';

/** OpenOCD's JTAG clock (kHz): well under the Zynq DAP's and the FT2232H's limits. */
export const OPENOCD_KHZ = 6000;
const hex = (n) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

/** A block's words as bytes (little-endian), its binary file's. */
export function blockBytes(words) {
  const b = new Uint8Array(words.length * 4);
  words.forEach((w, i) => { b[i * 4] = w & 0xff; b[i * 4 + 1] = (w >>> 8) & 0xff; b[i * 4 + 2] = (w >>> 16) & 0xff; b[i * 4 + 3] = (w >>> 24) & 0xff; });
  return b;
}

/**
 * OpenOCD's script of a load: { tcl, files: [{ name, bytes }] (the segments' binary files, beside it) } or { error }
 * (planRefusal's reason, before anything is written). `pollTries`: a PLL lock's reads at most.
 */
export function psOpenocdScript(plan, { pollTries = 100, khz = OPENOCD_KHZ } = {}) {
  const why = planRefusal(plan);
  if (why) return { error: `the PS program is not loaded: ${why}` };
  const files = plan.blocks.map((b, i) => ({ name: `ps-${i}.bin`, addr: b.addr, bytes: blockBytes(b.words) }));
  const op = (o) => (o.op === 'write' ? `mww ${hex(o.addr)} ${hex(o.value)}`
    : o.op === 'mask' ? `mmw ${hex(o.addr)} ${hex(o.value & o.mask)} ${hex(o.mask)}`
      : `silinx_poll ${hex(o.addr)} ${hex(o.mask)} ${o.reg}`);
  const tcl = [
    '# Silinx: a Zynq\'s PS program loaded over JTAG and started (#4687), from its checked plan',
    '# the board\'s Digilent USB-JTAG (an FT2232H, channel A)',
    'adapter driver ftdi',
    'ftdi vid_pid 0x0403 0x6010',
    'ftdi channel 0',
    'ftdi layout_init 0x00e8 0x60eb',
    'reset_config none',
    'transport select jtag',
    `adapter speed ${khz}`,
    'source [find target/zynq_7000.cfg]',
    'init',
    'targets zynq.cpu0',
    'halt',
    '# CPU 0\'s MMU and caches off (SCTLR\'s M, C, I), its instruction cache and branch predictor invalidated',
    'arm mcr 15 0 1 0 0 [expr {[arm mrc 15 0 1 0 0] & ~0x1005}]',
    'arm mcr 15 0 7 5 0 0',
    'arm mcr 15 0 7 5 6 0',
    `proc silinx_poll {addr mask what} {`,
    `  for {set i 0} {$i < ${pollTries}} {incr i} { if {([lindex [read_memory $addr 32 1] 0] & $mask) == $mask} { return } }`,
    '  error "ps7_init: $what never set its bits $mask (a PLL not locked?)"',
    '}',
    `# ps7_init: ${plan.init.length} register operations of the SLCR (the MIO, the PLLs, the clocks)`,
    ...plan.init.map(op),
    '# the program: its segments into the on-chip memory, read back',
    ...files.flatMap((f) => [`load_image ${f.name} ${hex(f.addr)} bin`, `verify_image ${f.name} ${hex(f.addr)} bin`]),
    '# the Supervisor mode, ARM state, interrupts off; CPU 0 started at the entry',
    'reg cpsr 0x1d3',
    `resume ${hex(plan.entry)}`,
    'shutdown',
    '',
  ].join('\n');
  return { tcl, files: files.map(({ name, bytes }) => ({ name, bytes })) };
}

// OpenOCD's own lines: `Error: …`, `Warn : …`
const LINE = /^(Error|Warn)\s*:\s*(.*)$/;

/** OpenOCD's output as the console's lines: its errors and warnings, once each. { errors, warnings }. */
export function openocdMessages(text) {
  const errors = [], warnings = [], seen = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const out = `${m[1] === 'Error' ? 'ERROR' : 'WARNING'}: OpenOCD: ${m[2]}`;
    if (seen.has(out)) continue;
    seen.add(out);
    (m[1] === 'Error' ? errors : warnings).push(out);
  }
  return { errors, warnings };
}
