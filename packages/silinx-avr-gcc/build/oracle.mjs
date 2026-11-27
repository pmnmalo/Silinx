// @silinx/avr-gcc's oracle (#5934): every sketch of build/oracle/ built by the package's WebAssembly tools and by Arduino's
// native toolchain (the same avr-gcc 7.3.0-atmel3.6.1-arduino7, its Linux or macOS build) with the same flags and the same
// Arduino core: the same .hex, byte for byte. With --arduino-cli <path>, arduino-cli itself too (its arduino:avr core
// installed), LTO turned off by its build properties (-fno-lto after its -flto): the same .hex again. Its warnings are
// compared as well (the tools' messages, their file and line). Exit status 1 on a difference.
//
//   node packages/silinx-avr-gcc/build/oracle.mjs <dist> <native toolchain folder> <Arduino core folder> [--arduino-cli <path>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAvrGcc } from '../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [dist, tc, core] = process.argv.slice(2, 5).map((p) => p && path.resolve(p));
const cliAt = process.argv.indexOf('--arduino-cli'), cli = cliAt > 0 ? process.argv[cliAt + 1] : null;
if (!dist || !tc || !core) { console.error('usage: oracle.mjs <dist> <native toolchain> <Arduino core> [--arduino-cli <path>]'); process.exit(2); }
const bin = (t) => path.join(tc, 'bin', `avr-${t}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-oracle-'));
const FLAGS = ['-mmcu=atmega328p', '-DF_CPU=16000000L', '-DARDUINO=10607', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR', `-I${core}/cores/arduino`, `-I${core}/variants/standard`,
  `-I${core}/libraries/Wire/src`, `-I${core}/libraries/Wire/src/utility`, `-I${core}/libraries/SPI/src`];
const C = ['-c', '-Os', '-std=gnu11', '-ffunction-sections', '-fdata-sections', ...FLAGS];
const CXX = ['-c', '-Os', '-std=gnu++11', '-fpermissive', '-fno-exceptions', '-ffunction-sections', '-fdata-sections', '-fno-threadsafe-statics', '-Wno-error=narrowing', ...FLAGS];
const cc = (src, obj) => {
  const args = /\.S$/.test(src) ? ['-c', '-x', 'assembler-with-cpp', ...FLAGS] : /\.c$/.test(src) ? C : CXX;
  execFileSync(bin(/\.(c|S)$/.test(src) ? 'gcc' : 'g++'), [...args, src, '-o', obj], { stdio: ['ignore', 'ignore', 'pipe'] });
};
// the core's and the libraries' archives, natively
const archive = (name, dir, re) => {
  const objs = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => re.test(f)).sort().map((f) => {
    const obj = path.join(tmp, `${name}-${f.replace(/[/\\]/g, '_')}.o`); cc(path.join(dir, f), obj); return obj;
  });
  const a = path.join(tmp, `${name}.a`);
  execFileSync(bin('gcc-ar'), ['rcs', a, ...objs]);
  return a;
};
// (the libraries before the core they call, as the package and arduino-cli link them)
const archives = [archive('Wire', `${core}/libraries/Wire/src`, /\.(c|cpp)$/), archive('SPI', `${core}/libraries/SPI/src`, /\.(c|cpp)$/), archive('core', `${core}/cores/arduino`, /\.(c|cpp|S)$/)];

const gcc = await createAvrGcc({ read: (p) => fs.readFileSync(path.join(dist, p)) });
let bad = 0;
for (const name of fs.readdirSync(path.join(HERE, 'oracle')).sort()) {
  const dir = path.join(HERE, 'oracle', name);
  const files = Object.fromEntries(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  const t0 = performance.now();
  const r = await gcc.buildSketch({ files, main: `${name}.ino` });
  const ms = performance.now() - t0;
  if (!r.ok) { bad++; console.log(`${name}: the WebAssembly build failed\n${r.log}`); continue; }
  // natively: the same C++ (the sketch's .ino made one), the same sources, flags and archives
  const out = path.join(tmp, name);
  fs.mkdirSync(out, { recursive: true });
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(out, f), t);
  fs.writeFileSync(path.join(out, `${name}.ino.cpp`), r.cpp);
  const objs = [`${name}.ino.cpp`, ...Object.keys(files).filter((f) => /\.(c|cpp|S)$/.test(f))].sort().map((f) => { const o = path.join(out, `${f}.o`); cc(path.join(out, f), o); return o; });
  const elf = path.join(out, 'sketch.elf'), hex = path.join(out, 'sketch.hex');
  execFileSync(bin('gcc'), ['-Os', '-Wl,--gc-sections', '-mmcu=atmega328p', '-o', elf, ...objs, ...archives, '-lm']);
  execFileSync(bin('objcopy'), ['-O', 'ihex', '-R', '.eeprom', elf, hex]);
  const same = fs.readFileSync(hex, 'utf8') === r.hex;
  let line = `${name}: ${r.size} bytes, ${ms.toFixed(0)} ms in WebAssembly; native toolchain ${same ? 'the same .hex' : 'A DIFFERENT .hex'}`;
  if (!same) bad++;
  if (cli) {
    const sk = path.join(tmp, 'cli', name);
    fs.mkdirSync(sk, { recursive: true });
    for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(sk, f), t);
    const o = path.join(sk, 'out');
    // (--clean and a build folder of its own: arduino-cli's cached core, LTO's, not reused)
    execFileSync(cli, ['compile', '--clean', '--build-path', path.join(sk, 'build'), '--fqbn', 'arduino:avr:uno', '--build-property', 'compiler.c.extra_flags=-fno-lto', '--build-property', 'compiler.cpp.extra_flags=-fno-lto',
      '--build-property', 'compiler.S.extra_flags=-fno-lto', '--build-property', 'compiler.c.elf.extra_flags=-fno-lto', '--output-dir', o, sk], { stdio: ['ignore', 'ignore', 'pipe'] });
    const cliSame = fs.readFileSync(path.join(o, `${name}.ino.hex`), 'utf8') === r.hex;
    if (!cliSame) bad++;
    line += `; arduino-cli (-fno-lto) ${cliSame ? 'the same .hex' : 'A DIFFERENT .hex'}`;
  }
  console.log(line);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} difference(s)` : 'every sketch the same');
process.exit(bad ? 1 : 0);
