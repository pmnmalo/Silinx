// Silinx - a CircuitPython node's CIRCUITPY drive (#5697, the RP2040 node: core/system-sim-rp2040.js): the FAT drive
// CircuitPython's Raspberry Pi Pico build mounts from its flash (1 MB from 0x100000, after its 1020 KB of firmware and
// its 4 KB of NVM), made with the node's program as code.py and its other files at their places in its folder (lib/x.py).
// Silinx adds what makes the run start at once and print from its first line, as on a board already connected:
//   - settings.toml: CIRCUITPY_SAFE_MODE_DELAY = 0 (no second's wait for the reset button), after the node's own lines;
//   - boot_out.txt: what CircuitPython would write there (else it waits a second before writing it);
//   - boot.py: the first run set to silinx_wait.py, which waits for the USB serial port's host and reloads: code.py
//     then runs with its console connected (CircuitPython drops what is printed before), after the node's own boot.py.
// A real Pico's CIRCUITPY drive gets the node's files alone (server/circuitpy-copy.js).
//
// Its console: CircuitPython's serial output with its status bar's escapes taken out (ConsoleFilter), from its
// "code.py output:" on.
//
// Isomorphic ES module, no DOM.
import { fatImage } from './fat-image.js';

/** Where the drive is in the Pico's flash, and its size (CircuitPython's raspberrypi port: CIRCUITPY_CIRCUITPY_DRIVE_START_ADDR,
 *  a 2 MB flash). */
export const DRIVE_OFFSET = 0x100000;
export const DRIVE_SIZE = 0x100000;
export const WAIT_FILE = 'silinx_wait.py';
const WAIT = `# Silinx (the System simulation): code.py run once the USB serial port is connected
import supervisor
while not supervisor.runtime.serial_connected:
    pass
supervisor.set_next_code_file(None)
supervisor.reload()
`;
const BOOT = `import supervisor  # Silinx (the System simulation): code.py run once the USB serial port is connected
supervisor.set_next_code_file("/${WAIT_FILE}")
`;
const SETTINGS = 'CIRCUITPY_SAFE_MODE_DELAY = 0  # Silinx (the System simulation): no wait for the reset button\n';

const textOf = data => (typeof data === 'string' ? data : new TextDecoder().decode(data ?? new Uint8Array()));
const withNewline = s => (s && !s.endsWith('\n') ? `${s}\n` : s);

/**
 * The drive's files: the node's program as code.py, its other files (`files`: [{ name (in the node's folder), data }]),
 * and Silinx's (settings.toml, boot_out.txt, boot.py, silinx_wait.py; a node's own settings.toml and boot.py first).
 * bootOut: the firmware's boot_out.txt's first lines (core/rp2040-firmware.js).
 */
export function driveFiles({ program, files = [], bootOut = '' }) {
  const own = new Map(files.filter(f => f && f.name).map(f => [String(f.name).replace(/^\/+/, ''), f.data]));
  own.set('code.py', program?.data ?? '');
  const settings = withNewline(textOf(own.get('settings.toml') ?? ''));
  const boot = withNewline(textOf(own.get('boot.py') ?? ''));
  own.set('settings.toml', /^\s*CIRCUITPY_SAFE_MODE_DELAY\s*=/m.test(settings) ? settings : settings + SETTINGS);
  own.set('boot.py', boot + BOOT);
  own.set(WAIT_FILE, WAIT);
  own.set('boot_out.txt', `${bootOut}boot.py output:\r\n`);
  return [...own.entries()].map(([name, data]) => ({ name, data }));
}

/** The drive's image (DRIVE_SIZE bytes, to write at DRIVE_OFFSET in the flash): driveFiles' files on a FAT12 drive named
 *  CIRCUITPY. */
export const driveImage = opts => fatImage(driveFiles(opts), { size: DRIVE_SIZE, label: 'CIRCUITPY' });

/** CircuitPython's serial output as a terminal shows it, chunk by chunk (an escape may be split between two): its
 *  status bar's escapes (ESC ] … ESC \, ESC [ … a letter) taken out. */
export class ConsoleFilter {
  constructor() { this.state = 'text'; }
  /** The chunk's characters (a string of bytes) that are text. */
  push(s) {
    let out = '';
    for (const c of s) {
      if (this.state === 'text') { if (c === '\x1b') this.state = 'esc'; else out += c; }
      else if (this.state === 'esc') this.state = c === ']' ? 'osc' : c === '[' ? 'csi' : 'text';
      else if (this.state === 'osc') { if (c === '\x07') this.state = 'text'; else if (c === '\x1b') this.state = 'osc-esc'; }
      else if (this.state === 'osc-esc') this.state = c === '\\' ? 'text' : 'osc';
      else if (this.state === 'csi' && c >= '@' && c <= '~') this.state = 'text';
    }
    return out;
  }
}

export const OUTPUT_START = 'code.py output:\r\n';
export const DONE = 'Code done running.';

/** A run's traceback in its output (text from "code.py output:"), its lines, or null: "Traceback (most recent call
 *  last):" to its error's line. */
export function tracebackOf(text) {
  const k = text.lastIndexOf('Traceback (most recent call last):');
  if (k < 0) return null;
  const lines = text.slice(k).split(/\r?\n/);
  const end = lines.findIndex((l, i) => i > 0 && !/^\s/.test(l));
  return end < 0 ? null : lines.slice(0, end + 1).filter(Boolean);
}
