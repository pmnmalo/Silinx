In short:

- An Arduino node's assembly program (its `.asm`) is built by Compile Firmware with Silinx's own AVR assembler: no
  arduino-cli, and in the browser edition too.

In detail:

- **An AVR assembler in Silinx (#5933, part of #5892):** `core/avr-asm.js` assembles avrasm2's (avra's) syntax for the
  ATmega328P: every instruction it has and their aliases, `.include "m328Pdef.inc"` / `.device` / `.equ` / `.set` /
  `.def` / `.undef` / `.org` / `.cseg` / `.dseg` / `.eseg` / `.db` / `.dw` / `.byte` / `.exit`, expressions with C's
  operators and `low()`, `high()`, `byte2()`, `lo8()`…, the ATmega328P's names (`core/avr-m328p.js`, made by
  `scripts/avr-symbols.mjs` from avr-libc's `iom328p.h`, BSD-3-Clause: NOTICE and THIRD-PARTY-NOTICES updated). Its
  errors and warnings are by file and line, every line assembled though an earlier one failed: a label defined twice
  refused naming both lines (`PC` refused as a label), a word written twice, a value out of range, a relative jump out of
  reach; the instruction set manual's undefined combinations (`ld r26, X+`) and an odd `.db` warnings. Its Intel HEX is
  avr-objcopy's layout. Compile Firmware uses it for an Arduino node whose folder has an `.asm` and no `.ino`: on the
  local server with no arduino-cli (the System's build plan says `assembled by Silinx's AVR assembler`, Build All builds
  it), and in the browser edition in the page; the MCP's `run_process firmware` the same (its toolchain `avr-asm`), and
  `toolchain_info` says it is built in. The console's Errors and Warnings rows, and `run_process`'s locations, take an
  assembly file's lines (`.asm`, `.s`, `.S`). The tests' assembler (`test/avr-asm.mjs`) is now it. Tests: avr-assembler
  (every instruction form against GNU avr-as 2.26's words, the Arduino examples' programs to their shipped `.hex` byte
  for byte with no warning, the directives, names and expressions, the errors and warnings, the names against avr-libc's
  header), avr-compile-server (no arduino-cli, its lines, MCP), system-plan, system-build-all, message-location; the UI
  test system-firmware-asm (both interfaces, the browser edition, Portuguese).
