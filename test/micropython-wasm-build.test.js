// The ESP32 node's MicroPython build for its JSPI back end (#5658, scripts/micropython-wasm/): the build's files as the
// workflow runs them. The build itself (emsdk, a few minutes) runs only in .github/workflows/micropython-wasm.yml, never
// here: these tests read what it builds from and how.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DIR = 'scripts/micropython-wasm';

test('#5658 the build: MicroPython and emsdk at pinned tags checked against their commits, the variant and the module copied in, WebAssembly\'s longjmp', () => {
  const sh = read(`${DIR}/build.sh`);
  assert.match(sh, /^MICROPYTHON_TAG="v\d+\.\d+\.\d+" MICROPYTHON_COMMIT="[0-9a-f]{40}"$/m);
  assert.match(sh, /^EMSDK_TAG="\d+\.\d+\.\d+" EMSDK_COMMIT="[0-9a-f]{40}"$/m);
  // (a tag is checked against its commit: a moved tag stops the build)
  assert.match(sh, /\[ "\$\(git -C "\$4" rev-parse HEAD\)" = "\$3" \] \|\| \{ echo "\$1: tag \$2 is not commit \$3"; exit 1; \}/);
  assert.match(sh, /clone https:\/\/github\.com\/emscripten-core\/emsdk\.git "\$EMSDK_TAG" "\$EMSDK_COMMIT"/);
  assert.match(sh, /clone https:\/\/github\.com\/micropython\/micropython\.git "\$MICROPYTHON_TAG" "\$MICROPYTHON_COMMIT"/);
  assert.match(sh, /\.\/emsdk install "\$EMSDK_TAG" .*\.\/emsdk activate "\$EMSDK_TAG"/);
  assert.match(sh, /sed -i\.orig 's\/SUPPORT_LONGJMP=emscripten\/SUPPORT_LONGJMP=wasm\/'/);
  assert.match(sh, /make -s -C "\$PORT" VARIANT=silinx USER_C_MODULES="\$WORK\/micropython\/usermods"/);
  // the output: the module with silinx-api.js appended, the .wasm, both licences, their SHA-256s
  assert.match(sh, /cat "\$PORT\/build-silinx\/micropython\.mjs" "\$HERE\/silinx-api\.js" > "\$OUT\/micropython\.mjs"/);
  assert.match(sh, /sha256sum micropython\.mjs micropython\.wasm LICENSE-micropython LICENSE > SHA256SUMS/);
  assert.match(sh, /SOURCE_DATE_EPOCH=0/);
});

test('#5658 the variant: the pyscript variant\'s configuration with sys.settrace; WebAssembly\'s exceptions, JSPI, silinx_exec promising', () => {
  const h = read(`${DIR}/silinx/mpconfigvariant.h`);
  for (const d of ['MICROPY_CONFIG_ROM_LEVEL                (MICROPY_CONFIG_ROM_LEVEL_FULL_FEATURES)', 'MICROPY_GC_SPLIT_HEAP_AUTO              (1)', 'MICROPY_PY_WEAKREF                      (1)', 'MICROPY_PY_SYS_SETTRACE                 (1)'])
    assert.ok(h.includes(`#define ${d}`), d);
  const mk = read(`${DIR}/silinx/mpconfigvariant.mk`);
  assert.match(mk, /^CFLAGS \+= -fwasm-exceptions -sSUPPORT_LONGJMP=wasm$/m);
  assert.match(mk, /^JSFLAGS \+= -fwasm-exceptions -s JSPI -s JSPI_EXPORTS=silinx_exec$/m);
  assert.match(mk, /^EXPORTED_FUNCTIONS_EXTRA \+= ,_silinx_exec$/m);
  assert.match(mk, /^FROZEN_MANIFEST \?= \$\(TOP\)\/ports\/webassembly\/variants\/pyscript\/manifest\.py$/m);
});

test('#5658 the module silinx_jspi: wait() a suspending import (Module.silinxWait, the instance\'s Module put back), silinx_exec the run', () => {
  const c = read(`${DIR}/silinx_jspi/silinx_jspi.c`);
  assert.match(c, /EM_ASYNC_JS\(int, silinx_jspi_suspend, \(void\), \{\n    const n = await Module\.silinxWait\(\);\n    globalThis\.Module = Module;\n    return n \| 0;\n\}\);/);
  assert.match(c, /MP_REGISTER_MODULE\(MP_QSTR_silinx_jspi, silinx_jspi_module\);/);
  assert.match(c, /\{ MP_ROM_QSTR\(MP_QSTR_wait\), MP_ROM_PTR\(&silinx_jspi_wait_obj\) \}/);
  assert.match(c, /EMSCRIPTEN_KEEPALIVE void silinx_exec\(const char \*src, size_t len, uint32_t \*out\) \{\n    mp_js_do_exec\(src, len, out\);\n\}/);
  assert.match(read(`${DIR}/silinx_jspi/micropython.mk`), /^SRC_USERMOD \+= \$\(SILINX_JSPI_DIR\)\/silinx_jspi\.c$/m);
  // runPythonSuspending: the run awaited through ccall's async path, its result converted as runPython's
  const api = read(`${DIR}/silinx-api.js`);
  assert.match(api, /^export async function runPythonSuspending\(mp, code, wait\) \{$/m);
  assert.match(api, /await Module\.ccall\("silinx_exec", "null", \["pointer", "number", "pointer"\], \[buf, len, value\], \{ async: true \}\);/);
  assert.match(api, /return proxy_convert_mp_to_js_obj_jsside_with_free\(value\);/);
});

test('#5658 the workflow: on a pull request that changes the build, and by hand; built twice and compared, the smoke test with JSPI; a release only from main', () => {
  const y = read('.github/workflows/micropython-wasm.yml');
  assert.match(y, /^on:\n  pull_request:\n    paths: \[scripts\/micropython-wasm\/\*\*, \.github\/workflows\/micropython-wasm\.yml\]\n  workflow_dispatch:\n/m);
  assert.match(y, /^permissions:\n  contents: read\n/m);
  assert.match(y, /scripts\/micropython-wasm\/build\.sh "\$RUNNER_TEMP\/a" out\n\s+scripts\/micropython-wasm\/build\.sh "\$RUNNER_TEMP\/b\/c" "\$RUNNER_TEMP\/again"/);
  assert.match(y, /run: diff out\/SHA256SUMS "\$RUNNER_TEMP\/again\/SHA256SUMS"/);
  assert.match(y, /run: node --experimental-wasm-jspi scripts\/micropython-wasm\/smoke\.mjs out/);
  // (the writing token only in the release's job, which runs no code of the pull request's and only on main)
  const release = y.slice(y.indexOf('\n  release:'));
  assert.match(release, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(release, /permissions:\n      contents: write/);
  assert.doesNotMatch(y.slice(0, y.indexOf('\n  release:')), /contents: write/);
  assert.match(release, /TAG="micropython-wasm-\$MP-\$BUILD"/);
  assert.match(release, /\[\[ "\$BUILD" =~ \^\[0-9\]\+\$ \]\]/);
  for (const a of y.match(/uses: \S+/g)) assert.match(a, /@[0-9a-f]{40}$/, a);
});

test('#5658 the smoke test checks what the back end needs: a suspension, settrace, exceptions across it, two instances', () => {
  const s = read(`${DIR}/smoke.mjs`);
  for (const what of ['silinx_jspi.wait() suspends', 'sys.settrace: a wait at each line', 'exceptions after a suspension', 'two instances suspended at once', 'runPython and registerJsModule as before'])
    assert.ok(s.includes(`ok('${what}`), what);
});
