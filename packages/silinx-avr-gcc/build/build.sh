#!/usr/bin/env bash
# @silinx/avr-gcc (#5934, part of #5892): Arduino's AVR toolchain for an Arduino Uno's or Nano's sketch, built inside
# Silinx in the browser and on the local server. The compiler and the binutils are Arduino's own (arduino/toolchain-avr
# 7.3.0-atmel3.6.1-arduino7: GCC 7.3.0 with Atmel's patches, avr-binutils 2.26), compiled here to WebAssembly with a pinned
# Emscripten: cc1, cc1plus, as, ld, ar, objcopy (the gcc driver is the package's JavaScript, src/, since gcc's uses vfork).
# Its sysroot (avr-libc, libgcc, the ATmega328P's startup and linker script) is Arduino's Linux toolchain's, the one
# arduino-cli installs, so that a sketch built here is the .hex arduino-cli builds with the same flags (no LTO: WebAssembly
# has no linker plugin); the Arduino AVR core (and its Wire and SPI libraries) is Arduino's, precompiled by these tools
# (build/precompile.mjs). Run by .github/workflows/silinx-avr-gcc.yml (it installs emsdk: not on a developer's machine,
# unless EMSDK points at an emsdk already activated).
#
#   packages/silinx-avr-gcc/build/build.sh <work folder> <output folder>
#
# The output (the package's dist/): tools/<tool>.js and .wasm, sysroot/, arduino/, LICENSES/, manifest.json, SHA256SUMS.
set -euo pipefail
# pinned: {"kind": "tag", "name": "emsdk (@silinx/avr-gcc)", "repo": "emscripten-core/emsdk", "match": "^EMSDK_TAG=\"(?<tag>[0-9.]+)\" +EMSDK_COMMIT=\"(?<commit>[0-9a-f]{40})\"", "update": "the tag and its commit here, the workflow silinx-avr-gcc run on the pull request (its oracle), then a release of the package"}
EMSDK_TAG="7.0.1" EMSDK_COMMIT="a7c808831a666cc903fedb906c171a718cd97341"
# (its commit's tarball, pinned by its SHA-256 too: no git clone, which a runner could not always reach)
EMSDK_SHA256="5c3ac494d7917be781f29b8f75f27bd725dc268a96df2654442511d9570fadc2"
# pinned: {"kind": "sha256", "name": "GCC 7.3.0 (@silinx/avr-gcc, Arduino's)", "match": "^GCC_URL=\"(?<url>[^\"]+)\" +GCC_SHA256=\"(?<sha256>[0-9a-f]{64})\"", "update": "Arduino's toolchain moves with arduino/toolchain-avr: its GCC, its patches and its Linux toolchain together"}
GCC_URL="https://ftp.gnu.org/gnu/gcc/gcc-7.3.0/gcc-7.3.0.tar.xz" GCC_SHA256="832ca6ae04636adbb430e865a1451adf6979ab44ca1c8374f61fba65645ce15c"
# pinned: {"kind": "sha256", "name": "Atmel's GCC patches (@silinx/avr-gcc, arduino/toolchain-avr)", "match": "^GCC_PATCH_URL=\"(?<url>[^\"]+)\" +GCC_PATCH_SHA256=\"(?<sha256>[0-9a-f]{64})\""}
GCC_PATCH_URL="https://raw-githubusercontent-com.072103.xyz/arduino/toolchain-avr/7.3.0-atmel3.6.1-arduino7/avr-gcc-patches/atmel-patches-gcc.7.3.0-arduino2.patch" GCC_PATCH_SHA256="96782c75dd11e994e1ab9250c41fc5cd81ba65bbcf44383cd9d660d01cc85f97"
# pinned: {"kind": "sha256", "name": "avr-binutils 2.26 (@silinx/avr-gcc, Arduino's)", "match": "^BINUTILS_URL=\"(?<url>[^\"]+)\" +BINUTILS_SHA256=\"(?<sha256>[0-9a-f]{64})\""}
BINUTILS_URL="https://downloads.arduino.cc/tools/opensource/Atmel-AVR-GNU-Toolchain/3.6.1/avr-binutils.tar.bz2" BINUTILS_SHA256="7f2ee50c3867ca13be47aee7925c4c9182b15cb5fe6ace23849ee9005081a340"
# pinned: {"kind": "sha256", "name": "binutils' patch (@silinx/avr-gcc, arduino/toolchain-avr)", "match": "^BINUTILS_PATCH_URL=\"(?<url>[^\"]+)\" +BINUTILS_PATCH_SHA256=\"(?<sha256>[0-9a-f]{64})\""}
BINUTILS_PATCH_URL="https://raw-githubusercontent-com.072103.xyz/arduino/toolchain-avr/7.3.0-atmel3.6.1-arduino7/binutils-patches/00-binutils-data_region_length.patch" BINUTILS_PATCH_SHA256="d9e9f183bad9e1cfe27f3569163ccd3c39b1784b12978b47a2206eb31e2547e8"
# pinned: {"kind": "sha256", "name": "Arduino's AVR toolchain for Linux (@silinx/avr-gcc's sysroot, the oracle's compiler)", "match": "^TOOLCHAIN_URL=\"(?<url>[^\"]+)\" +TOOLCHAIN_SHA256=\"(?<sha256>[0-9a-f]{64})\""}
TOOLCHAIN_URL="https://downloads.arduino.cc/tools/avr-gcc-7.3.0-atmel3.6.1-arduino7-x86_64-pc-linux-gnu.tar.bz2" TOOLCHAIN_SHA256="bd8c37f6952a2130ac9ee32c53f6a660feb79bee8353c8e289eb60fdcefed91e"
# pinned: {"kind": "sha256", "name": "the Arduino AVR core (@silinx/avr-gcc)", "match": "^CORE_URL=\"(?<url>[^\"]+)\" +CORE_SHA256=\"(?<sha256>[0-9a-f]{64})\"", "update": "the core's version here and in src/flags.js (ARDUINO_CORE), then the package released"}
CORE_URL="https://downloads.arduino.cc/cores/staging/avr-1.8.8.tar.bz2" CORE_SHA256="a234c2a43dcd01ce54be665806f183b8e6ec4e966d2e3e0c3358b63023d6390c"
# (the host's libraries GCC needs, compiled to WebAssembly with it: the versions Arduino's build uses, mpc 1.0.3 for 0.9,
# which GNU no longer serves; they are the compiler's arithmetic, not its output)
GMP_URL="https://ftp.gnu.org/gnu/gmp/gmp-5.0.2.tar.bz2" GMP_SHA256="dbc2db76fdd4e99f85d5e35aa378ed62c283e0d586b91bd8703aff75a7804c28"
MPFR_URL="https://ftp.gnu.org/gnu/mpfr/mpfr-3.1.0.tar.bz2" MPFR_SHA256="74a7bbbad168dd1cc414f1c9210b8fc16ccfc8e422d34b3371a8978e31eab680"
MPC_URL="https://ftp.gnu.org/gnu/mpc/mpc-1.0.3.tar.gz" MPC_SHA256="617decc6ea09889fb08ede330917a00b16809b8db88c29c31bfbb49cbf88ecc3"

[ $# -eq 2 ] || { echo "usage: $0 <work folder> <output folder>"; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$1" "$2"
WORK="$(cd "$1" && pwd)" OUT="$(cd "$2" && pwd)"
export SOURCE_DATE_EPOCH=0 LC_ALL=C TZ=UTC
JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
fetch() {   # fetch <url> <sha256>: the file in $WORK/src, checked
  local f="$WORK/src/$(basename "$1")"
  mkdir -p "$WORK/src"
  [ -f "$f" ] || curl -fsSL --retry 5 --retry-all-errors --retry-delay 10 -o "$f" "$1"
  [ "$(sha "$f" | cut -d' ' -f1)" = "$2" ] || { echo "$1: not its SHA-256 $2"; exit 1; }
  echo "$f"
}

# ---- Emscripten
if [ -z "${EMSDK:-}" ]; then
  if [ ! -d "$WORK/emsdk" ]; then
    T="$(fetch "https://codeload.github.com/emscripten-core/emsdk/tar.gz/$EMSDK_COMMIT" "$EMSDK_SHA256")"
    tar -xzf "$T" -C "$WORK" && mv "$WORK/emsdk-$EMSDK_COMMIT" "$WORK/emsdk"
  fi
  (cd "$WORK/emsdk" && ./emsdk install "$EMSDK_TAG" >/dev/null && ./emsdk activate "$EMSDK_TAG" >/dev/null)
  EMSDK="$WORK/emsdk"
fi
# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1

# the host's C, for clang 21 and these old sources; libiberty's psignal is Emscripten's own
W="-w -Wno-error=implicit-function-declaration -Wno-error=implicit-int -Wno-error=int-conversion -Wno-error=incompatible-function-pointer-types"
export CFLAGS="-O2 -g0 $W" CXXFLAGS="-O2 -g0 -std=gnu++98 $W" ac_cv_func_psignal=yes ac_cv_func_strsignal=yes
BUILD_CC="cc -w -Wno-error=implicit-function-declaration -Wno-error=implicit-int"
# a tool: a classic module (createTool(options), no ES module, so that a page loads it from its text under Silinx's CSP),
# its old function-pointer casts emulated (binutils' bfd_true), its memory grown as it needs
LINK="-sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=createTool -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1 -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sENVIRONMENT=web,worker,node -sINITIAL_MEMORY=32MB -sSTACK_SIZE=8MB -sEMULATE_FUNCTION_POINTER_CASTS=1"
log() { echo "== $*"; }
quiet() { local name="$1"; shift; "$@" > "$WORK/$name.log" 2>&1 || { tail -40 "$WORK/$name.log"; exit 1; }; }

# ---- binutils: as, ld, ar, objcopy
log binutils
rm -rf "$WORK/binutils" "$WORK/binutils-build"
tar -xjf "$(fetch "$BINUTILS_URL" "$BINUTILS_SHA256")" -C "$WORK"
patch -s -d "$WORK/binutils" -p1 < "$(fetch "$BINUTILS_PATCH_URL" "$BINUTILS_PATCH_SHA256")"
mkdir "$WORK/binutils-build"
(cd "$WORK/binutils-build" && CC_FOR_BUILD="$BUILD_CC" quiet binutils-configure emconfigure ../binutils/configure --build="$(../binutils/config.guess)" --host=i686-pc-linux-gnu --target=avr \
  --disable-nls --disable-doc --disable-werror --disable-gdb --disable-sim --disable-gprof --disable-libdecnumber --disable-readline --disable-plugins --disable-shared --enable-static)
(cd "$WORK/binutils-build" && quiet binutils-make emmake make -j"$JOBS" all-gas all-ld all-binutils LDFLAGS="$LINK")

# ---- GCC's host libraries, then cc1 and cc1plus
log gmp mpfr mpc
H="$WORK/hostlibs"
rm -rf "$H" "$WORK"/gmp-* "$WORK"/mpfr-* "$WORK"/mpc-*
tar -xjf "$(fetch "$GMP_URL" "$GMP_SHA256")" -C "$WORK"; tar -xjf "$(fetch "$MPFR_URL" "$MPFR_SHA256")" -C "$WORK"; tar -xzf "$(fetch "$MPC_URL" "$MPC_SHA256")" -C "$WORK"
(cd "$WORK/gmp-5.0.2" && quiet gmp emconfigure ./configure --host=none --build="$(./config.guess)" --prefix="$H" --disable-shared --enable-static CC=emcc CC_FOR_BUILD="$BUILD_CC" ABI=long && quiet gmp-make emmake make -j"$JOBS" && quiet gmp-install emmake make install)
(cd "$WORK/mpfr-3.1.0" && quiet mpfr emconfigure ./configure --host=i686-pc-linux-gnu --build="$(./config.guess)" --prefix="$H" --with-gmp="$H" --disable-shared --enable-static && quiet mpfr-make emmake make -j"$JOBS" && quiet mpfr-install emmake make install)
(cd "$WORK/mpc-1.0.3" && quiet mpc emconfigure ./configure --host=i686-pc-linux-gnu --build="$(./config.guess)" --prefix="$H" --with-gmp="$H" --with-mpfr="$H" --disable-shared --enable-static && quiet mpc-make emmake make -j"$JOBS" && quiet mpc-install emmake make install)
# Arduino's Linux toolchain (its sysroot below, the oracle's compiler): its avr-as and avr-ld are the ones GCC's configure
# tests the target's assembler with (SHF_MERGE's string sections, its other features: without them, cc1 writes its strings
# to .rodata, which the linker does not merge); AVR_BIN, another build of them (macOS's, on a developer's machine)
TC="$WORK/toolchain"
rm -rf "$TC" && mkdir -p "$TC" && tar -xjf "$(fetch "$TOOLCHAIN_URL" "$TOOLCHAIN_SHA256")" -C "$TC" --strip-components=1
AVR_BIN="${AVR_BIN:-$TC/bin}"
"$AVR_BIN/avr-as" --version > /dev/null || { echo "$AVR_BIN/avr-as does not run here: set AVR_BIN to a native build of Arduino's 7.3.0 toolchain"; exit 1; }
log gcc
rm -rf "$WORK/gcc" "$WORK/gcc-build"
tar -xJf "$(fetch "$GCC_URL" "$GCC_SHA256")" -C "$WORK" && mv "$WORK/gcc-7.3.0" "$WORK/gcc"
patch -s -d "$WORK/gcc" -p1 < "$(fetch "$GCC_PATCH_URL" "$GCC_PATCH_SHA256")"
mkdir "$WORK/gcc-build"
# (Arduino's configuration, but LTO and plugins: no linker plugin in WebAssembly)
(cd "$WORK/gcc-build" && CC_FOR_BUILD="$BUILD_CC" CXX_FOR_BUILD="c++ -w -std=gnu++98" quiet gcc-configure emconfigure ../gcc/configure --build="$(../gcc/config.guess)" --host=i686-pc-linux-gnu --target=avr \
  --with-gmp="$H" --with-mpfr="$H" --with-mpc="$H" --with-gnu-as --with-gnu-ld --with-as="$AVR_BIN/avr-as" --with-ld="$AVR_BIN/avr-ld" --enable-fixed-point --enable-languages=c,c++ --disable-nls --disable-libssp --disable-libada \
  --disable-shared --with-avrlibc=yes --with-dwarf2 --disable-doc --disable-lto --disable-plugin --without-isl --disable-bootstrap)
# (all-gcc as far as it goes: it stops at gcov-tool, which needs ftw and is not one of the package's; then the compilers)
(cd "$WORK/gcc-build" && { emmake make -k -j"$JOBS" all-gcc LDFLAGS="$LINK" > "$WORK/gcc-all.log" 2>&1 || true; })
(cd "$WORK/gcc-build/gcc" && quiet gcc-make emmake make -j"$JOBS" cc1 cc1plus LDFLAGS="$LINK")

# ---- the output
log output
rm -rf "$OUT"/*
mkdir -p "$OUT/tools" "$OUT/LICENSES"
for t in gas/as-new:as ld/ld-new:ld binutils/ar:ar binutils/objcopy:objcopy; do
  cp "$WORK/binutils-build/${t%%:*}" "$OUT/tools/${t##*:}.js"; cp "$WORK/binutils-build/${t%%:*}.wasm" "$OUT/tools/${t##*:}.wasm"
done
for t in cc1 cc1plus; do cp "$WORK/gcc-build/gcc/$t" "$OUT/tools/$t.js"; cp "$WORK/gcc-build/gcc/$t.wasm" "$OUT/tools/$t.wasm"; done
# (each tool's .js loads its .wasm by its own name: the package gives it the bytes, any name will do)
cp "$WORK/binutils-build/ld/ldscripts/avr5.x" "$WORK/avr5.x"

# the sysroot: Arduino's Linux toolchain's avr5 (the ATmega328P) parts (extracted above)
S="$OUT/sysroot"
mkdir -p "$S/gcc/lib" "$S/avr/lib" "$S/ldscripts"
cp -R "$TC/lib/gcc/avr/7.3.0/include" "$S/gcc/include"
cp -R "$TC/lib/gcc/avr/7.3.0/include-fixed" "$S/gcc/include-fixed"
cp "$TC/lib/gcc/avr/7.3.0/avr5/libgcc.a" "$S/gcc/lib/"
cp -R "$TC/avr/include" "$S/avr/include"
# (the other devices' I/O headers left out: avr/io.h includes the ATmega328P's only)
find "$S/avr/include/avr" -name 'io*.h' ! -name io.h ! -name iom328p.h ! -name 'iox*.h' -delete
find "$S/avr/include/avr" -name 'iox*.h' -delete
cp "$TC/avr/lib/avr5/crtatmega328p.o" "$TC/avr/lib/avr5/libc.a" "$TC/avr/lib/avr5/libm.a" "$TC/avr/lib/avr5/libatmega328p.a" "$S/avr/lib/"
cp "$WORK/avr5.x" "$S/ldscripts/avr5.x"

# the Arduino AVR core and its Wire and SPI libraries: their headers, and archives the tools make
rm -rf "$WORK/core" && mkdir "$WORK/core" && tar -xjf "$(fetch "$CORE_URL" "$CORE_SHA256")" -C "$WORK/core" --strip-components=1
A="$OUT/arduino"
mkdir -p "$A/core" "$A/variants" "$A/libraries"
cp -R "$WORK/core/cores/arduino/." "$A/core/"
cp -R "$WORK/core/variants/standard" "$WORK/core/variants/eightanaloginputs" "$A/variants/"
for l in Wire SPI; do mkdir -p "$A/libraries/$l"; cp -R "$WORK/core/libraries/$l/src" "$A/libraries/$l/src"; done
node "$HERE/precompile.mjs" "$OUT"

# the licences
cp "$WORK/gcc/COPYING3" "$OUT/LICENSES/GPL-3.0-gcc-binutils.txt"
cp "$WORK/gcc/COPYING.RUNTIME" "$OUT/LICENSES/GCC-runtime-library-exception.txt"
cp "$TC/avr/share/doc/avr-libc"*/LICENSE* "$OUT/LICENSES/avr-libc.txt" 2>/dev/null || sed -n '/Copyright/,/SUCH DAMAGE/p' "$S/avr/include/avr/io.h" > "$OUT/LICENSES/avr-libc.txt"
cp "$WORK/core/LICENSE.txt" "$OUT/LICENSES/LGPL-2.1-arduino-core.txt" 2>/dev/null || curl -fsSL -o "$OUT/LICENSES/LGPL-2.1-arduino-core.txt" https://www.gnu.org/licenses/old-licenses/lgpl-2.1.txt
cp "$HERE/SOURCES.md" "$OUT/LICENSES/SOURCES.md"

# its files' list and checksums (the package reads the manifest; the release checks the sums)
(cd "$OUT" && find . -type f ! -name manifest.json ! -name SHA256SUMS | sed 's|^\./||' | LC_ALL=C sort > "$WORK/files.txt")
node -e 'const fs=require("fs");const f=fs.readFileSync(process.argv[1],"utf8").trim().split("\n");fs.writeFileSync(process.argv[2],JSON.stringify({files:f},null,1)+"\n")' "$WORK/files.txt" "$OUT/manifest.json"
(cd "$OUT" && while IFS= read -r f; do sha "$f"; done < "$WORK/files.txt" > SHA256SUMS)
du -sh "$OUT"/* | sed "s|$OUT/||"
