// The Systems' scheduler's benchmark (scripts/bench-system-sim.mjs, #4696) with a microcontroller node (#5912): node b an
// Arduino Uno's echo program (avr8js) on its D1 / D0, its USART at the UBRR nearest the baud rate; every row run, the
// bytes it sent back received by the FPGA node a, no message of the scheduler's (warning, error), none late.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bench = (...args) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/bench-system-sim.mjs', import.meta.url)), ...args, '--json'], { encoding: 'utf8' }));

test('#5912 the benchmark with an AVR node: every row run, its echo\'s bytes back, no warnings', { timeout: 300000 }, () => {
  const r = bench('--b', 'avr', '--baud', '9600', '--ms', '2');
  assert.deepEqual([r.b, r.baud, r.ms, Math.round(r.avrBaud)], ['avr', 9600, 2, 9615]);   // (16 MHz / 16 / (103 + 1))
  assert.equal(r.rows.length, 15);
  assert.equal(r.rows[0].what, 'the two nodes alone (no scheduler, links idle)');
  for (const x of r.rows) assert.ok(x.rate > 0, x.what);
  for (const x of r.rows.slice(1)) {
    assert.ok(x.bytes > 0, `${x.what} ${x.quantum}: the echo program's bytes back`);
    assert.deepEqual([x.warnings, x.late], [0, 0], `${x.what} ${x.quantum}`);
  }
});
