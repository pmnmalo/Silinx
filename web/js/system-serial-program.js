// An Arduino node's firmware loaded on its board over Web Serial, in the browser (#5448, docs/SYSTEMS.md, Real boards):
// its Program Node in the browser edition, and in the local server's when the user chooses Web Serial for its board (the
// server does not see it, or has no arduino-cli). Its image (a .hex or an .elf: the node's firmware, or its sketch's
// build) read and checked (core/avr-firmware.js), its board's port asked for among the board's USB ids, then its
// bootloader's STK500 (core/stk500.js: reset by DTR, sync, the chip's signature, the pages written and read back). Its
// lines in the run's log, as the local server's programming says them.
//
//   const ok = await programOverWebSerial({ project, node, image, log });
import { api } from './api.js';
import { readFirmware } from '/core/avr-firmware.js';
import { BOOTLOADERS, imageBytes, serialTransport, stk500Upload } from '/core/stk500.js';
import { portFilters, portText, webSerialMissing } from '/core/serial-line.js';

/** Whether this browser has Web Serial (the Choose the Board dialog's Web Serial…). */
export const hasWebSerial = (nav = globalThis.navigator) => !webSerialMissing(nav);

/**
 * The firmware `image` (a project file: .hex or .elf) of the System node `node` (an Arduino's) loaded on its board over
 * Web Serial; `log(line, cls)` the run's. Whether it ended well; its errors logged (`ERROR: System node <id>: …`).
 */
export async function programOverWebSerial({ project, node, image, log, nav = globalThis.navigator }) {
  const fail = why => { log(`ERROR: System node ${node.id}: ${why}`, 'err'); return false; };
  const boot = BOOTLOADERS[node.board];
  if (!boot) return fail(`Silinx loads a firmware over Web Serial on an Arduino Uno or Nano, not on ${node.board}`);
  const missing = webSerialMissing(nav);
  if (missing) return fail(missing);
  if (!image) return fail('it has no firmware to load (its .hex or .elf)');
  let fw;
  try { fw = readFirmware(image, /\.elf$/i.test(image) ? new Uint8Array(await api.readFileBytes(project, image)) : await api.readFile(project, image), boot.flash); } catch (e) { return fail(`${image}: ${e.message}`); }
  if (fw.error) return fail(fw.error);
  let port;
  try { port = await nav.serial.requestPort({ filters: portFilters(node) }); } catch (e) {
    return fail(e?.name === 'NotFoundError' ? 'no serial port chosen' : e.message);
  }
  log(`System node ${node.id}: loading ${image} (${fw.size} bytes) on ${portText(port.getInfo?.())} through its bootloader (STK500, ${boot.baud} baud, Web Serial).`);
  let t;
  try { t = await serialTransport(port, boot.baud); } catch (e) { return fail(`${portText(port.getInfo?.())} did not open: ${e.message}`); }
  try {
    let said = '';
    const r = await stk500Upload(t, imageBytes(fw), { signature: boot.signature, page: boot.page, flash: boot.flash, onProgress: p => {
      if (p.done === p.total && said !== p.phase) { said = p.phase; log(`System node ${node.id}: ${p.total} page(s) ${p.phase === 'write' ? 'written' : 'verified'}.`); }
    } });
    log(`System node ${node.id}: programmed (${r.bytes} bytes, ${r.pages} page(s) of ${boot.page}, verified); its program runs.`);
    return true;
  } catch (e) { return fail(e.message); } finally { await t.close().catch(() => {}); }
}
