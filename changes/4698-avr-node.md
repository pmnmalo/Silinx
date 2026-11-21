In detail:

- **Co-design's AVR node (#4698, roadmap #4695):** `core/system-sim-avr.js`, the co-simulation scheduler's adapter of
  an Arduino Uno or Nano's ATmega328P at 16 MHz run by avr8js (MIT, a new dependency: NOTICE and
  THIRD-PARTY-NOTICES), its firmware a given Intel `.hex` or `.elf` (`core/avr-firmware.js`, no compiler). Its pins are
  the board's (D0..D13, A0..A5), each an input and an output of the node; its timers run; its USART is pins: the bytes
  the program sends become D1's frames at its baud (from UBRR), and D0's frames are sampled at the USART's settings back
  into bytes (a wrong baud gives garbage, as on a real board). A firmware that is not a program, a broken record or a
  program too big for the flash stops the node with its error; a framing error and a byte not read are warnings. The
  browser's bundle of avr8js comes with the System's simulation view (#4701).
