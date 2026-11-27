// An ELF32 executable read (#4687, core/elf32.js): a Zynq's PS program's segments and entry, against ELF files written by
// the tests' own writer (test/fixtures/arm-gcc-stub/elf.mjs, the System V ABI's layout); the refusals: not an ELF, a
// 64-bit or big-endian one, another machine's, an object file, its headers or a segment cut short.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readElf32 } from '../core/elf32.js';
import { writeElf32 } from './fixtures/arm-gcc-stub/elf.mjs';

const text = new Uint8Array([0xfe, 0xff, 0xff, 0xea, 1, 2, 3, 4]);

test('#4687 an ARM executable: its entry, its PT_LOAD segments by address (a .bss its memory only), their sizes', () => {
  const e = readElf32(writeElf32([{ addr: 0x100, bytes: new Uint8Array([9, 9]), memsz: 0x10 }, { addr: 0, bytes: text }, { addr: 0x200, bytes: new Uint8Array(0), memsz: 0 }, { type: 4, addr: 0x300, bytes: new Uint8Array([7]) }], { entry: 0x4 }));
  assert.deepEqual({ ...e, segments: e.segments.map((s) => ({ ...s, bytes: [...s.bytes] })) }, {
    entry: 4, size: 10, memsz: 0x18,
    segments: [{ addr: 0, bytes: [...text], memsz: 8 }, { addr: 0x100, bytes: [9, 9], memsz: 0x10 }],
  });
});

test('#4687 the refusals: not an ELF, 64-bit, big-endian, another machine, an object file, cut short', () => {
  const ok = writeElf32([{ addr: 0, bytes: text }]);
  assert.deepEqual([readElf32(new Uint8Array(10)), readElf32(new TextEncoder().encode('x'.repeat(60)))], [{ error: 'not an ELF file' }, { error: 'not an ELF file' }]);
  assert.deepEqual(readElf32(writeElf32([], { cls: 2 })), { error: 'not a 32-bit ELF (ELFCLASS32)' });
  assert.deepEqual(readElf32(writeElf32([], { data: 2 })), { error: 'not a little-endian ELF' });
  assert.deepEqual(readElf32(writeElf32([], { machine: 3 })), { error: 'not an ARM program (its machine 3)' });
  assert.deepEqual(readElf32(writeElf32([], { type: 1 })), { error: 'not an executable (an object or a shared library: link it)' });
  assert.deepEqual(readElf32(ok.slice(0, 60)), { error: 'its program headers are cut short' });
  assert.deepEqual(readElf32(ok.slice(0, ok.length - 2)), { error: 'its segment at 0x0 is cut short' });
  assert.deepEqual(readElf32(writeElf32([])), { entry: 0, segments: [], size: 0, memsz: 0 });
});
