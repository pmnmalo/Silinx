// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The processing system of a Zynq board (#4686, part 2; roadmaps #4679, #5412). A Zynq board (the Zybo Z7, the Arty Z7)
// is an FPGA node, its programmable logic built as any FPGA board's (Pedro's model: no node kind of its own, as the Pico
// is a board of the microcontrollers'), with a processing system beside it: its board's `ps` (core/boards-vivado.js),
// set up by Silinx's own ps7_init (core/zynq-ps7.js), and its program, a C file of the node's folder's `ps/` (`ps`, the
// node's field: `<id>/ps/main.c`; a Board project's at its root, `ps/main.c`), compiled and run over JTAG by #4687. Its
// starter program, its checks and its description here; the PL's build leaves `ps/` out (core/system-node.js,
// core/system-plan.js). Isomorphic module (browser + Node).
import { resolveBoard } from './devices.js';
import { relInNode, relPathError } from './system-layout.js';
import { ps7Init } from './zynq-ps7.js';

const PS_DIR = 'ps';
/** The PS's program's path: the node's `<id>/ps/main.c`, a Board project's (no id) `ps/main.c`. */
export const psProgramPath = (id) => `${id ? `${id}/` : ''}${PS_DIR}/main.c`;
/** Whether a path of a node's folder (`rel`, its path there) is its PS's: in `ps/`. */
export const isPsPath = (rel) => new RegExp(`^${PS_DIR}/`, 'i').test(String(rel ?? ''));

/** A board's processing system (its `ps`), or null: a board with none, or no board. */
export function psOfBoard(board, variant) {
  if (!board) return null;
  try { return resolveBoard(board, { variant })?.board?.ps ?? null; } catch { return null; }
}

/** Why the PS's program `path` cannot be node `id`'s (in its folder's ps/, a .c), or null. */
export function psProgramError(path, id) {
  const s = String(path ?? ''), rel = id ? relInNode(s, id) : (relPathError(s) ? null : s);
  if (rel == null || !isPsPath(rel)) return `its PS's program ${s} is not in ${id ? `${id}/` : ''}${PS_DIR}/`;
  if (!/\.c$/i.test(s)) return `its PS's program ${s} is not a .c (C)`;
  return null;
}

/** The PS problems of FPGA node `n` (its `ps`), each a sentence: its board with no PS, its program's place, a program the
 *  project has not (`files`: the project's paths; null: not checked), its board's PS that cannot be set up. */
export function psProblems(n, files = null) {
  if (!n?.ps) return [];
  const ps = psOfBoard(n.board, n.variant), out = [];
  if (n.board && !ps) out.push(`${n.id}: the board ${n.board} has no processing system (its PS's program ${n.ps})`);
  const where = psProgramError(n.ps, n.implicit ? null : n.id);
  if (where) out.push(`${n.id}: ${where}`);
  else if (files && !files.includes(n.ps)) out.push(`${n.id}: no PS's program ${n.ps} in the project`);
  const init = ps && ps7Init(ps);
  if (init?.error) out.push(`${n.id}: its PS cannot be set up: ${init.error}`);
  return out;
}

const mhz = (hz) => `${Math.round(hz / 1e5) / 10} MHz`;
/** The PS of FPGA node `n` in a few words (describeSystem's): its program, its CPU's clock, its UART on the MIO; or null. */
export function psSummary(n) {
  if (!n?.ps) return null;
  const ps = psOfBoard(n.board, n.variant), init = ps && ps7Init(ps);
  if (!ps || init.error) return `its PS's program ${n.ps}`;
  return `its PS's program ${n.ps}: the Cortex-A9 at ${mhz(init.clocks.cpu)}, UART${ps.uart.id} on MIO ${ps.uart.tx} (TX) and ${ps.uart.rx} (RX), FCLK0 ${mhz(init.clocks.fclk0)}`;
}

// a UART's registers (UG585, appendix B: UART), UART0's and UART1's base
const UART_BASE = [0xE0000000, 0xE0001000];
const hex = (n) => `0x${n.toString(16).toUpperCase()}`;
/** The PS's starter program for board `ps` (a board's `ps`): its UART at 115200 baud (8N1) says hello, then its first
 *  PS LED (a GPIO on the MIO, the Zybo Z7's LD4) blinks, or the program waits. C, bare metal, no library. */
export function psStarter(ps, boardName = 'the board') {
  const u = ps.uart, base = UART_BASE[u.id];
  // (115200 baud from the UART's clock: CD × (BDIV + 1) = clock / baud, BDIV 6)
  const bdiv = 6, cd = Math.round(u.refHz / (115200 * (bdiv + 1)));
  const led = (ps.gpio || []).find((g) => g.dir === 'out');
  const ledLines = led ? [
    '',
    `/* ${led.name}: MIO ${led.mio}, a GPIO of bank 0 (the GPIO's DIRM_0, OEN_0 and DATA_0) */`,
    '#define GPIO_DATA_0 REG(0xE000A040)',
    '#define GPIO_DIRM_0 REG(0xE000A204)',
    '#define GPIO_OEN_0  REG(0xE000A208)',
    `#define LED_BIT     (1u << ${led.mio})`,
  ] : [];
  return [
    `/* The processing system's program of ${boardName} (Silinx, #4686): bare metal on the Cortex-A9, in its on-chip`,
    ' * memory, after Silinx\'s ps7_init (its clocks, its MIO). It says hello on the USB-UART at 115200 baud, then',
    ` * ${led ? `blinks ${led.name}` : 'waits'}. */`,
    '#include <stdint.h>',
    '',
    '#define REG(a) (*(volatile uint32_t *)(a))',
    '',
    `/* UART${u.id}: MIO ${u.tx} (TX), ${u.rx} (RX); its clock ${u.refHz / 1e6} MHz */`,
    `#define UART_CR    REG(${hex(base)})`,
    `#define UART_MR    REG(${hex(base + 0x04)})`,
    `#define UART_BRGR  REG(${hex(base + 0x18)})`,
    `#define UART_SR    REG(${hex(base + 0x2C)})`,
    `#define UART_FIFO  REG(${hex(base + 0x30)})`,
    `#define UART_BDIV  REG(${hex(base + 0x34)})`,
    '#define SR_TXFULL  (1u << 4)',
    ...ledLines,
    '',
    'static void uart_init(void) {',
    '  UART_CR = 0x28;              /* TX and RX off */',
    '  UART_MR = 0x20;              /* 8 bits, no parity, 1 stop bit */',
    `  UART_BRGR = ${cd};             /* ${u.refHz / 1e6} MHz / (${cd} x ${bdiv + 1}): 115200 baud */`,
    `  UART_BDIV = ${bdiv};`,
    '  UART_CR = 0x03;              /* TX and RX reset */',
    '  UART_CR = 0x14;              /* TX and RX on */',
    '}',
    '',
    'static void uart_put(char c) {',
    '  while (UART_SR & SR_TXFULL) { }',
    '  UART_FIFO = (uint32_t)c;',
    '}',
    '',
    'static void uart_puts(const char *s) {',
    '  for (; *s; s++) { if (*s == \'\\n\') uart_put(\'\\r\'); uart_put(*s); }',
    '}',
    '',
    'int main(void) {',
    '  uart_init();',
    `  uart_puts("Hello from the Cortex-A9 of ${boardName}\\n");`,
    ...(led ? [
      '  GPIO_DIRM_0 |= LED_BIT;      /* an output */',
      '  GPIO_OEN_0 |= LED_BIT;',
      '  for (;;) {',
      '    GPIO_DATA_0 ^= LED_BIT;',
      '    for (volatile uint32_t i = 0; i < 20000000u; i++) { }',
      '  }',
    ] : ['  for (;;) { }']),
    '}',
    '',
  ].join('\n');
}

/** The starter programs a System's FPGA nodes on a Zynq board need: [{ path, text }], for each node whose `ps` names a
 *  program in its ps/ that the project has not (`files`: its paths). */
export function psWrites(system, files = []) {
  const out = [];
  for (const n of system?.nodes || []) {
    if (n.kind !== 'fpga' || !n.ps || files.includes(n.ps) || psProgramError(n.ps, n.implicit ? null : n.id)) continue;
    const ps = psOfBoard(n.board, n.variant);
    if (ps) out.push({ path: n.ps, text: psStarter(ps, resolveBoard(n.board, { variant: n.variant }).board.name) });
  }
  return out;
}
