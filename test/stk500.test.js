// An Arduino's firmware through its bootloader (#5448, core/stk500.js), against a simulated Optiboot (core/stk500-sim.js),
// never a board: every packet as Atmel's AVR061 (STK500 version 1) gives it; a whole upload on a fake Web Serial port (the
// board reset by DTR, sync, the signature, each page loaded, programmed, read back), its flash the firmware's (an
// independent reference: the .hex's bytes read by core/avr-firmware.js) and the program started; the refusals: no
// bootloader (no reset, a wrong baud rate), another chip, a byte that does not take, a wrong answer, a program too big.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOTLOADERS, STK, imageBytes, packet, serialTransport, stk500Upload } from '../core/stk500.js';
import { Optiboot, simulatedPort } from '../core/stk500-sim.js';
import { readFirmware } from '../core/avr-firmware.js';
import { avrAssemble, intelHex } from './avr-asm.mjs';

// a transport straight on the simulated bootloader (no port): its delays none
function direct(boot) {
  const q = [];
  let dtr = true;
  return {
    sent: [],
    async write(b) { this.sent.push([...b]); q.push(...boot.feed(b)); },
    async read(n) { if (q.length < n) throw new Error('timeout'); return q.splice(0, n); },
    drain() { q.length = 0; },
    async setSignals(s) { if (s.dataTerminalReady && !dtr) boot.reset(); dtr = s.dataTerminalReady; },
    async delay() {},
  };
}
// a program of `n` bytes (rjmp's and nop's), its .hex read back as the node's firmware is
function firmware(words) {
  const fw = readFirmware('fw.hex', intelHex(Uint16Array.from(words)));
  assert.ok(!fw.error, fw.error);
  return imageBytes(fw);
}
const LOOP = [...avrAssemble(['ldi r16, 0x20', 'out 0x04, r16', 'loop:', 'rjmp loop'])];

test('#5448 the packets: AVR061\'s bytes, the address a word address low byte first, a page\'s length high byte first', () => {
  assert.deepEqual(packet.sync(), [0x30, 0x20]);
  assert.deepEqual(packet.enterProgmode(), [0x50, 0x20]);
  assert.deepEqual(packet.leaveProgmode(), [0x51, 0x20]);
  assert.deepEqual(packet.readSignature(), [0x75, 0x20]);
  assert.deepEqual(packet.loadAddress(0x0000), [0x55, 0x00, 0x00, 0x20]);
  assert.deepEqual(packet.loadAddress(0x0080), [0x55, 0x40, 0x00, 0x20]);
  assert.deepEqual(packet.loadAddress(0x7e00), [0x55, 0x00, 0x3f, 0x20]);
  assert.deepEqual(packet.progPage([1, 2, 3]), [0x64, 0x00, 0x03, 0x46, 1, 2, 3, 0x20]);
  assert.deepEqual(packet.progPage(new Array(256).fill(0)).slice(0, 4), [0x64, 0x01, 0x00, 0x46]);
  assert.deepEqual(packet.readPage(128), [0x74, 0x00, 0x80, 0x46, 0x20]);
  assert.deepEqual([STK.INSYNC, STK.OK, STK.NOSYNC, STK.CRC_EOP], [0x14, 0x10, 0x15, 0x20]);
  assert.deepEqual(BOOTLOADERS['arduino-uno'], { baud: 115200, chip: 'ATmega328P', signature: [0x1e, 0x95, 0x0f], page: 128, flash: 32256 });
  // (the simulated Optiboot's answers: in sync, the signature, an unknown command)
  const boot = new Optiboot();
  assert.deepEqual(boot.feed([0x30, 0x20]), [], 'not reset: the program runs, nothing answers');
  boot.reset();
  assert.deepEqual(boot.feed([0x30, 0x20]), [0x14, 0x10]);
  assert.deepEqual(boot.feed([0x75, 0x20]), [0x14, 0x1e, 0x95, 0x0f, 0x10]);
  assert.deepEqual(boot.feed([0x41, 0x81, 0x20]), [0x14, 0x08, 0x10]);
  assert.deepEqual(boot.feed([0x99, 0x20]), [0x14, 0x12]);
  assert.deepEqual(boot.feed([0x30, 0x00]), [], 'no CRC_EOP: its watchdog reset');
  assert.equal(boot.running, false);
});

test('#5448 a whole upload on a fake Web Serial port: reset, sync, signature, the pages written and verified; the flash the firmware\'s', async () => {
  // (a program of three pages and a bit: 200 words)
  const words = [...LOOP, ...Array.from({ length: 200 - LOOP.length }, (_, i) => (i % 2 ? 0x0000 : 0xcfff))];
  const image = firmware(words);
  assert.equal(image.length, 400);
  const boot = new Optiboot(), port = simulatedPort(boot), steps = [];
  const t = await serialTransport(port, 115200);
  const r = await stk500Upload(t, image, { onProgress: p => steps.push(`${p.phase} ${p.done}/${p.total}`) });
  await t.close();
  assert.deepEqual(r, { bytes: 400, pages: 4, tries: 1 });
  assert.deepEqual(port.opens, [{ baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1 }]);
  assert.equal(port.closed, 1);
  assert.deepEqual(steps, ['write 1/4', 'write 2/4', 'write 3/4', 'write 4/4', 'verify 1/4', 'verify 2/4', 'verify 3/4', 'verify 4/4']);
  // (the flash: the .hex's bytes, then 0xFF; the program started)
  const want = new Uint8Array(512).fill(0xff);
  want.set(intelHexBytes(words));
  assert.deepEqual([...boot.flash.subarray(0, 512)], [...want]);
  assert.equal(boot.started, 1);
  // (the commands in order: sync, signature, progmode, 4 × (address, page), 4 × (address, read), leave)
  const codes = boot.commands.map(c => c[0]);
  assert.deepEqual(codes, [0x30, 0x75, 0x50, ...Array(4).fill([0x55, 0x64]).flat(), ...Array(4).fill([0x55, 0x74]).flat(), 0x51]);
  assert.deepEqual(boot.commands.filter(c => c[0] === 0x55).map(c => c.slice(1, 3)), [[0, 0], [0x40, 0], [0x80, 0], [0xc0, 0], [0, 0], [0x40, 0], [0x80, 0], [0xc0, 0]]);
  assert.ok(boot.commands.filter(c => c[0] === 0x64).every(c => c.length === 4 + 128 + 1));
});

// the words' bytes, little-endian (the AVR's flash), as an independent reference of the image
function intelHexBytes(words) { return words.flatMap(w => [w & 0xff, w >> 8]); }

test('#5448 the refusals: no bootloader, a wrong baud rate, another chip, a byte that does not take, a wrong answer, too big, nothing', async () => {
  const image = firmware(LOOP);
  // (no reset: the transport cannot pulse DTR; the program runs and answers nothing)
  const noReset = direct(new Optiboot());
  delete noReset.setSignals;
  await assert.rejects(stk500Upload(noReset, image), { message: 'no bootloader answered after 10 tries (the bootloader did not answer): is it the board\'s port, and its bootloader at this baud rate?' });
  assert.equal(noReset.sent.length, 10);
  // (the port at 57600 for a 115200 bootloader: garbage, nothing answers)
  const slow = await serialTransport(simulatedPort(new Optiboot()), 57600);
  slow.delay = async () => {};
  await assert.rejects(stk500Upload({ ...slow, read: (n) => slow.read(n, 5) }, image), /^Error: no bootloader answered after 10 tries/);
  await slow.close();
  await assert.rejects(stk500Upload(direct(new Optiboot({ faults: { signature: [0x1e, 0x95, 0x14] } })), image), { message: 'the chip\'s signature is 0x1E 0x95 0x14, not 0x1E 0x95 0x0F: another chip than the node\'s board\'s' });
  const stuck = new Optiboot({ faults: { stuck: 3 } });
  await assert.rejects(stk500Upload(direct(stuck), image), { message: 'verification failed: the byte at 0x03 is 0xFF in the flash, 0xB9 in the firmware' });
  assert.equal(stuck.started, 0, 'not started after a failed verification');
  await assert.rejects(stk500Upload(direct(new Optiboot({ faults: { insync: 0x00 } })), image), { message: 'no bootloader answered after 10 tries (the bootloader answered 0x00, not STK_INSYNC (0x14)): is it the board\'s port, and its bootloader at this baud rate?' });
  await assert.rejects(stk500Upload(direct(new Optiboot()), new Uint8Array(32258)), { message: 'the program is 32258 bytes: more than the 32256 the bootloader leaves it' });
  await assert.rejects(stk500Upload(direct(new Optiboot()), new Uint8Array(0)), { message: 'nothing to load: the firmware has no program' });
  // (a bootloader that loses sync after the signature: said with its command)
  const lost = new Optiboot();
  const t = direct(lost);
  const feed = lost.feed.bind(lost);
  lost.feed = b => (b[0] === STK.ENTER_PROGMODE ? [STK.NOSYNC] : feed(b));
  await assert.rejects(stk500Upload(t, image), { message: 'programming mode: the bootloader is out of sync (STK_NOSYNC)' });
});
