# silinx-pic24

A PIC24F emulator in JavaScript: Microchip's PIC24FJ1024GB610, its core and its peripherals, on the Explorer 16/32
board, with no dependency, the same in Node and in the browser. No open emulator of the 16-bit PIC24 or dsPIC
existed (gpsim and picsim are 8-bit only), so Silinx, the IDE that uses it, has its own, as avr8js is the AVR's
([#5480](https://github.com/pmnmalo/Silinx/issues/5480), part of the roadmap
[#5479](https://github.com/pmnmalo/Silinx/issues/5479): the design is in [docs/SYSTEMS.md](../../docs/SYSTEMS.md),
"The PIC24").

The core:

- the 24-bit instruction words and the PIC24F's instruction set (no DSP engine, no DO), their cycles at
  Fcy = Fosc / 2, branches, skips, the RAW stalls, the program space reads' extra cycles included;
- W0–W15 (W15 the stack pointer, SPLIM its limit), the status register's flags, the addressing modes (register
  direct and indirect, pre/post increment and decrement, register offset, literal offset, file register,
  literal), byte and word operations;
- the program memory (the table reads and writes, the EDS window and its program space visibility), the data
  memory and the SFRs as a bus that peripherals attach to;
- REPEAT, the iterative divides, the multiplies;
- the interrupt controller: the vector table, the priorities and the CPU's IPL, nesting, RETFIE, the traps;
- the resets an illegal instruction or an uninitialized W register as a pointer cause.

The device and its peripherals (since 0.2.0, [#5481](https://github.com/pmnmalo/Silinx/issues/5481)):

- the oscillator (FRC, the 8 MHz primary, SOSC, LPRC, the PLL, the clock switch), the watchdog, RCON's resets;
- the I/O ports with the interrupt-on-change, PPS (the remappable pins), the external interrupts INT0–INT4;
- Timer1 to Timer5 (Timer2 / 3 and Timer4 / 5 as 32-bit timers, the SOSC and LPRC clocks, Timer3's A/D trigger);
- the UARTs, the SPI and I²C masters, the PMP (master modes), the 10/12-bit A/D converter with its scan;
- the MCCP and SCCP modules (since 0.3.0, [#5529](https://github.com/pmnmalo/Silinx/issues/5529)): their timers, output compare,
  PWM on the pins (dual edge, buffered) and input capture; the input capture and output compare modules with
  dedicated timers, IC1–6 and OC1–6 (compare, edge-aligned PWM, synchronised to a timer).

The Explorer 16/32 board around it (`Explorer1632`): the LEDs D3–D10, the buttons S3–S6, the potentiometer R6 and
the TC1047A temperature sensor, the USB-UART, the 16x2 character LCD on the PMP, the 25LC256 EEPROM on SPI.

Left out: center-aligned PWM, dead time, auto-shutdown, the Faults and the cascaded 32-bit IC / OC; the pins' waveforms of SPI, I²C and the PMP (a word, an
event, a transaction); their slave modes; USB, the RTCC, the CRC, the comparators, the CTMU, DMA and the
cryptographic engine; the timers' external clocks and gated mode.

Two things that surprise a first program, as on the real device:

- RD6 and RD7 (the buttons S3 and S6) and RA6 and RA7 (the LEDs D9 and D10, S5) are analog at reset: they read 0
  until the program clears their bits in ANSD and ANSA (`ANSD = 0; ANSA = 0;` or `_ANSD6 = 0`…);
- the watchdog is on when the configuration words are erased (FWDT's FWDTEN 11): a program without
  `#pragma config FWDTEN = OFF` (or `CLRWDT` in its loop) resets after about two minutes (the erased FWPSA and
  WDTPS: 128 x 32,768 periods of the 31 kHz LPRC).

Its references are Microchip's "16-bit MCU and DSC Programmer's Reference Manual" (DS70000157) and the
PIC24FJ1024GA610/GB610 family's data sheet (DS30010074), MPLAB X's simulator its oracle
([#5483](https://github.com/pmnmalo/Silinx/issues/5483)).

```js
import { CPU } from 'silinx-pic24';

const cpu = new CPU(programWords);   // the program memory's 24-bit words, index = address / 2
cpu.step();                          // one instruction: its cycles
cpu.run(1000);                       // 1000 instruction cycles
cpu.writeHooks[0x02c4] = (value, old, addr, mask) => false;   // a peripheral's SFR
```

As a node of a Silinx System, loaded from XC16's `.hex` (its configuration words give the oscillator, so Fcy):

```js
import { Pic24Node } from 'silinx-pic24';

const node = new Pic24Node({ hex });                            // XC16's Intel HEX
const { outputs } = node.run(1e9, [{ t: 5e8, pin: 'RD6', value: 0 }]);   // to 1 ms (ps), an input at 0.5 ms
```

Its shape is avr8js's: `cpu.cycles` counts the instruction cycles, `cpu.readHooks` and `cpu.writeHooks` are the
SFRs' hooks, `cpu.addClockEvent(fn, cycles)` a peripheral's timing, `cpu.raise(irq)` its interrupt request.

It has its own assembler (#5930, #5931), so a program needs no XC16: `assembleProgram(source, { file })` reads xc16-as's
syntax (`.include "p24FJ1024GB610.inc"`, `.global __reset`, `.text`, `.bss` with `.space`, `.equ`, `.word` / `.pword`,
`config __FWDT, FWDTEN_OFF`, the device's registers and bits by name, `tblpage()` / `tbloffset()` / `handle()`) and links it
as XC16's linker places it (the reset vector, the vector table's handlers and `__DefaultInterrupt`, the code from 0x200,
the configuration words): `{ hex, words, labels, config, errors, warnings }`, its errors and warnings by file and line.

```js
import { assembleProgram, Pic24Node } from 'silinx-pic24';

const { hex, errors } = assembleProgram(source, { file: 'blink.s' });
const node = new Pic24Node({ hex });
```

It imports nothing of Silinx and no npm package (`test/silinx-pic24-package.test.js`). Its tests are Silinx's,
`test/pic24-*.test.js`.

It is published on npm (`npm install silinx-pic24`), with npm's provenance, from its own tags
([#5509](https://github.com/pmnmalo/Silinx/issues/5509)). A release: `node scripts/changelog-release.mjs X --package
silinx-pic24` (its [changes/](changes/) assembled into [CHANGELOG.md](CHANGELOG.md)), `npm version X -w silinx-pic24
--no-git-tag-version`, `node scripts/sync-version.mjs --package silinx-pic24`, a commit on `main`, then the tag
`silinx-pic24-vX`: it starts Silinx's CI, and `.github/workflows/silinx-pic24-release.yml` publishes the package once
that run has passed.

Licence: MIT ([LICENSE](LICENSE)).
