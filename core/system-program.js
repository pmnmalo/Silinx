// Silinx - a System's nodes programmed on their boards (#5489's part 3, #5447, roadmap #5479's phase 2, docs/SYSTEMS.md):
// Program All and Program Node over the build plan (core/system-plan.js: the FPGA nodes first, then the microcontrollers)
// and the boards matched by their USB id (core/system-usb.js), or the board the user picks instead (`chosen`: { id: a
// connected board's serial number or port }). Each node's step: an FPGA node's bitstream over JTAG, an Arduino's .hex by
// avrdude (arduino-cli upload) on its board's serial port; a PIC24's and a MicroPython node's are not programmed by Silinx
// yet, said. A node not built, or with no board, is refused with its message; one out of date is programmed, warned.
//
//   const steps = programSteps(plan, match, devices, { node, chosen });
//   steps.map(stepLine)
//
// Isomorphic ES module, no DOM.
import { deviceText } from './system-usb.js';

/** The connected board `key` names (a serial number, or a serial port's address) among `devices`, or null. */
export const deviceByKey = (devices, key) => devices.find(d => d.serial === key) || devices.find(d => d.port === key) || null;

// why a plan's entry is not programmed, or null
function refusal(e) {
  if (e.programmer === 'pickit') return `a PIC24 is not programmed by Silinx yet: load its ${e.image || '.hex'} with MPLAB IPE`;
  if (e.programmer === 'repl') return 'a MicroPython node is not programmed by Silinx yet: copy its .py files with mpremote';
  if (!e.programmer) return `it has nothing to program (${e.reason || e.state})`;
  if (e.state === 'not built') return `not built yet (${e.reason}): Build All first`;
  if (e.state === 'not buildable') return `it cannot be programmed: ${e.reason}`;
  return null;
}

/**
 * The programming steps (`plan`: systemBuildPlan's; `match`: matchBoards's; `devices`: the connected ones): one a node of
 * the plan (`node`: its id alone, or '*'), in its order: { id, kind, programmer, image, device (the board it is
 * programmed on, or null), warning (out of date, or a board chosen by hand), refused (why it is not programmed, or
 * null), choose (true: its board missing or not told apart, one the user may pick) }. `chosen`: { id: a board's serial number or port } in place of the match.
 */
export function programSteps(plan, match, devices = [], { node = '*', chosen = {} } = {}) {
  const out = [];
  for (const e of plan.nodes) {
    if (node !== '*' && e.id !== node) continue;
    const s = { id: e.id, kind: e.kind, programmer: e.programmer, image: e.image, device: null, warning: null, refused: refusal(e) };
    out.push(s);
    if (s.refused) continue;
    const m = match.nodes.find(x => x.id === e.id);
    const pick = Object.hasOwn(chosen, e.id) ? chosen[e.id] : null;
    if (pick != null) {
      s.device = deviceByKey(devices, String(pick));
      if (!s.device) { s.refused = `no connected board with the serial number or port ${pick}`; continue; }
      s.warning = `its board chosen by hand: ${deviceText(s.device)}`;
    } else if (m?.device) s.device = m.device;
    // (no board, or more than one it could be: the user may pick one, `choose`)
    else { s.refused = (m?.message || `${e.id}: no board for it`).replace(new RegExp(`^${e.id}: `), ''); s.choose = true; continue; }
    if (e.kind === 'mcu' && !s.device.port) { s.refused = `its board (${deviceText(s.device)}) has no serial port: arduino-cli's board list does not see it`; continue; }
    if (e.state === 'out of date') s.warning = [s.warning, `out of date (${e.reason}): its last build is programmed`].filter(Boolean).join('; ');
  }
  return out;
}

/** The console's line of a step before it runs: `<id>: <image> on <device> (<how>)`, or its refusal. */
export function stepLine(s) {
  if (s.refused) return `${s.id}: not programmed: ${s.refused}`;
  return `${s.id}: ${s.image} on ${deviceText(s.device)}, ${s.programmer === 'jtag' ? 'over JTAG' : 'by avrdude (arduino-cli upload)'}`;
}

/** A step's board for the FPGA programmer `tool`: the request's options that pick it (djtgcfg's device by its serial
 *  number, openFPGALoader's FTDI serial), or null when the tool cannot pick a board by its serial number (the first one
 *  it finds is programmed). */
export function toolBoard(tool, device) {
  if (!device?.serial) return null;
  if (tool === 'djtgcfg') return { device: `SN:${device.serial}` };
  if (tool === 'openFPGALoader') return { ftdiSerial: device.serial };
  return null;
}
