// silinx-pic24 - the PIC24FJ1024GB610 assembled (#5481): the core (mcu.js) and its peripherals, each a module of its
// own (osc.js, wdt.js…), in the order of their reset. A peripheral not here is not emulated: its SFRs are memory.

import { Pic24Mcu } from './mcu.js';
import { Oscillator } from './osc.js';
import { Watchdog } from './wdt.js';
import { Ports } from './gpio.js';
import { Timers } from './timers.js';
import { createUarts } from './uart.js';
import { Pps } from './pps.js';
import { ExternalInterrupts } from './extint.js';
import { Adc } from './adc.js';
import { Pmp } from './pmp.js';

/** The device: { mcu, cpu, osc, wdt, ports, timers, uarts (UART1-6), pps, adc, pmp }. opts: Pic24Mcu's (program, config, primaryHz, log); fcy: the instruction
 *  clock forced (the oscillator's ignored). */
export function createGb610(opts = {}) {
  const mcu = new Pic24Mcu(opts);
  if (opts.fcy) mcu.forcedFcy = opts.fcy;
  const osc = new Oscillator(mcu);
  const wdt = new Watchdog(mcu);
  const ports = new Ports(mcu);
  const timers = new Timers(mcu);
  const uarts = createUarts(mcu);
  const pps = new Pps(mcu, ports, osc);
  new ExternalInterrupts(mcu, ports, pps);
  const adc = new Adc(mcu, ports);
  mcu.timerPeriod = (name) => adc.trigger(name);
  const pmp = new Pmp(mcu);
  // UART1-4 through PPS (UxTX an output function, UxRX an input one); UART5 and 6 on their fixed pins
  const FIXED = { 5: { tx: 'RD1', rx: 'RD6' }, 6: { tx: 'RB7', rx: 'RB12' } };
  for (const u of uarts) {
    if (u.n <= 4) {
      u.onTxBits((b, t) => pps.outputAt(`U${u.n}TX`, b, t));
      u.rxLevel = () => pps.input(`U${u.n}RX`);
      pps.watch(`U${u.n}RX`, (level) => u.rxEdge(level));
    } else {
      const { tx, rx } = FIXED[u.n];
      u.onTxBits((b, t) => { const set = () => ports.override(tx, `U${u.n}TX`, b); if (t <= mcu.time) set(); else mcu.schedule(t, set); });
      u.rxLevel = () => ports.level(rx) ?? 0;
      ports.onLevel((pin, level) => { if (pin === rx) u.rxEdge(level); });
    }
  }
  mcu.powerOn();
  return { mcu, cpu: mcu.cpu, osc, wdt, ports, timers, uarts, pps, adc, pmp };
}
