// @silinx/avr-gcc (#5934, packages/silinx-avr-gcc): its modules import one another only (no Silinx module, no npm package);
// its package.json's files and exports. On the built package (dist/, built by build/build.sh: the release workflow's;
// skipped, said why, elsewhere): every oracle sketch built, no warning; a sketch's error and warning at its own file and
// line (the .ino made C++ mapped back by its #line lines), the build failed; a sketch too big for the flash, or for the RAM,
// refused as arduino-cli refuses it; the Nano's build; its files' list and sums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(ROOT, 'packages/silinx-avr-gcc');
const DIST = path.join(PKG, 'dist');
const BUILT = fs.existsSync(path.join(DIST, 'manifest.json')) ? false : 'its dist/ is not built here (packages/silinx-avr-gcc/build/build.sh, the release workflow\'s)';

test('#5934 @silinx/avr-gcc\'s modules import one another only; its package.json', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
  assert.equal(pj.name, '@silinx/avr-gcc');
  assert.deepEqual(pj.files, ['src', 'dist', 'README.md']);
  assert.deepEqual(pj.exports, { '.': './src/index.js' });
  assert.equal(pj.publishConfig.provenance, true);
  for (const f of fs.readdirSync(path.join(PKG, 'src'))) {
    for (const [, spec] of fs.readFileSync(path.join(PKG, 'src', f), 'utf8').matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      assert.ok(spec.startsWith('./') || spec === 'node:module', `${f}: ${spec}`);
    }
  }
});

const gcc = BUILT ? null : await (await import('../packages/silinx-avr-gcc/src/index.js')).createAvrGcc({ read: (p) => fs.readFileSync(path.join(DIST, p)) });
const oracle = (name) => Object.fromEntries(fs.readdirSync(path.join(PKG, 'build/oracle', name)).map((f) => [f, fs.readFileSync(path.join(PKG, 'build/oracle', name, f), 'utf8')]));

test('#5934 every oracle sketch built, no warning; its files and their sums', { skip: BUILT }, async () => {
  for (const name of fs.readdirSync(path.join(PKG, 'build/oracle')).sort()) {
    const r = await gcc.buildSketch({ files: oracle(name), main: `${name}.ino` });
    assert.equal(r.ok, true, `${name}: ${r.log}`);
    // no warning: its log arduino-cli's two lines of its sizes only
    assert.deepEqual(r.log.trim().split('\n'), [`Sketch uses ${r.size} bytes (${Math.round((100 * r.size) / 32256)}%) of program storage space. Maximum is 32256 bytes.`,
      `Global variables use ${r.data} bytes (${Math.round((100 * r.data) / 2048)}%) of dynamic memory, leaving ${2048 - r.data} bytes for local variables. Maximum is 2048 bytes.`], name);
    assert.match(r.hex, /^:10000000[0-9A-F]{32}[0-9A-F]{2}\r\n[\s\S]*:00000001FF\r\n$/);   // (avr-objcopy's CR LF, as arduino-cli's)
    assert.ok(r.size > 300 && r.size < 32256, `${name}: ${r.size} bytes`);
  }
  const sums = Object.fromEntries(fs.readFileSync(path.join(DIST, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).reverse()));
  const { files } = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(sums).sort(), [...files].sort());
  for (const f of ['tools/cc1.wasm', 'tools/cc1plus.wasm', 'tools/ld.js', 'sysroot/avr/lib/crtatmega328p.o', 'arduino/lib/core.a', 'arduino/lib/Wire.a', 'arduino/lib/SPI.a', 'arduino/core/Arduino.h', 'LICENSES/SOURCES.md']) {
    assert.ok(files.includes(f), f);
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(DIST, f))).digest('hex'), sums[f], f);
  }
});

test('#5934 a sketch\'s error and warning at its own file and line; the build failed; the flash overflowed; the Nano', { skip: BUILT }, async () => {
  const bad = await gcc.buildSketch({ files: { 'blink.ino': 'void setup() {\n  int unused;\n#warning check the baud\n}\n\nvoid loop() {\n  nothing();\n}\n' } });
  assert.equal(bad.ok, false);
  assert.match(bad.log, /^blink\.ino:3:2: warning: #warning check the baud \[-Wcpp\]$/m);
  assert.match(bad.log, /^blink\.ino:7:3: error: 'nothing' was not declared in this scope$/m);
  // (another .ino's line, past the main one's)
  const two = await gcc.buildSketch({ files: { 'a.ino': 'void setup() {}\nvoid loop() { b(); }\n', 'b.ino': '\n\nvoid b() { int x = ; }\n' } });
  assert.match(two.log, /^b\.ino:3:20: error: expected primary-expression before ';' token$/m);
  // the flash's 32 KB overflowed: the linker says so
  const big = await gcc.buildSketch({ files: { 'big.ino': 'const char a[17000] PROGMEM = {1}, b[17000] PROGMEM = {2};\nvoid setup() { Serial.begin(9600); Serial.print((int)pgm_read_byte(&a[millis() % 17000]) + (int)pgm_read_byte(&b[micros() % 17000])); }\nvoid loop() {}\n' } });
  assert.equal(big.ok, false);
  assert.match(big.log, /^Sketch too big: 3\d{4} bytes, the most arduino-uno takes is 32256$/m);
  // the RAM's: too much static data
  const ram = await gcc.buildSketch({ files: { 'ram.ino': 'char buf[2100];\nvoid setup() { Serial.begin(9600); buf[micros() % 2100] = 1; Serial.print(buf[millis() % 2100]); }\nvoid loop() {}\n' } });
  assert.equal(ram.ok, false);
  assert.match(ram.log, /^Not enough memory: 2\d{3} bytes of static data, arduino-uno has 2048$/m);
  // the Nano: its variant (A6, A7)
  const nano = await gcc.buildSketch({ files: { 'n.ino': 'void setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(analogRead(A7)); }\n' }, board: 'arduino-nano' });
  assert.equal(nano.ok, true, nano.log);
  await assert.rejects(gcc.buildSketch({ files: { 'x.ino': '' }, board: 'arduino-mega' }), /no board 'arduino-mega' \(arduino-uno, arduino-nano\)/);
});
