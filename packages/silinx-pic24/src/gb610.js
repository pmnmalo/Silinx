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
import { createSpis } from './spi.js';
import { createI2cs } from './i2c.js';
import { createCcps } from './ccp.js';
import { createIcOc } from './icoc.js';

// MCCPx's OCMxA-F pins, the modules' ICMx pins (table 5)
const OCM_PINS = [['RG6', 'RG7', 'RG15', 'RC1', 'RA6', 'RA7'], ['RG8', 'RG9', 'RC2', 'RC3', 'RG12', 'RG13'], ['RB5', 'RB4', 'RC4', 'RA0', 'RD12', 'RD13']];
const ICM_PINS = ['RG6', 'RG8', 'RB5', 'RD1', 'RD8', 'RD0', 'RD3'];
// OC4-6's and IC4-6's fixed pins
const OC_PINS = ['RD6', 'RD7', 'RF0'], IC_PINS = ['RE5', 'RE6', 'RE7'];

/** The device: { mcu, cpu, osc, wdt, ports, timers, uarts (UART1-6), pps, adc, pmp, spis (SPI1-3), i2cs (I2C1-3), ccps (MCCP1-3, SCCP4-7), ocs (OC1-6), ics (IC1-6) }. opts: Pic24Mcu's (program, config, primaryHz, log); fcy: the instruction
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
  const pmp = new Pmp(mcu);
  const spis = createSpis(mcu);
  const i2cs = createI2cs(mcu);
  // MCCP1-3's outputs and every module's ICMx input on fixed pins, SCCP4-7's output through PPS (OCM4-7)
  const ccps = createCcps(mcu, (n, letter, level) => {
    if (n > 3) pps.output(`OCM${n}`, level);
    else ports.override(OCM_PINS[n - 1]['ABCDEF'.indexOf(letter)], `OCM${n}${letter}`, level);
  });
  ports.onLevel((pin, level) => { const k = ICM_PINS.indexOf(pin); if (k >= 0) ccps[k].input(level); });
  // OC1-3 and IC1-3 through PPS, OC4-6 and IC4-6 on their fixed pins; their timers' sync from Timer1-3's matches and
  // the CCP modules' periods (and the timers' matches the A/D's triggers)
  const { ocs, ics, sync } = createIcOc(mcu, timers, (n, level) => {
    if (n <= 3) pps.output(`OC${n}`, level);
    else ports.override(OC_PINS[n - 4], `OC${n}`, level);
  });
  for (const ic of ics.slice(0, 3)) pps.watch(`IC${ic.n}`, (level) => ic.input(level));
  ports.onLevel((pin, level) => { const k = IC_PINS.indexOf(pin); if (k >= 0) ics[k + 3].input(level); });
  for (const c of ccps) c.listeners.push(() => sync({ ccp: c.n }));
  mcu.timerPeriod = (name) => { adc.trigger(name); sync({ timer: name }); };
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
  return { mcu, cpu: mcu.cpu, osc, wdt, ports, timers, uarts, pps, adc, pmp, spis, i2cs, ccps, ocs, ics };
}
