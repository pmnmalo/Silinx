#!/usr/bin/env node
// The ATmega328P's names for Silinx's AVR assembler (#5933: core/avr-asm.js), made from avr-libc's device header
// (avr/include/avr/iom328p.h, Atmel's, under the BSD licence its notice states: kept in the file written) into
// core/avr-m328p.js: its registers (an I/O register at its I/O address, as avrasm2's m328Pdef.inc gives it; one
// past the I/O space at its data address), their bits, its vectors (`<name>addr`, a word address: INT0addr) and its
// memory's sizes (RAMEND, FLASHEND, E2END…). Run again when the header changes:
//
//   node scripts/avr-symbols.mjs <path to iom328p.h> > core/avr-m328p.js
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/avr-symbols.mjs <iom328p.h>'); process.exit(2); }
const text = fs.readFileSync(file, 'utf8');
const notice = /\/\*\s*(Copyright[\s\S]*?)\*\//.exec(text)[1].trimEnd();
const num = (s) => (/^0x/i.test(s) ? parseInt(s, 16) : /^\d+$/.test(s) ? parseInt(s, 10) : null);
const regs = {}, bits = {}, other = {};
let vectors = {};
for (const [, name, value] of text.matchAll(/^#define\s+(\w+)\s+([^\n/]*?)\s*(?:\/\*.*)?$/gm)) {
  let m;
  if ((m = /^_SFR_IO(?:8|16)\((0x[0-9A-F]+)\)$/i.exec(value))) regs[name] = num(m[1]);
  else if ((m = /^_SFR_MEM(?:8|16)\((0x[0-9A-F]+)\)$/i.exec(value))) { const a = num(m[1]); regs[name] = a; }
  else if ((m = /^_VECTOR\((\d+)\)$/.exec(value)) && name.endsWith('_vect')) vectors[name.slice(0, -5) + 'addr'] = 2 * +m[1];
  else if (num(value) != null && !name.startsWith('_') && !name.endsWith('_vect_num')) (/^(RAMSTART|RAMEND|XRAMEND|E2END|E2PAGESIZE|FLASHEND|SPM_PAGESIZE|SIGNATURE_\d)$/.test(name) ? other : bits)[name] = num(value);
  else if (num(value) == null && /^[A-Z]\w*$/.test(value) && (value in bits || value in other)) (value in bits ? bits : other)[name] = (bits[value] ?? other[value]);
}
// the core's registers and bits avr-libc defines in common.h, for every AVR (SREG, the stack pointer)
Object.assign(regs, { SPL: 0x3d, SPH: 0x3e, SREG: 0x3f });
Object.assign(bits, { SREG_C: 0, SREG_Z: 1, SREG_N: 2, SREG_V: 3, SREG_S: 4, SREG_H: 5, SREG_T: 6, SREG_I: 7 });
// the ports' pins by their short names (avr-libc's portpins.h: PB5 is PORTB5)
for (const [n, v] of Object.entries(bits)) { const m = /^PORT([B-D])(\d)$/.exec(n); if (m) bits[`P${m[1]}${m[2]}`] = v; }
// an I/O register is named at its I/O address (0x00..0x3f, in and out's; its data address 0x20 more), as avrasm2's
for (const [n, a] of Object.entries(regs)) if (a >= 0x20 && a < 0x60 && !['SPL', 'SPH', 'SREG'].includes(n)) regs[n] = a - 0x20;
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const lines = (o) => Object.entries(sorted(o)).map(([k, v]) => `${k}:0x${v.toString(16)}`).join(',');
// (the module's exports, written into its text: not this script's own)
const EXPORT = 'export';
const wrap = (s) => s.match(/.{1,116}(,|$)/g).map((l) => `  ${l}`).join('\n');
process.stdout.write(`// Silinx - the ATmega328P's names for the AVR assembler (#5933, core/avr-asm.js): made by scripts/avr-symbols.mjs from
// avr-libc's avr/include/avr/iom328p.h; do not edit. Its registers at their I/O address (in, out, sbi…) when they are in
// the I/O space, else at their data address (lds, sts), as avrasm2's m328Pdef.inc names them; their bits; the vectors'
// word addresses (INT0addr); the memory's ends. The header's notice:
//
${notice.split('\n').map((l) => `// ${l.replace(/^\s{0,3}/, '')}`.trimEnd()).join('\n')}

/** The registers' addresses. */
${EXPORT} const REGISTERS = {
${wrap(lines(regs))}
};
/** The registers' bits, the ports' pins (PB5), the status register's flags (SREG_I). */
${EXPORT} const BITS = {
${wrap(lines(bits))}
};
/** The interrupt vectors' word addresses. */
${EXPORT} const VECTORS = {
${wrap(lines(vectors))}
};
/** The memory's ends and sizes. */
${EXPORT} const MEMORY = { ${Object.entries(sorted(other)).map(([k, v]) => `${k}: 0x${v.toString(16)}`).join(', ')} };
`);
