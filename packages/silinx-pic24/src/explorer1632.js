// silinx-pic24 - the Explorer 16/32 board with the PIC24FJ1024GB610 PIM (MA240023) (#5481): what the board connects
// to the device's pins, from the board's schematic (Explorer 16/32, R6.3) and the PIM's information sheet
// (DS50002423A: its pins one-to-one with the board's 100-pin connector but a few). The node's wiring (#5484) draws it.
//
//   LEDs D3-D10       RA0-RA7, lit by a 1 (D10 shares RA7 with S5)
//   buttons           S3 RD6, S4 RD13, S5 RA7, S6 RD7: a press pulls the pin to 0, the board's 10 kΩ pulls it to 1
//   potentiometer R6  AN5 (RB5), 0 to 3.3 V
//   TC1047A           AN4 (RB4), 500 mV + 10 mV/°C
//   USB-UART          the MCP2221A: the device's RX on RF4 (RP10), its TX on RF5 (RP17)
//   LCD               16x2, HD44780-compatible, through the PMP: PMD0-7 RE0-RE7, RS PMA0 (RB15), E PMWR/PMENB
//                     (RD4), R/W PMRD (RD5)
//   EEPROM            25LC256 on SPI: SCK RG6 (RP21), SO to the device's SDI RG7 (RP26), SI from its SDO RG8 (RP19),
//                     CS RD12 (the PIM's jumpers in their EPMP position; RG0 in their USB position)
//   crystals          8 MHz on OSCI / OSCO, 32.768 kHz on SOSCI / SOSCO (the PIM's)

export const EXPLORER_1632 = {
  leds: { D3: 'RA0', D4: 'RA1', D5: 'RA2', D6: 'RA3', D7: 'RA4', D8: 'RA5', D9: 'RA6', D10: 'RA7' },
  buttons: { S3: 'RD6', S4: 'RD13', S5: 'RA7', S6: 'RD7' },
  analog: { R6: 'AN5', TC1047A: 'AN4' },
  uart: { rx: 'RF4', tx: 'RF5' },
  lcd: { data: ['RE0', 'RE1', 'RE2', 'RE3', 'RE4', 'RE5', 'RE6', 'RE7'], rs: 'RB15', e: 'RD4', rw: 'RD5' },
  eeprom: { sck: 'RG6', so: 'RG7', si: 'RG8', cs: 'RD12' },
  primaryHz: 8e6,
};

import { SerialTerminal } from './serial.js';
import { CharacterLcd } from './lcd.js';

export class Explorer1632 {
  /** The board around a device (gb610.js's): its buttons released (their pull-ups on the pins), the potentiometer at
   *  its middle, the room at 25 °C, its LCD (lcd) on the PMP. */
  constructor(dev) {
    this.dev = dev;
    this.pressed = new Set();
    for (const b of Object.keys(EXPLORER_1632.buttons)) this.release(b);
    this.setPotentiometer(0.5);
    this.setTemperature(25);
    // the LCD on the PMP: no chip select (its E the write strobe of any cycle), RS on PMA0
    const { mcu } = dev;
    this.lcd = new CharacterLcd({ now: () => mcu.time, say: (t) => mcu.cpu.say('warning', t, 'lcd-busy') });
    dev.pmp.attach('any', { write: (a, v) => this.lcd.write(a & 1, v), read: (a) => this.lcd.read(a & 1) });
  }

  get ports() { return this.dev.ports; }

  /** The USB-UART (the MCP2221A) as a terminal: the device's TX on RF5, its RX on RF4, at the terminal's baud. */
  usbUart(baud = 9600) {
    this.terminal ??= new SerialTerminal(this.dev, { tx: EXPLORER_1632.uart.tx, rx: EXPLORER_1632.uart.rx, baud });
    return this.terminal;
  }

  /** The potentiometer R6 (AN5) at a share of its travel, 0 to 1: 0 to 3.3 V. */
  setPotentiometer(share) { this.dev.adc.setAnalog(EXPLORER_1632.analog.R6, 3.3 * Math.max(0, Math.min(1, share))); }
  /** The TC1047A (AN4) at a temperature (°C, -40 to 125): 500 mV + 10 mV/°C. */
  setTemperature(c) { this.dev.adc.setAnalog(EXPLORER_1632.analog.TC1047A, 0.5 + 0.01 * Math.max(-40, Math.min(125, c))); }

  /** A button pressed (its pin to 0). */
  press(name) { this.button(name, true); }
  release(name) { this.button(name, false); }
  button(name, down) {
    const pin = EXPLORER_1632.buttons[name];
    if (!pin) throw new Error(`the Explorer 16/32 has no button '${name}' (S3, S4, S5, S6)`);
    if (down) this.pressed.add(name); else this.pressed.delete(name);
    this.ports.setInput(pin, down ? 0 : 1);
  }

  /** The LEDs lit: { D3: true, … }; an LED is lit while the device drives its pin to 1. */
  leds() {
    return Object.fromEntries(Object.entries(EXPLORER_1632.leds).map(([d, pin]) => [d, this.ports.driven(pin) === 1]));
  }
}
