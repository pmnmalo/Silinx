// Silinx - a CircuitPython node programmed on a real Raspberry Pi Pico (#5697, server/system-program.js): its program
// copied as code.py, with its folder's other files (lib/x.py at lib/x.py), to the Pico's CIRCUITPY drive, as a user
// does; CircuitPython runs it again when the drive's files change. The drive is the one mounted that CircuitPython made
// (its boot_out.txt says "Adafruit CircuitPython"): SILINX_CIRCUITPY names its folder (the tests'), else where the
// operating system mounts it (macOS /Volumes/CIRCUITPY…, Linux /media/<user>/CIRCUITPY and /run/media/<user>/CIRCUITPY,
// Windows a drive's root, D: to Z:). None: why, and how to copy it by hand.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The folders a CIRCUITPY drive may be mounted at, on `platform`, for the user `user`. */
export function driveCandidates({ platform = process.platform, user = os.userInfo().username, ls = d => fs.readdirSync(d) } = {}) {
  const named = dir => { try { return ls(dir).filter(n => /^CIRCUITPY/i.test(n)).map(n => path.join(dir, n)); } catch { return []; } };
  if (platform === 'darwin') return named('/Volumes');
  if (platform === 'win32') return [...'DEFGHIJKLMNOPQRSTUVWXYZ'].map(l => `${l}:\\`);
  return [`/media/${user}`, `/run/media/${user}`, '/media', '/mnt'].flatMap(named);
}

/** Whether `dir` is a CircuitPython drive: its boot_out.txt CircuitPython's. */
export function isCircuitpyDrive(dir) {
  try { return /^Adafruit CircuitPython/.test(fs.readFileSync(path.join(dir, 'boot_out.txt'), 'latin1').slice(0, 64)); } catch { return false; }
}

/** The CIRCUITPY drives mounted (SILINX_CIRCUITPY's folder alone when it is set). */
export function circuitpyDrives(opts = {}) {
  if (process.env.SILINX_CIRCUITPY) return isCircuitpyDrive(process.env.SILINX_CIRCUITPY) ? [process.env.SILINX_CIRCUITPY] : [];
  return driveCandidates(opts).filter(isCircuitpyDrive);
}

/** How to copy a node's program by hand (`program` its path, `others` its folder's other files). */
export const copyHint = (program, others = []) => `copy ${program} as code.py${others.length ? `, and ${others.join(', ')} at their places in its folder,` : ''} to the Pico's CIRCUITPY drive (the Pico running CircuitPython, connected by USB)`;

/**
 * The node's files written on the drive `drive`: `program` ({ name, data }) as code.py, `files` ([{ name (in the
 * node's folder), data }]) at their places, each written whole (a temporary file renamed). The paths written, the
 * drive's.
 */
export function copyToDrive(drive, { program, files = [] }) {
  const out = [];
  for (const f of [{ name: 'code.py', data: program.data }, ...files]) {
    const rel = String(f.name).replace(/\\/g, '/');
    if (!rel || rel.split('/').some(p => p === '..' || p === '') || path.isAbsolute(rel)) throw new Error(`'${f.name}' is not a file of the node's folder`);
    const to = path.join(drive, ...rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const tmp = `${to}.silinx-tmp`;
    fs.writeFileSync(tmp, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    fs.renameSync(tmp, to);
    out.push(rel);
  }
  return out;
}
