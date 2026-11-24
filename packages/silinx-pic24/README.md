# silinx-pic24

A PIC24F core emulator in JavaScript: the core of Microchip's PIC24FJ1024GB610 (the Explorer 16/32's), with no
dependency, the same in Node and in the browser. No open emulator of the 16-bit PIC24 or dsPIC existed (gpsim and
picsim are 8-bit only), so Silinx, the IDE that uses it, has its own, as avr8js is the AVR's
([#5480](https://github.com/pmnmalo/Silinx/issues/5480), part of the roadmap
[#5479](https://github.com/pmnmalo/Silinx/issues/5479): the design is in
[docs/SYSTEMS.md](../../docs/SYSTEMS.md), "The PIC24").

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

Its references are Microchip's "16-bit MCU and DSC Programmer's Reference Manual" (DS70000157) and the
PIC24FJ1024GA610/GB610 family's data sheet (DS30010074). The peripherals (the ports, the timers, the UART, SPI,
I²C, the ADC, the PMP and the LCD, PPS) are the next phase
([#5481](https://github.com/pmnmalo/Silinx/issues/5481)), MPLAB X's simulator its oracle
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

It imports nothing of Silinx and no npm package (`test/silinx-pic24-package.test.js`). Its tests are Silinx's,
`test/pic24-*.test.js`, with a test-side assembler (`test/pic24-asm.mjs`). Not published yet.

Licence: MIT ([LICENSE](LICENSE)).
