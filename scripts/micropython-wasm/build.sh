#!/usr/bin/env bash
# Silinx's MicroPython for the ESP32 node's JSPI back end (#5658): MicroPython's webassembly port at a pinned tag, built
# with a pinned Emscripten (emsdk) as Silinx's variant (silinx/: the pyscript variant's configuration with sys.settrace,
# WebAssembly's exceptions, JSPI) with the module silinx_jspi (silinx_jspi/), and silinx-api.js appended to its
# micropython.mjs. Run by .github/workflows/micropython-wasm.yml (never on a developer's machine: it installs emsdk).
#
#   scripts/micropython-wasm/build.sh <work folder> <output folder>
#
# The output: micropython.mjs, micropython.wasm, MicroPython's LICENSE (MIT) as LICENSE-micropython, Silinx's
# LICENSE (AGPL-3.0-only: the module and silinx-api.js) and SHA256SUMS. Reproducible: the same pins give the same bytes
# (the workflow builds twice and compares).
set -euo pipefail
# pinned: {"kind": "tag", "name": "MicroPython (the ESP32 node's JSPI build)", "repo": "micropython/micropython", "match": "^MICROPYTHON_TAG=\"(?<tag>v[0-9.]+)\" +MICROPYTHON_COMMIT=\"(?<commit>[0-9a-f]{40})\"", "update": "the tag and its commit here, the workflow micropython-wasm run on the pull request (its smoke test), then a release and its SHA-256s where the build is downloaded"}
MICROPYTHON_TAG="v1.29.0" MICROPYTHON_COMMIT="0fd6c573ea815774668bbb16b8e197c8822368b2"
# pinned: {"kind": "tag", "name": "emsdk (the ESP32 node's MicroPython build)", "repo": "emscripten-core/emsdk", "match": "^EMSDK_TAG=\"(?<tag>[0-9.]+)\" +EMSDK_COMMIT=\"(?<commit>[0-9a-f]{40})\"", "update": "the tag and its commit here, the workflow micropython-wasm run on the pull request (its smoke test), then a release and its SHA-256s where the build is downloaded"}
EMSDK_TAG="6.0.13" EMSDK_COMMIT="35659964bc2762fffec0d257997fb61475f765b7"

[ $# -eq 2 ] || { echo "usage: $0 <work folder> <output folder>"; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$1" "$2"
WORK="$(cd "$1" && pwd)" OUT="$(cd "$2" && pwd)"
# (no time, path or locale of the machine in the build)
export SOURCE_DATE_EPOCH=0 LC_ALL=C TZ=UTC

clone() {   # clone <url> <tag> <commit> <folder>
  git clone --quiet --depth 1 --branch "$2" "$1" "$4"
  [ "$(git -C "$4" rev-parse HEAD)" = "$3" ] || { echo "$1: tag $2 is not commit $3"; exit 1; }
}
[ -d "$WORK/emsdk" ] || clone https://github.com/emscripten-core/emsdk.git "$EMSDK_TAG" "$EMSDK_COMMIT" "$WORK/emsdk"
(cd "$WORK/emsdk" && ./emsdk install "$EMSDK_TAG" >/dev/null && ./emsdk activate "$EMSDK_TAG" >/dev/null)
# shellcheck disable=SC1091
source "$WORK/emsdk/emsdk_env.sh" >/dev/null 2>&1
rm -rf "$WORK/micropython"
clone https://github.com/micropython/micropython.git "$MICROPYTHON_TAG" "$MICROPYTHON_COMMIT" "$WORK/micropython"
PORT="$WORK/micropython/ports/webassembly"
# (the variant and the module copied in, at the same paths on every machine)
cp -R "$HERE/silinx" "$PORT/variants/silinx"
mkdir "$WORK/micropython/usermods" && cp -R "$HERE/silinx_jspi" "$WORK/micropython/usermods/silinx_jspi"
# JSPI cannot suspend across Emscripten's setjmp trampolines (JavaScript): WebAssembly's own longjmp
sed -i.orig 's/SUPPORT_LONGJMP=emscripten/SUPPORT_LONGJMP=wasm/' "$PORT/Makefile"
grep -q 'SUPPORT_LONGJMP=wasm' "$PORT/Makefile" || { echo "the port's Makefile: no SUPPORT_LONGJMP=emscripten to replace"; exit 1; }
make -s -C "$PORT" VARIANT=silinx submodules >/dev/null
make -s -C "$WORK/micropython/mpy-cross" >/dev/null
make -s -C "$PORT" VARIANT=silinx USER_C_MODULES="$WORK/micropython/usermods" -j "$(nproc 2>/dev/null || echo 2)"

cat "$PORT/build-silinx/micropython.mjs" "$HERE/silinx-api.js" > "$OUT/micropython.mjs"
cp "$PORT/build-silinx/micropython.wasm" "$OUT/micropython.wasm"
cp "$WORK/micropython/LICENSE" "$OUT/LICENSE-micropython"
cp "$HERE/../../LICENSE" "$OUT/LICENSE"
(cd "$OUT" && sha256sum micropython.mjs micropython.wasm LICENSE-micropython LICENSE > SHA256SUMS)
cat "$OUT/SHA256SUMS"
