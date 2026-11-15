// The toolchain configuration test/vivado/examples.test.js builds the examples with (#1649), as test/ise-examples-config.mjs
// is ISE's: over ssh the builds go to a folder of their own in the configured one (SILINX_ISE_REMOTE_DIR, else the user's
// ssh.remoteDir: Docker on the ISE machine shares only some folders, #482), else ~/silinx-vivado; Vivado in its image.
// Called before the test points SILINX_CONFIG_DIR at its own configuration.
import { iseWorkBase } from '../server/toolchain.js';
import { EXAMPLES } from './examples-lib.mjs';

/** host: null for the image on this machine (SILINX_ISE_HOST=local), else { user, host }. */
export function vivadoExamplesConfig({ host, image, env = process.env }) {
  if (!host) return { mode: 'silinx', docker: { platform: 'linux/amd64' }, vivado: { mode: 'docker', image } };
  const base = iseWorkBase('', env);
  const remoteDir = base ? `${base}/silinx-vivado` : 'silinx-vivado';
  return { mode: 'silinx', ssh: { host: host.host, user: host.user || '', remoteDir }, vivado: { mode: 'ssh', image } };
}

/** Vivado's warnings of a run's log (CRITICAL WARNING and WARNING, its own: "[Synth 8-7129] …"), once each, sorted. */
export const vivadoWarnings = lines => [...new Set(lines.filter(l => /^(CRITICAL WARNING|WARNING): \[/.test(l))
  .map(l => l.replace(/\s+/g, ' ').trim()))].sort();

// the warnings Vivado gives on each example (test/vivado/examples.test.js, the comparison's results #3760), by board: none,
// but synthesis's on an output the design drives with a constant (traffic's unused LEDs, pong's decimal point: as the
// designs mean them; ISE's XST says nothing of them)
const constant = (top, port, v) => `WARNING: [Synth 8-3917] design ${top} has port ${port} driven by constant ${v}`;
const warnings = {
  ...Object.fromEntries(EXAMPLES.map(n => [n, []])),
  traffic: [constant('top', 'led[2]', 0), constant('top', 'led[3]', 0), constant('top', 'led[4]', 0)],
  pong: [constant('pong', 'dp', 1)],
  // the light8080 processor, as it is (#2544): its registers' bits it never reads
  micro80: ['WARNING: [Synth 8-3936] Found unconnected internal register \'IR_reg\' and it is trimmed from \'8\' to \'6\' bits. [/work/src/src/light8080.vhdl:297]',
    'WARNING: [Synth 8-3936] Found unconnected internal register \'daa_res9_reg\' and it is trimmed from \'9\' to \'8\' bits. [/work/src/src/light8080.vhdl:746]'],
};
// (#3895) the Arty S7's 12 MHz clock: vga's pixel every clock (DIV 1), its pace counter unused; the Zybo Z7's 125 MHz:
// blinky's debounce count past speed_ctrl's 21-bit counters, its buttons' logic removed (#3922, to fix)
const removed = (reg, file, line) => `WARNING: [Synth 8-6014] Unused sequential element ${reg}_reg was removed. [/work/src/src/${file}:${line}]`;
const noLoad = port => `WARNING: [Synth 8-7129] Port ${port} in module speed_ctrl is either unconnected or has no load`;
export const VIVADO_WARNINGS = {
  basys3: warnings, 'nexys-a7': warnings,
  'arty-s7': { ...warnings, vga: [removed('pace', 'vga_sync.vhd', 50)] },
  'zybo-z7': { ...warnings, blinky: [removed('cnt_f', 'speed_ctrl.vhd', 105), removed('cnt_s', 'speed_ctrl.vhd', 107), removed('faster_meta', 'speed_ctrl.vhd', 111),
    removed('faster_sync', 'speed_ctrl.vhd', 112), removed('slower_meta', 'speed_ctrl.vhd', 113), removed('slower_sync', 'speed_ctrl.vhd', 114), noLoad('faster'), noLoad('slower')] },
};
// the design rule check's findings on each example: none, but stopwatch's DSP48 multipliers (its division by constants)
// not pipelined, Vivado's performance advice: [rule, severity, description, checks]
export const VIVADO_DRC = { stopwatch: [['DPIP-1', 'Warning', 'Input pipelining', 3], ['DPOP-2', 'Warning', 'MREG Output pipelining', 3]] };
// (#3895) on the Arty S7's 12 MHz clock stopwatch's multipliers' output registers are fine (no DPOP-2); a Zynq-7000's PL alone
// (the Zybo Z7's: no processing system set up) has Vivado's advice ZPS7-1 on every design
const ZPS7 = ['ZPS7-1', 'Warning', 'PS7 block required', 1];
/** A board's example's DRC findings: VIVADO_DRC's, the board's. */
export const vivadoDrc = (board, name) => {
  const own = VIVADO_DRC[name] || [];
  if (board === 'arty-s7') return own.filter(r => r[0] !== 'DPOP-2');
  if (board === 'zybo-z7') return [...own, ZPS7];
  return own;
};
