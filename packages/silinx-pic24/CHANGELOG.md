# Changelog

What changed in each version of silinx-pic24, the Silinx PIC24 emulator. The newest version is first. Its versions
are its own (semver, 0.x until its API is stable), apart from Silinx's. What changed since the last release is in
[changes/](changes/).

## 0.3.4

In short:

- The JTAG port: on in an erased FICD, it takes RA0, RA1, RA4 and RA5 (the Explorer 16/32's LEDs D3, D4, D7, D8) as
  on the device; `config __FICD, JTAGEN_OFF` gives them back. The assembler's configuration words now reach the
  device (`config __FWDT, FWDTEN_OFF` turns the watchdog off).
- The assembler reads `DSRPAG`, `DSWPAG`, `TBLPAG`, `DISICNT` and the other names XC16's .inc gives a register's bit field
  as xc16-as does, and says so where a program uses one: the register is `_DSRPAG`. A source builds the same with
  Silinx's assembler and with XC16.
- A program that uses the RAM above 0x7FFF before it sets DSRPAG and DSWPAG (an assembly program with no start-up
  code, a variable XC16's linker placed there) runs as on the device: no address error trap.

In detail:

- **FICD's JTAGEN (#6027, register 30-10):** `readConfig` gives `jtag`, and the ports (`gpio.js`) drive none of TMS
  (RA0), TCK (RA1), TDI (RA4) and TDO (RA5) while it is on (no debugger shifting TDO), a warning the first time the
  program makes one an output. The assembler takes `config __FICD, JTAGEN_OFF` and `JTAGEN_ON` (`CONFIG_SETTINGS`).
- **The configuration words in `assembleProgram`'s .hex (#6037):** each was written at half its program address
  (`writeHex`'s base is the program address), so the device read them as erased; they are now at their addresses
  (FWDT at the HEX's byte 0x157E40, as XC16 writes it).
- **A name that is a register and its bit field (#6025):** XC16's `p24FJ1024GB610.inc` defines 27 registers' bit fields
  of the register's own name (`DSRPAG`, the field DSRPAG<9:0>, its position 0), which xc16-as reads before the linker
  script's register, so `mov w0, DSRPAG` is `mov w0, 0x0` (0x880000) to XC16; `assemble` took the register (0x880190).
  Those names (`FIELD_NAMES` in `gb610-names.js`, XC16 2.10's) are now their constant, each use warned of with the
  register's address, an `.equ` or a symbol of the name its own; every register is also `_NAME`, the linker script's.
  Found by XC16's build of uart-fpga-pic24's `lcd_uart.asm` (#6019), which now writes `_DSRPAG` and `_DSWPAG`.
- **DSRPAG and DSWPAG 0x0001 from the reset (#6023):** the PIC24FJ1024GB610's EDS window, 0x8000-0xFFFF, is the RAM
  above 0x7FFF from the reset on (DS30010074's register map); `CPU.reset()` cleared both pages to 0, so the first read or
  write there took an address error trap. Found by XC16's build of uart-fpga-pic24's `lcd_uart.asm` (#6019); a test
  runs its instruction words after a power-on and after an MCLR reset.

## 0.3.3

In short:

- BSET, BCLR, BTG, BTST, BTSTS, BTSS and BTSC on a file register test and change the bit XC16 means: a C program's
  waits on a flag and its port bits work.
- The assembler reads xc16-as's syntax and links a program as XC16 does: `assembleProgram(source)` gives its `.hex`.
- A PIC24F assembler: `assemble(source, { file })` gives a program's words, its labels, and its errors by file and line.

In detail:

- **A bit instruction on f, its bit as XC16 encodes it (#6017):** in `bbbf ffff ffff fffb` the last `b` is bit4<3> (and
  a byte's address's LSB), the first three bit4<2:0>; the emulator (`exec-bit.js`) and the assembler (`asm.js`) took
  the last `b` as bit4<0>, so XC16's `btst.b IFS0, #3` tested bit 6 and a drawing's program never saw Timer1's tick.
  The assembler's tests and the uart-fpga-pic24 example's `.hex` follow; a test runs XC16 2.10's own words.
- **xc16-as's syntax and XC16's linker's places (#5931):** the directives `.include "p24FJ1024GB610.inc"`, `.text`,
  `.section`, `.bss` with `.space` / `.skip` (data labels from 0x0800), `.global`, `.equ` / `.set`, `.word` (16 bits:
  a wider value refused) and `.pword` (24), `.align`, `.end`, and `config __FWDT, FWDTEN_OFF` (the settings ANDed, a word
  set twice warned); expressions with C's operators and xc16-as's `tblpage()`, `tbloffset()`, `handle()` (`asm-expr.js`);
  the PIC24FJ1024GB610's registers, bits, vectors and configuration words by name (`gb610-names.js`: Silinx's own, from
  the emulator's register map; checked against XC16's by #5937). `assembleProgram(source, { file })`: a source with a
  `.global __reset` is linked as XC16's linker links it, its code from 0x200, the reset vector a GOTO __reset, each vector its
  `.global` handler's or `__DefaultInterrupt`'s (a RESET after the program when the source has none), its configuration
  words; a handler not `.global` warned (XC16 would leave its vector to the default); an older source as it is, from 0.
  `.word` in the emulator's tests' programs that held whole program words is `.pword`.
- **The assembler is the package's (#5930):** the emulator's tests' PIC24F assembler (the instruction set's every form,
  its encodings checked against DS70000157) moved into `src/asm.js` as it was, and exported: `pic24Assemble` (its first
  error thrown, `line N: …`) and `assemble`, which reports every line's error as `{ file, line, message }` (written
  `file:line: message` by `asmMessage`) and assembles the lines after one that failed. A label defined twice is now
  an error naming both lines (it used to keep its last place silently, so a `bra` could jump into another routine:
  #5893). Tests: pic24-asm (the package's export, a label defined twice, the errors by line, a branch out of reach,
  no warnings).

## 0.3.2

In detail:

- **The release waits for the package's own tests (#5595):** `silinx-pic24-release.yml` runs the emulator's tests
  (`test/pic24-*.test.js`, `test/silinx-pic24-package.test.js`, which import the package alone) and publishes when they
  pass, where it waited for Silinx's whole CI on the tag. A break of the IDE outside the package held 0.2.0, 0.3.0 and
  0.3.1. CI still runs on the package's tags.

## 0.3.1

In detail:

- **The release of 0.3.0's code (#5575):** 0.3.1 is 0.3.0's package, unchanged. 0.3.0's tag was never published on
  npm: its CI run failed on a test outside the package (the Explorer 16/32 drawing's hex colours in Silinx's
  `web/js/emulator-explorer.js`, fixed by #5575), and a tag's CI runs on its own commit. 0.2.0's tag was not
  published either, for the same kind of reason (#5564, #5569).

## 0.3.0

In short:

- The input capture and output compare modules IC1-6 and OC1-6: compare, PWM on the pins and capture.
- The MCCP and SCCP modules: timers, output compare, PWM on the pins and input capture.

In detail:

- **IC1-6 and OC1-6 (#5529):** icoc.js, the input capture and output compare modules with dedicated timers, each a
  16-bit time base (timebase.js) on the system clock or Timer1-5's prescaled clock while that timer runs; SYNCSEL its
  period: its own (an OC's OCxRS + 1), Timer1-3's match, another OC's or a CCP module's period, else free-running. OC:
  single shot high and low, a toggle at each match, a pulse once and every period, edge-aligned PWM (high for OCxR
  counts from the period's start, OCxR and OCxRS latched at each period), OCxIF, OCINV, OCTRIS; OC1-3 through PPS,
  OC4-6 on RD6, RD7, RF0. IC: every edge, falling, rising, every 4th and 16th rising, the FIFO of four, ICBNE, ICOV,
  ICxIF every ICI + 1 captures, ICM 111 an interrupt while the device sleeps; IC1-3 through PPS, IC4-6 on RE5-RE7.
  timers.js: clock(name), a timer's prescaled clock, and onChange; Timer1-3's matches the IC / OC sync as well as the
  A/D's triggers. Not modelled, said when used: the cascaded 32-bit modes, Trigger mode (taken as Sync), center-aligned
  PWM, the other sync sources; not modelled: the Faults, DCB. Tests: pic24-icoc (the registers, PWM on its own period
  and on Timer2's, the duty latched, the compare modes, OCINV and OCTRIS, the captures on the system clock and on
  Timer3's, ICM 111 asleep, the warnings; a program measuring OC1's PWM with IC1 on the same pin).
- **MCCP1-3 and SCCP4-7 (part 1 of #5529):** ccp.js, each module's time base (timebase.js: counted lazily, its
  periods' starts clock events) on the system clock, the SOSC or twice the peripheral clock, through TMRPS (1, 4, 16,
  64); the timer modes (two 16-bit timers, CCTxIF and CCPxIF, a period register 0 holding its timer; one 32-bit
  timer); single edge compare (high, low, toggle one clock after CCPxRA's match, SCEVT, CCPxIF); dual edge compare and
  the buffered PWM (high one clock after CCPxRA's match, low after CCPxRB's, CCPxIF at the fall, the buffered values at
  the next period), steered to the OCMxA-F enabled in CCPxCON2H with POLACE / POLBDF's polarity; OPS's postscale; a
  module synchronised to another's period (SYNC 00010-01000); input capture (the free-running timer's value at the
  ICMx pin's edges: every edge, rising, falling, both, every 4th and 16th rising; the FIFO of four, two in 32 bits;
  ICBNE, ICOV; CCPxIF every OPS + 1 captures); Sleep (CCPSLP on the SOSC) and Idle (CCPSIDL). MCCP1-3's outputs and
  every module's ICMx input on their fixed pins (MCCP3's OCM3D on RA0, the Explorer's LED D3), SCCP4-7's outputs
  through PPS (OCM4-7). Not modelled, and said when used: center-aligned PWM, variable frequency, the external input
  mode, the output modes but the steerable single output, the clocks and sync sources other than those above; not
  modelled: dead time, auto-shutdown, triggered operation, gating, the special event trigger. Tests: pic24-ccp (the
  registers, the timers, the compare modes' edges at their times, PWM's period and duty on RA0 and through PPS, the
  sync, the captures' timestamps, the FIFO and ICOV, Sleep, the warnings; LED D3 dimmed by PWM on the Explorer 16/32,
  an input's period measured by a program).

## 0.2.0

The first version on npm: 0.1.0, the core below, was tagged but not published (its release did not find its tag's CI
run, #5514). 0.2.0 adds the PIC24FJ1024GB610's peripherals and the Explorer 16/32 board (#5481).

In short:

- **The PIC24 emulator's Explorer 16/32 board:** its LEDs and buttons, its potentiometer and temperature sensor, its
  USB-UART, and its character LCD, driven by a program as on the board.

In detail:

- **The A/D converter, the potentiometer and the temperature sensor (#5481):** adc.js, ADC1 with 10 or 12 bits
  (MODE12) on AN0–AN23 against AVDD (3.3 V) or VREF+; FORM's four formats; the sampling by the program (SAMP), the
  auto-convert (SSRC 0111, SAMC), Timer3's and Timer1's triggers, ASAM; CSCNA's scan of AD1CSSH:L, ALTS's MUX B,
  BUFREGEN, BUFM, SMPI's interrupt (ADC1, IRQ 13); the conversion's 12 or 14 TADs (TAD = TCY · (ADCS + 1)). An
  input's voltage is set from outside (`setAnalog`), else its pin's digital level. The Explorer 16/32's R6
  (`setPotentiometer`, AN5) and TC1047A (`setTemperature`, AN4: 500 mV + 10 mV/°C). Not modelled: the
  sample-and-hold's charging, the threshold detect and its compares, DMA, the band gap's and the CTMU's channels,
  noise; the internal RC's TAD is taken as 250 ns. Tests: pic24-adc (the codes in 10 and 12 bits and their times,
  the formats, the auto-convert with the scan and SMPI, Timer3's trigger, a program showing the potentiometer on
  the LEDs).
- **The device, its oscillator and its watchdog (#5481):** `Pic24Mcu` (mcu.js), the core with its peripherals' SFRs
  (their reset values, their writable bits, their hooks), its time in ps as its clock changes, RCON's reset flags
  (POR, BOR, SWR, WDTO, IOPUWR, SLEEP, IDLE, kept through the resets but a power-on's); `createGb610` (gb610.js), the
  PIC24FJ1024GB610 assembled; `Pic24Node` on it. The oscillator (osc.js): the FRC, the primary oscillator (the
  Explorer 16/32's 8 MHz crystal, FOSC's POSCMD), the SOSC, the LPRC, the DCO (DCOCON), the 96 MHz USB PLL's 32 MHz
  branch through CLKDIV's CPDIV and the 4x / 6x / 8x PLL, the divided FRC (OSCDIV), DOZE, OSCCON's unlock sequences
  (NOSC, OSWEN, IOLOCK with FOSC's IOL1WAY, CLKLOCK), the clock switch as FOSC's FCKSM allows it. The watchdog (wdt.js):
  FWDTEN (always, software by RCON's SWDTEN, active only), its period from the 31 kHz LPRC (FWPSA, WDTPS), CLRWDT, its
  window (WINDIS, WDTWIN), its time-out's reset or its wake-up from Sleep and Idle. Not modelled: the oscillators'
  start-up and the PLL's lock times, OSCTUN and the FRC's self-tune, the Fail-Safe Clock Monitor, REFO, two-speed
  start-up, the watchdog's clock sources other than the LPRC. readConfig no longer says the watchdog is not
  emulated. Tests: pic24-osc (the clock at reset, CPDIV, OSCDIV, DOZE, the switch and its refusals, IOLOCK, the time
  across a change of clock, the watchdog's period, reset, CLRWDT, software enable, window, wake-up, RCON's flags).
- **The EPMP and the Explorer 16/32's character LCD (#5481):** pmp.js, the EPMP's master mode: the CPU's accesses of
  the EDS above the RAM become bus cycles on its chip selects' regions (PMCS1BS, PMCS2BS, RADDR), a byte a cycle (a
  word two), the PMP interrupt (IRQ 45) with IRQM 01; a device on the bus answers its cycles. lcd.js, an
  HD44780-compatible 16x2 LCD of the package's own: its instructions, the DDRAM's two lines and the display's shift,
  the CGRAM, the busy flag and the instructions' times (37 µs, 1.52 ms), a write while busy ignored and said, the
  4-bit mode. The board's LCD on the PMP (RS on PMA0, no chip select). Not modelled: the strobes' waveforms on the
  pins, the wait states' timing, PMACK, the 4- and 16-bit ports, the multiplexed addresses, the slave modes; the LCD's
  power-on delay and its ROM's codes above 0x7F. Tests: pic24-lcd (the LCD's instructions, busy flag, 4-bit mode and
  CGRAM; the EPMP off, its word cycles and interrupt; a program printing two lines polling the busy flag).
- **The I/O ports and the Explorer 16/32's LEDs and buttons (#5481):** gpio.js, PORTA to PORTG of the 100-pin
  device (its 84 port pins): TRIS, PORT (its reads the pins' levels, its writes the latch's), LAT, ODC (an open drain),
  ANS (an analog pin reads 0: RD6 and RD7, S3's and S6's, and RA6 and RA7 are analog at reset), the weak pull-ups and
  pull-downs (IOCPU, IOCPD), the interrupt-on-change (IOCP, IOCN, IOCF, IOCSTAT, PADCON's IOCON, IRQ 19); a pin's level
  from a peripheral's output, its latch, outside, its pull-up, or floating; the outputs' changes are `Pic24Node`'s
  outputs, an input event a pin's level. explorer1632.js, the board with the PIC24FJ1024GB610 PIM (from its schematic
  and the PIM's information sheet): the LEDs D3–D10 on RA0–RA7, the buttons S3 (RD6), S4 (RD13), S5 (RA7, with D10)
  and S6 (RD7) with their pull-ups, and the pins of the potentiometer, the TC1047A, the USB-UART, the LCD and the
  EEPROM for the next peripherals. Not modelled: the pins' electrical levels, the input synchronisation's delay, the
  PMP's TTL buffers. Tests: pic24-gpio (the reset values, outputs and inputs, ODC, ANS, the pull-ups, the IOC, the
  board, a program lighting D3 while S3 is held through a `Pic24Node`).
- **The peripheral pin select, the UARTs on their pins, the USB-UART (#5481):** pps.js, RPINRx (the input functions
  INT1–4, the timers' clocks, IC, OCFA/B, U1–4RX and CTS, SDI, SCK and SS of SPI1–3, CLC… on RP0–RP31 and RPI32–RPI43,
  63 none) and RPORx (the output functions' numbers on RP0–RP31), locked by OSCCON's IOLOCK (a write unchanged, said);
  a mapped output overrides its pin's latch while its peripheral drives it, an input function hears its pin's changes.
  UART1–4's TX bits on their pins through it, their RX pins sampled at each bit's middle (FERR, PERR); UART5 and 6 on
  their fixed pins (RD1 / RD6, RB7 / RB12). serial.js, a terminal on two pins (8N1), the Explorer 16/32's USB-UART
  (`board.usbUart(baud)`: the device's TX on RF5, its RX on RF4). extint.js, the external interrupts INT0 (RD0) and
  INT1–4 (through PPS) on the edge INTCON2's INTxEP selects. Not modelled: the registers' Configuration Mismatch
  Reset. Tests: pic24-pps (the reset values, an input and an output mapped, IOLOCK, UART2's frames decoded by the
  terminal, a program echoing what the terminal types, UART5's fixed pin, INT0 and INT1's edges).
- **SPI, I²C and the Explorer 16/32's EEPROM (#5481):** spi.js, SPI1–3 in master mode: 8, 16 or 32 bits, Fsck =
  Fpb / (2 · (BRG + 1)), a word's time, SPIRBF, SPITBF, SPIBUSY, SPIROV, the receive, transmit and general
  interrupts; a device answers each word (`onTransfer`). eeprom25lc.js, the board's 25LC256: READ, WRITE (a 64-byte
  page, wrapping), WREN, WRDI, RDSR, WRSR, the 5 ms write cycle begun at CS's rise; on the board it hears an SPI
  module the program maps by PPS to its pins (SCK RG6, SDO RG8, SDI RG7) while CS (RD12) is low. i2c.js, I2C1–3 in
  master mode: the start, repeated start, stop, receive and acknowledge events with their times (Fscl = Fcy /
  (BRG + 2)), the address and data bytes acknowledged or not (ACKSTAT), RBF, TBF, TRSTAT, R_W, S, P, the master
  interrupts; devices answer at their addresses (`attach`). Not modelled: the slave modes, the framed and audio
  modes, the enhanced buffers beyond a word, the pins' waveforms (a word, an event, one transaction), 10-bit
  addresses, bus collisions, clock stretching; the EEPROM's block protection. Tests: pic24-spi-i2c (SPI's timing,
  reply, overflow and 16 bits; the EEPROM's instructions; a program writing and reading it through SPI2 and PPS; I²C's
  writes with their times and acknowledges, an unanswered address, a read with its NACK).
- **Timer1 to Timer5 (#5481):** timers.js, TMRx counting the peripheral clock (Fosc / 2), or Timer1 and the others
  with TCS the SOSC's 32.768 kHz or the LPRC's 31 kHz, through the prescalers (1, 8, 64, 256); at TMRx = PRx the next
  count resets it and sets its flag (T1 IRQ 3, T2 7, T3 8, T4 27, T5 28); a value past PRx runs to the end and wraps;
  Timer2 / 3 and Timer4 / 5 as 32-bit timers with T32 (TMR3:TMR2 against PR3:PR2, Timer3's interrupt, TMR3HLD
  latched by a read of TMR2 and taken by its write); asleep only Timer1 on the SOSC unsynchronised counts (and its
  interrupt wakes the device), in Idle TSIDL stops a timer. A timer counts lazily, its period's end a clock event.
  An interrupt below or at the IPL (or with GIE clear) now wakes the device from Sleep too, as the data sheet says.
  Not modelled: the external clock inputs (T1CK, TxCK), TGATE, TSYNC's delay. Tests: pic24-timers (the periods and
  prescalers, the SOSC and LPRC clocks, the wrap past PR, the 32-bit pair and TMR3HLD, Timer4 and 5 apart, Sleep,
  an interrupt-driven program counting Timer1's periods).
- **The UARTs (#5481):** uart.js, UART1 to UART6: UxMODE (UARTEN, LPBACK, BRGH, PDSEL, STSEL), UxSTA (UTXISEL, URXEN,
  UTXEN, UTXBF, TRMT, URXISEL, FERR, OERR, URXDA), the 4-deep transmit and receive buffers, the baud from UxBRG
  (Fcy / 16 or / 4 · (UxBRG + 1)), each frame's time (8N1, 8E1, 8O1, 9N1, two stops), the receive, transmit and error
  interrupts (U1 IRQ 11, 12, 65; U2 30, 31, 66; …); a character sent leaves by `onTransmit(byte, t)` at its frame's
  end and its bits by `onTxBits`, one received arrives by `receive(byte)`; a character written with the buffer full
  is lost, said. Not modelled: IrDA, the flow control pins, auto-baud, the break, the address detect, the pins'
  polarity inversions. Tests: pic24-uart (the baud and the frames, a program sending a line, the buffers and
  their limits, OERR and its interrupt, UTXISEL and URXISEL, the loopback, a program echoing a terminal's
  characters).

## 0.1.0

In short:

- **A PIC24F core emulator:** silinx-pic24, the PIC24FJ1024GB610's core in JavaScript, with no dependency: its
  arithmetic, logic and data movement instructions, its addressing modes, its data bus with the SFRs' hooks.
- **The PIC24 emulator loads XC16's .hex and runs as a System's node:** its interrupts and traps, its configuration
  words (the oscillator and so its instruction clock), its time in ps, `run(t1, inputEvents)`.
- **On npm:** silinx-pic24 is published on npm (`npm install silinx-pic24`), with npm's provenance.

In detail:

- **Published on npm (#5509):** from the package's own tag, `silinx-pic24-vX`, once Silinx's CI has passed on the
  tagged commit (`.github/workflows/silinx-pic24-release.yml`), with npm's provenance; the package holds `src/`,
  `LICENSE` and `README.md`.
- **The bit, shift, multiply, divide and program flow instructions (#5480):** BSET, BCLR, BTG, BTST, BTSTS, BSW, BTSC,
  BTSS on Ws and on f; FBCL, FF1L, FF1R; SL, LSR, ASR, RLC, RLNC, RRC, RRNC on Ws and on f, and SL, LSR, ASR by Wns or
  #lit4; MUL.UU, MUL.US, MUL.SU, MUL.SS and MUL f; the iterative DIV.S, DIV.U, DIV.SD, DIV.UD (REPEAT #17's target: the
  dividend copied at the first iteration, the quotient and remainder at the last; a divide by zero the math error trap;
  other than 18 executions said); BRA on its 15 conditions and by Wn, CALL, RCALL, GOTO by address and by Wn, RETURN,
  RETLW, RETFIE; CPSEQ, CPSNE, CPSGT, CPSLT; REPEAT #lit14 and Wn; DISI; PWRSAV (sleep and idle until an interrupt);
  RESET, CLRWDT, BOOTSWP (not emulated: said), PUSH.S and POP.S, NOPR. Their cycles: 2 for a change of the PC, 3 for
  a return (2 with an exception pending), a skip's 2 or 3. Tests: every condition of BRA against its definition over
  N, OV, Z, C; the products and quotients against the integers'; the manual's worked examples, all 228 run; a loop's
  cycles by hand.
- **The package and its core (#5480):** `packages/silinx-pic24`, MIT, a workspace of its own (its changelog, its
  versions), importing nothing of Silinx. The CPU (`cpu.js`, avr8js's shape: `new CPU(program)`, `step()`, `run(cycles)`,
  `cycles`, `readHooks` / `writeHooks`, `addClockEvent`, `save()` / `restore()`): W0–W15, SR and CORCON with their
  read-only bits, SPLIM, the data memory (the SFRs, 32 KB of RAM, the EDS window: page 1 the RAM above 0x7FFF, 0x200–0x3FF
  the program memory's words read through PSV, an external memory's hooks), the RAW stalls (DS70000157 table 4-6), the
  address and stack error traps and their entry (the vector, the stack frame, the IPL, INTTREG), the resets of an
  illegal instruction and of an uninitialized W register as a pointer. The instructions: ADD, ADDC, SUB, SUBB, SUBR,
  SUBBR, AND, IOR, XOR, INC, INC2, DEC, DEC2, NEG, COM, CLR, SETM, CP, CPB, CP0 in their forms, MOV in its forms, MOV.D,
  PUSH and POP, LNK, ULNK, SE, ZE, SWAP, EXCH, DAW.B, the table reads and writes (to the write latches).
- **Its tests (#5480):** a test-side PIC24 assembler (`test/pic24-asm.mjs`), each instruction form's encoding checked
  against DS70000157's; the manual's worked examples (`test/fixtures/pic24-manual-examples.json`), the ones its
  instructions cover run and compared (its errata, each checked by hand, with their reasons); the flags against an
  independent reference in both modes; the addressing modes, the cycles, PSV and EDS, the traps and the resets.
- **The interrupt controller, the HEX, the node (#5480):** the interrupts tested (their priorities against the IPL,
  the natural order, nesting and NSTDIS, DISI, the traps above them and in their order, the stack frame and RETFIE, a
  REPEAT interrupted and resumed, a sleep woken); XC16's Intel HEX read and written (`parseHex`, `writeHex`: four
  bytes a program word, its phantom byte, the extended linear addresses, the configuration space, the checksums);
  the configuration words read (`readConfig`: FNOSC and PLLMODE, Fcy = Fosc / 2, the Explorer 16/32's 8 MHz crystal as
  the primary oscillator, FWDTEN's watchdog said); `Pic24Node`, the scheduler's `run(t1, inputEvents)` with its time in
  ps, its pins' hooks for the peripherals (#5481: `onInput`, `drive`), its log, its state saved and restored. Tests:
  HEX records by hand, its errors, the configurations, the node's times; small programs from reset (a multiply and
  divide routine with its cycles counted by hand, an interrupt-driven counter, a PSV and TBLRDL table sum).
