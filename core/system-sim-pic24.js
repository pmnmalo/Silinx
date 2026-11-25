// Silinx - a System's PIC24 node (#5484; the scheduler: core/system-sim.js, the contract: core/system-contract.js): the
// Explorer 16/32's PIC24FJ1024GB610 run by silinx-pic24 (packages/silinx-pic24, MIT: its core and peripherals, #5480,
// #5481), its firmware a given .hex (XC16's Intel HEX; compiling C is #5482's). The board is around it as on the bench
// (silinx-pic24's Explorer1632): its buttons' pull-ups (S3 RD6, S4 RD13, S5 RA7, S6 RD7), the potentiometer at its
// middle, the room at 25 °C, the LCD on the PMP, the EEPROM on SPI. Its pins are the device's port pins (RA0..RG15),
// each an input and an output of the node at 3.3 V: a pin's value 0 or 1 when the device (its port, or a peripheral
// through PPS: a UART's TX) drives it, else its level from outside (a link's, the board's pull-up), null floating. Its
// UART is pins: the System's UART link takes the USB-UART's place (TX RF5, RX RF4).
//
//   const node = pic24Contract({ firmware: { name: 'pic/blink.hex', data: text } });   // a contract node
//
// Isomorphic ES module, no DOM: silinx-pic24 has no dependency (node_modules nor an import map needed).
import { Pic24Node, Explorer1632 } from '../packages/silinx-pic24/src/index.js';
import { ContractNode } from './system-contract.js';
import { mcuBoard } from './system-doc.js';

const BOARD = 'explorer-1632';

/** What silinx-pic24 models and what it does not (the node contract's fidelity notes, #5499). */
export const PIC24_FIDELITY = [
  { kind: 'models', text: 'the PIC24FJ1024GB610 instruction by instruction at Fcy (its configuration words\' oscillator): its ports, PPS, timers, input capture and output compare, UARTs, A/D converter, PMP, interrupts and watchdog' },
  { kind: 'models', text: 'the Explorer 16/32 around it: its buttons\' pull-ups, the potentiometer (AN5), the temperature sensor (AN4), the 16x2 LCD on the PMP, the 25LC256 EEPROM on SPI' },
  { kind: 'approximates', text: 'a UART\'s pins as its frames\' bits at the program\'s baud' },
  { kind: 'omits', text: 'SPI\'s, I²C\'s and the PMP\'s pin waveforms (their links: #5484\'s next part)' },
];

/** The PIC24 on its board as an engine with the contract's run of its own (wrapped by pic24Contract). firmware:
 *  { name, data } (a .hex's text). A firmware not read: the node finished at once, its message logged. */
export class Pic24Board {
  constructor({ board = BOARD, firmware } = {}) {
    const b = mcuBoard(board);
    if (b?.arch !== 'pic24') throw new Error(`no PIC24 board '${board}'`);
    this.board = b;
    this.finished = null;
    this.log = [];
    this.logN = 0;
    let node;
    try {
      if (!/\.hex$/i.test(String(firmware?.name ?? ''))) throw new Error(`${firmware?.name ?? 'no firmware'} is not a .hex`);
      node = new Pic24Node({ hex: String(firmware.data ?? ''), primaryHz: 8e6 });
    } catch (e) {
      this.finished = 'error';
      this.log.push({ kind: 'error', time: 0, text: `its firmware ${firmware?.name ?? ''}: ${e.message}` });
      node = new Pic24Node({ program: [], primaryHz: 8e6 });
    }
    this.pic = node;
    this.explorer = new Explorer1632(node.device);
    this.inputs = [...b.pins];
    this.outputs = [...b.pins];
  }

  get now() { return this.pic.time; }

  /** A pin's value now: the device's drive, else its level (from outside, a pull-up), null floating. */
  value(pin) { return this.pic.device.ports.level(pin); }

  run(t1, inputEvents = []) {
    if (this.finished) return { outputs: [], t: Math.max(t1, this.pic.time) };
    return this.pic.run(t1, inputEvents);
  }

  /** The emulator's log since the last call, its times in ps (a message's cycle at the node's Fcy now). */
  messages() {
    const cyc = 1e12 / this.pic.fcy;
    for (const m of this.pic.messages()) this.log.push({ kind: m.kind, time: Math.round(m.cycle * cyc), text: m.pc != null ? `${m.text} (PC 0x${m.pc.toString(16)})` : m.text });
    return this.log.slice(this.logN, (this.logN = this.log.length));
  }

  save() { return this.pic.save(); }
  restore(s) { this.pic.restore(s); }
}

/** A PIC24 node behind the node contract (core/system-contract.js): `opts` Pic24Board's ({ board, firmware }), its
 *  pins at its board's I/O level (3.3 V); its state its inputs, replayed on a new engine. */
export const pic24Contract = (opts) => new ContractNode({ make: () => new Pic24Board(opts), volts: mcuBoard(opts.board ?? BOARD)?.vio ?? null, fidelity: PIC24_FIDELITY });

/** The board's model (silinx-pic24's Explorer1632: its buttons, potentiometer, LCD) of a PIC24 node of the scheduler (its
 *  NodeEngine, around pic24Contract's ContractNode), or null: the System Emulator's (core/system-emu-explorer.js). */
export const explorerOf = (adapter) => adapter?.node?.engine?.explorer ?? null;
