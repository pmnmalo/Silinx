// @silinx/avr-gcc's build (#5934): the Arduino AVR core and its Wire and SPI libraries compiled by the package's own tools
// (src/index.js, the recipes of src/flags.js) into dist/arduino/lib/core.a, Wire.a and SPI.a, for the ATmega328P (the
// Uno's variant: neither the core's nor the libraries' code reads it). Run by build/build.sh; the sources stay in the package
// (dist/arduino/core, dist/arduino/libraries: the LGPL's corresponding source).
//
//   node packages/silinx-avr-gcc/build/precompile.mjs <dist folder>
import fs from 'node:fs';
import path from 'node:path';
import { createAvrGcc } from '../src/index.js';

const dist = path.resolve(process.argv[2] || 'dist');
const list = (d) => fs.readdirSync(path.join(dist, d), { recursive: true }).map((f) => `${d}/${String(f).replace(/\\/g, '/')}`).filter((f) => fs.statSync(path.join(dist, f)).isFile()).sort();
// (the manifest as the files are now: build.sh writes it again once the archives are there)
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ files: ['tools', 'sysroot', 'arduino'].flatMap(list).sort() }));
const gcc = await createAvrGcc({ read: (p) => fs.readFileSync(path.join(dist, p)) });
fs.mkdirSync(path.join(dist, 'arduino/lib'), { recursive: true });
const SETS = {
  core: list('arduino/core').filter((f) => /\.(c|cpp|S)$/.test(f)),
  Wire: list('arduino/libraries/Wire/src').filter((f) => /\.(c|cpp)$/.test(f)),
  SPI: list('arduino/libraries/SPI/src').filter((f) => /\.(c|cpp)$/.test(f)),
};
for (const [name, files] of Object.entries(SETS)) {
  let work = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dist, f))]));
  const objs = [];
  for (const f of files) {
    const obj = `${f.split('/').pop()}.o`;
    const r = await gcc.compile(f, obj, work);
    if (!r.ok) { console.error(`${f}: did not compile\n${r.log}`); process.exit(1); }
    if (r.log.trim()) console.log(r.log.trim());
    work = r.work; objs.push(obj);
  }
  const a = await gcc.run('ar', ['rcsD', `${name}.a`, ...objs], work);
  if (a.code !== 0) { console.error(`${name}.a: ${a.log}`); process.exit(1); }
  fs.writeFileSync(path.join(dist, `arduino/lib/${name}.a`), a.work[`${name}.a`]);
  console.log(`arduino/lib/${name}.a: ${files.length} files, ${a.work[`${name}.a`].length} bytes`);
}
