// silinx-pic24 - the PIC24FJ1024GB610 assembled (#5481): the core (mcu.js) and its peripherals, each a module of its
// own (osc.js, wdt.js…), in the order of their reset. A peripheral not here is not emulated: its SFRs are memory.

import { Pic24Mcu } from './mcu.js';
import { Oscillator } from './osc.js';
import { Watchdog } from './wdt.js';
import { Ports } from './gpio.js';
import { Timers } from './timers.js';

/** The device: { mcu, cpu, osc, wdt, ports, timers }. opts: Pic24Mcu's (program, config, primaryHz, log); fcy: the instruction
 *  clock forced (the oscillator's ignored). */
export function createGb610(opts = {}) {
  const mcu = new Pic24Mcu(opts);
  if (opts.fcy) mcu.forcedFcy = opts.fcy;
  const osc = new Oscillator(mcu);
  const wdt = new Watchdog(mcu);
  const ports = new Ports(mcu);
  const timers = new Timers(mcu);
  mcu.powerOn();
  return { mcu, cpu: mcu.cpu, osc, wdt, ports, timers };
}
