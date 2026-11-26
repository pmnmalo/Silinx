// Silinx - an Arduino's firmware loaded through its bootloader (#5448, roadmap #4695's phase 3, docs/SYSTEMS.md, Real
// boards): the STK500 version 1 protocol, as Optiboot (the Uno's, the Nano's) and avrdude's `arduino` programmer speak it.
// The board reset by DTR and RTS, the bootloader's sync, its signature checked against the node's chip, then each page
// loaded (its word address) and programmed, read back and compared, and the bootloader left (the program starts). Over a
// transport: { write(bytes), read(n, timeoutMs) (n bytes, or throws on a timeout), drain(), setSignals({
// dataTerminalReady, requestToSend }), delay(ms) }: Web Serial's (serialTransport), a simulated Optiboot's
// (core/stk500-sim.js), later the local server's serial port.
//
//   const r = await stk500Upload(transport, flashBytes, { signature: [0x1e, 0x95, 0x0f], onProgress });
//
// Isomorphic ES module, no DOM.

/** The protocol's bytes (Atmel's AVR061, STK500 version 1). */
export const STK = {
  OK: 0x10, FAILED: 0x11, UNKNOWN: 0x12, INSYNC: 0x14, NOSYNC: 0x15, CRC_EOP: 0x20,
  GET_SYNC: 0x30, GET_PARAMETER: 0x41, SET_DEVICE: 0x42, SET_DEVICE_EXT: 0x45, ENTER_PROGMODE: 0x50, LEAVE_PROGMODE: 0x51,
  LOAD_ADDRESS: 0x55, UNIVERSAL: 0x56, PROG_PAGE: 0x64, READ_PAGE: 0x74, READ_SIGN: 0x75,
};

/** The Arduino boards' bootloaders (Optiboot): their baud rate, their chip, its signature and flash page, the flash the
 *  bootloader leaves the program (Optiboot's 512 bytes at its top). */
export const BOOTLOADERS = {
  'arduino-uno': { baud: 115200, chip: 'ATmega328P', signature: [0x1e, 0x95, 0x0f], page: 128, flash: 32256 },
  'arduino-nano': { baud: 115200, chip: 'ATmega328P', signature: [0x1e, 0x95, 0x0f], page: 128, flash: 32256 },
};

/** The command packets, as the programmer sends them (each ends with CRC_EOP). */
export const packet = {
  sync: () => [STK.GET_SYNC, STK.CRC_EOP],
  enterProgmode: () => [STK.ENTER_PROGMODE, STK.CRC_EOP],
  leaveProgmode: () => [STK.LEAVE_PROGMODE, STK.CRC_EOP],
  readSignature: () => [STK.READ_SIGN, STK.CRC_EOP],
  /** The address of the next page: a word address (the byte address / 2), low byte first. */
  loadAddress: byteAddr => [STK.LOAD_ADDRESS, (byteAddr >> 1) & 0xff, (byteAddr >> 9) & 0xff, STK.CRC_EOP],
  /** A page of the flash ('F') programmed: its length, high byte first, then its bytes. */
  progPage: bytes => [STK.PROG_PAGE, (bytes.length >> 8) & 0xff, bytes.length & 0xff, 0x46, ...bytes, STK.CRC_EOP],
  /** A page of the flash read: its length, high byte first. */
  readPage: n => [STK.READ_PAGE, (n >> 8) & 0xff, n & 0xff, 0x46, STK.CRC_EOP],
};

const hex = b => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`;
const SYNC_TRIES = 10, TIMEOUT = 500;

// a command sent and its answer read: INSYNC, `n` bytes, OK; its bytes, or why not
async function command(t, bytes, n, what) {
  await t.write(bytes);
  let first;
  try { [first] = await t.read(1, TIMEOUT); } catch { throw new Error(`${what}: the bootloader did not answer`); }
  if (first === STK.NOSYNC) throw new Error(`${what}: the bootloader is out of sync (STK_NOSYNC)`);
  if (first !== STK.INSYNC) throw new Error(`${what}: the bootloader answered ${hex(first)}, not STK_INSYNC (0x14)`);
  let rest;
  try { rest = await t.read(n + 1, TIMEOUT); } catch { throw new Error(`${what}: the bootloader's answer was cut short`); }
  const last = rest[n];
  if (last === STK.FAILED) throw new Error(`${what}: the bootloader said STK_FAILED`);
  if (last !== STK.OK) throw new Error(`${what}: the bootloader ended its answer with ${hex(last)}, not STK_OK (0x10)`);
  return rest.slice(0, n);
}

/** The board reset by its DTR and RTS (its auto-reset capacitor), as avrdude's arduino programmer does: both low 250 ms,
 *  then high, the bootloader's start waited 50 ms. */
async function resetBoard(t) {
  await t.setSignals?.({ dataTerminalReady: false, requestToSend: false });
  await t.delay(250);
  await t.setSignals?.({ dataTerminalReady: true, requestToSend: true });
  await t.delay(50);
}

/** The bootloader in sync: GET_SYNC until it answers (at most 10 tries, what came before each dropped); the tries. */
async function sync(t) {
  for (let i = 1; ; i++) {
    t.drain?.();
    try { await command(t, packet.sync(), 0, 'sync'); return i; } catch (e) {
      if (i >= SYNC_TRIES) throw new Error(`no bootloader answered after ${SYNC_TRIES} tries (${e.message.replace(/^sync: /, '')}): is it the board's port, and its bootloader at this baud rate?`);
    }
  }
}

/**
 * The program `image` (its flash's bytes from address 0: a Uint8Array, its length the program's) loaded through the
 * bootloader on the transport `t`: reset, sync, the chip's signature checked (`signature`), every page programmed
 * (`page` bytes, the last one filled with 0xFF), read back and compared, the bootloader left. `flash`: the bytes the
 * bootloader leaves the program (a larger image refused). onProgress({ phase: 'write' | 'verify', done, total }).
 * Resolves { bytes, pages, tries }; throws why not.
 */
export async function stk500Upload(t, image, { signature = BOOTLOADERS['arduino-uno'].signature, page = 128, flash = 32256, onProgress = () => {} } = {}) {
  if (!image?.length) throw new Error('nothing to load: the firmware has no program');
  if (image.length > flash) throw new Error(`the program is ${image.length} bytes: more than the ${flash} the bootloader leaves it`);
  await resetBoard(t);
  const tries = await sync(t);
  const sig = await command(t, packet.readSignature(), 3, 'the chip\'s signature');
  if (sig.some((b, i) => b !== signature[i])) throw new Error(`the chip's signature is ${sig.map(hex).join(' ')}, not ${signature.map(hex).join(' ')}: another chip than the node's board's`);
  await command(t, packet.enterProgmode(), 0, 'programming mode');
  const pages = Math.ceil(image.length / page);
  const pageAt = k => { const p = new Uint8Array(page).fill(0xff); p.set(image.subarray(k * page, Math.min(image.length, (k + 1) * page))); return p; };
  for (let k = 0; k < pages; k++) {
    await command(t, packet.loadAddress(k * page), 0, `the address ${hex(k * page)}`);
    await command(t, packet.progPage([...pageAt(k)]), 0, `the page at ${hex(k * page)}`);
    onProgress({ phase: 'write', done: k + 1, total: pages });
  }
  for (let k = 0; k < pages; k++) {
    await command(t, packet.loadAddress(k * page), 0, `the address ${hex(k * page)}`);
    const got = await command(t, packet.readPage(page), page, `reading the page at ${hex(k * page)}`);
    const want = pageAt(k), at = got.findIndex((b, i) => b !== want[i]);
    if (at >= 0) throw new Error(`verification failed: the byte at ${hex(k * page + at)} is ${hex(got[at])} in the flash, ${hex(want[at])} in the firmware`);
    onProgress({ phase: 'verify', done: k + 1, total: pages });
  }
  await command(t, packet.leaveProgmode(), 0, 'leaving programming mode');
  return { bytes: image.length, pages, tries };
}

/** A firmware's program (core/avr-firmware.js readFirmware's: { program: its flash's words, size }) as its bytes from 0. */
export const imageBytes = fw => new Uint8Array(fw.program.buffer, fw.program.byteOffset, fw.size);

/**
 * A transport on a Web Serial port, opened at `baud`, 8N1: its bytes read into a queue as they come. { write, read(n, ms),
 * drain(), setSignals, delay, close() }.
 */
export async function serialTransport(port, baud) {
  await port.open({ baudRate: baud, dataBits: 8, parity: 'none', stopBits: 1 });
  const queue = [];
  let wake = null, closed = false, failure = null;
  const reader = port.readable.getReader();
  const reading = (async () => {
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; queue.push(...value); wake?.(); } } catch (e) { failure = e; } finally { reader.releaseLock(); closed = true; wake?.(); }
  })();
  return {
    async write(bytes) { const w = port.writable.getWriter(); try { await w.write(Uint8Array.from(bytes)); } finally { w.releaseLock(); } },
    async read(n, ms) {
      const end = Date.now() + ms;
      while (queue.length < n) {
        if (closed) throw failure || new Error('the serial port closed');
        const left = end - Date.now();
        if (left <= 0) throw new Error('timeout');
        await new Promise(r => { const id = setTimeout(() => { wake = null; r(); }, left); wake = () => { clearTimeout(id); wake = null; r(); }; });
      }
      return queue.splice(0, n);
    },
    drain() { queue.length = 0; },
    setSignals: s => port.setSignals?.(s),
    delay: ms => new Promise(r => setTimeout(r, ms)),
    async close() { try { await reader.cancel(); } catch { /* (its stream ended) */ } await reading; await port.close(); },
  };
}
