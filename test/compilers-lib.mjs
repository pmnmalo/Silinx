// The tests of the real compilers (#6019): XC16 (a PIC24 node's) and arm-none-eabi-gcc (a Zynq's PS program's), in
// their Docker images (silinx/xc16:2.10, silinx/arm-none-eabi:12.2). SILINX_TEST_COMPILERS says where the images are:
//   docker           this computer's Docker (the ISE runner's nightly: .github/workflows/ise.yml)
//   <config.json>    a config.json's path: its ssh settings, the ISE machine's images over ssh
// Asked for, a compiler that is not there fails its test, said why, never skips it; not asked for, the test uses this
// computer's compiler when it has one, else it is skipped, said why.
import assert from 'node:assert/strict';
import fs from 'node:fs';

export const ASKED = process.env.SILINX_TEST_COMPILERS || '';

/** The config.json settings that point the compilers at the images asked for (none when none is). */
export function compilersConfig(asked = ASKED) {
  if (!asked) return {};
  if (asked === 'docker') return { xc16: { mode: 'docker' }, armGcc: { mode: 'docker' } };
  const cfg = JSON.parse(fs.readFileSync(asked, 'utf8'));
  return { ssh: cfg.ssh, xc16: { ...cfg.xc16, mode: 'ssh' }, armGcc: { ...cfg.armGcc, mode: 'ssh' } };
}

/** A test's skip: false when the compiler (detectXc16's, detectArmGcc's `tool`) is there or was asked for. */
export const skipWithout = (tool, what, asked = ASKED) => (tool.available || asked ? false : `no ${what} here (${tool.reason})`);

/** The test's first check: the compiler asked for is there (its reason said when it is not). */
export const assertThere = (tool, what, asked = ASKED) => assert.ok(tool.available, `${what}: SILINX_TEST_COMPILERS=${asked} asked for it, but ${tool.reason}`);
