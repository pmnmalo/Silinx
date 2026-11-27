In short:

- The first version: an Arduino Uno's or Nano's sketch built to its `.hex` in the browser or in Node.

In detail:

- **Arduino's AVR toolchain in WebAssembly (#5934):** avr-gcc 7.3.0 with Atmel's patches and binutils 2.26 (Arduino's
  `7.3.0-atmel3.6.1-arduino7`) built with Emscripten 7.0.1 from pinned sources (`build/build.sh`: cc1, cc1plus, as, ld,
  ar, objcopy as classic modules, their function-pointer casts emulated); Arduino's Linux sysroot for the ATmega328P; the
  Arduino AVR core 1.8.8, Wire and SPI precompiled by these tools (`build/precompile.mjs`). The driver (`src/`): the
  commands `avr-gcc -###` gives for the core's recipes, LTO left out (`src/flags.js`); a sketch's .ino files made one C++
  file with `#include <Arduino.h>`, the prototypes of the functions it defines and `#line` lines (`src/sketch.js`);
  `createAvrGcc({ read })` and `buildSketch({ files, main, board })`, each tool in a WebAssembly instance of its own on a
  file system in memory. The release checks every sketch of `build/oracle/` against Arduino's native toolchain with the same
  flags: the same `.hex`, byte for byte.
