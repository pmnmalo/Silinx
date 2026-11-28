// silinx-pic24 - the configuration words read (#5480, DS30010074 section 30): the oscillator that FOSCSEL and FOSC
// select, and so the instruction clock (Fcy = Fosc / 2), the watchdog FWDT enables, and the JTAG port FICD's JTAGEN
// enables (#6027, register 30-10). An erased word reads as all ones (its defaults: the FRC divided, the watchdog on,
// wdt.js's, the JTAG port on, gpio.js's).

import { CONFIG_WORDS } from './device.js';

const FRC_HZ = 8e6, LPRC_HZ = 31e3, SOSC_HZ = 32768;
// the Explorer 16/32's primary oscillator: an 8 MHz crystal (its PIM's)
const PRIMARY_HZ = 8e6;
const MAX_FOSC = 32e6;

const FNOSC = ['FRC', 'FRCPLL', 'PRI', 'PRIPLL', 'SOSC', 'LPRC', 'DCO', 'FRCDIV'];

/** The configuration: each word's value (its low 16 bits), the oscillator { source, fosc, fcy }, the watchdog
 *  ('on', 'off', 'software', 'active') and jtag (FICD's JTAGEN: the JTAG port on RA0, RA1, RA4, RA5). progWord(addr):
 *  the program word at addr. */
export function readConfig(progWord, { primaryHz = PRIMARY_HZ } = {}) {
  const words = {};
  for (const [name, addr] of Object.entries(CONFIG_WORDS)) words[name] = progWord(addr) & 0xffffff;
  const foscsel = words.FOSCSEL, fnosc = foscsel & 7, pllmode = (foscsel >> 3) & 15;
  const source = FNOSC[fnosc], warnings = [];
  // the PLL: the 96 MHz USB PLL (PLLMODE 0xxx) gives a 32 MHz system clock (CLKDIV's CPDIV at its reset value, /1);
  // 4x, 6x, 8x its input times 4, 6, 8
  const pll = (input) => {
    if (pllmode < 8) return 32e6;
    const k = { 12: 4, 13: 6, 14: 8 }[pllmode];
    return k ? input * k : input;
  };
  let fosc;
  switch (source) {
    case 'FRC': fosc = FRC_HZ; break;
    case 'FRCPLL': fosc = pll(FRC_HZ); break;
    case 'PRI': fosc = primaryHz; break;
    case 'PRIPLL': fosc = pll(primaryHz); break;
    case 'SOSC': fosc = SOSC_HZ; break;
    case 'LPRC': fosc = LPRC_HZ; break;
    case 'DCO': fosc = FRC_HZ; break;
    default: fosc = FRC_HZ / 2;   // (OSCFDIV: the FRC through CLKDIV's RCDIV, /2 at reset)
  }
  if (fosc > MAX_FOSC) { warnings.push(`the oscillator's ${fosc / 1e6} MHz is above the device's 32 MHz`); }
  const fwdten = (words.FWDT >> 5) & 3;
  const watchdog = ['off', 'active', 'software', 'on'][fwdten];
  const jtag = ((words.FICD >> 5) & 1) === 1;
  return { words, oscillator: { source, fosc, fcy: fosc / 2 }, watchdog, jtag, warnings };
}
