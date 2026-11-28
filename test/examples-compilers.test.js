// The examples' processors' programs built by the real compilers (#6019): every Zynq node's PS program (its ps/: uart-zynq,
// regs-zynq) linked by arm-none-eabi-gcc with Compile PS Program, every PIC24 node's program (uart-pic24's lcd_uart.asm,
// in xc16-as's syntax, #5931) by XC16 with Compile Firmware, each with no warning; XC16's .hex run on silinx-pic24 on the
// Explorer 16/32 beside the example's own .hex (Silinx's PIC24 assembler's build of the same source, its model): the
// same text on the USB-UART, the same LCD, the same LEDs, before and after characters typed on the terminal. The
// compilers: this computer's, or their images (SILINX_TEST_COMPILERS, test/compilers-lib.mjs: this computer's Docker,
// the ISE runner's nightly, or the ISE machine's over ssh); skipped, said why, without them, failed when asked for.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, waitJob, writeConfig, ROOT } from './server-helpers.js';
import { assertThere, compilersConfig, skipWithout } from './compilers-lib.mjs';
import { readSystem } from '../core/system-doc.js';
import { psOfBoard } from '../core/zynq-ps.js';
import { isPic24 } from '../core/xc16-compile.js';
import { Explorer1632, Pic24Node } from '../packages/silinx-pic24/src/index.js';

const tmp = await scratchEnv('silinx-examples-compilers-');
await writeConfig({ mode: 'silinx', ...compilersConfig() });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const jobs = await import('../server/jobs.js');
const { detectArmGcc, startPsCompile } = await import('../server/zynq-ps-compile.js');
const { detectXc16 } = await import('../server/xc16-compile.js');
const { startFirmwareCompile } = await import('../server/avr-compile.js');

// the examples' System nodes: [example, node]
const EX = path.join(ROOT, 'examples');
const NODES = fs.readdirSync(EX).sort().flatMap((ex) => fs.readdirSync(path.join(EX, ex)).filter((f) => f.endsWith('.sys.json'))
  .flatMap((f) => readSystem(fs.readFileSync(path.join(EX, ex, f), 'utf8')).system.nodes.map((n) => [ex, n])));
const ZYNQ = NODES.filter(([, n]) => n.kind === 'fpga' && psOfBoard(n.board, n.variant) && n.ps);
const PIC24 = NODES.filter(([, n]) => isPic24(n));
// (found before the first test: a test started by a later top-level await would see after()'s clean-up)
const [gcc, xc16] = [await detectArmGcc(), await detectXc16()];

test('#6019 the examples\' processors\' nodes: the Zynq\'s with a PS program, the PIC24\'s', () => {
  assert.deepEqual(ZYNQ.map(([ex, n]) => `${ex}.${n.id}`), ['regs-zynq.zybo', 'uart-zynq.zybo']);
  assert.deepEqual(PIC24.map(([ex, n]) => `${ex}.${n.id}`), ['uart-pic24.pic']);
});

const errorsAndWarnings = (j) => j.lines.filter((l) => /^(ERROR|WARNING)/.test(l));

test('#6019 every Zynq example\'s PS program linked by arm-none-eabi-gcc with no warning, its ELF in the on-chip memory', { skip: skipWithout(gcc, 'arm-none-eabi-gcc'), timeout: 600000 }, async () => {
  assertThere(gcc, 'arm-none-eabi-gcc');
  for (const [ex, n] of ZYNQ) {
    const name = `${ex}-ps`;
    await P.createProject({ name, template: ex });
    const j = await waitJob(jobs, (await startPsCompile(name, { node: n.id })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', `${ex}: ${j.lines.join('\n')}`);
    assert.deepEqual(errorsAndWarnings(j), [], `${ex}: no warning`);
    assert.match(j.lines.at(-1), new RegExp(`^System node ${n.id}: its PS program build/nodes/${n.id}/ps/out/${n.id}\\.elf, \\d+ bytes loaded in the on-chip memory`), ex);
  }
});

// what the Explorer 16/32 shows of a .hex run: the USB-UART's text, the LCD, the LEDs at 40 ms, then at 120 ms with
// characters typed on the terminal at 50 ms; the emulator's warnings
function board(hex) {
  const node = new Pic24Node({ hex });
  const b = new Explorer1632(node.device);
  const term = b.usbUart(9600);
  const lit = () => Object.entries(b.leds()).filter(([, on]) => on).map(([d]) => d);
  const seen = [];
  node.run(40e9);
  seen.push({ text: term.text, lcd: b.lcd.lines(), leds: lit() });
  node.run(50e9);
  term.type('Silinx\n');
  node.run(120e9);
  seen.push({ text: term.text, lcd: b.lcd.lines(), leds: lit() });
  return { seen, said: node.messages().filter((m) => m.kind !== 'info').map((m) => m.text) };
}

test('#6019 every PIC24 example\'s program built by XC16 with no warning, its .hex run on silinx-pic24 as the example\'s own .hex is', { skip: skipWithout(xc16, 'XC16'), timeout: 600000 }, async () => {
  assertThere(xc16, 'XC16');
  for (const [ex, n] of PIC24) {
    const name = `${ex}-fw`;
    await P.createProject({ name, template: ex });
    const model = fs.readFileSync(path.join(P.projectDir(name), n.firmware), 'utf8');
    // (an assembly program in xc16-as's syntax, a .asm: XC16's assembly is a .s)
    const dir = path.join(P.projectDir(name), n.id);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.asm'))) {
      await P.writeFile(name, `${n.id}/${f.replace(/\.asm$/, '.s')}`, fs.readFileSync(path.join(dir, f), 'utf8'));
      await P.deleteFile(name, `${n.id}/${f}`);
    }
    const j = await waitJob(jobs, (await startFirmwareCompile(name, { node: n.id })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', `${ex}: ${j.lines.join('\n')}`);
    assert.deepEqual(errorsAndWarnings(j), [], `${ex}: no warning`);
    const built = fs.readFileSync(path.join(P.projectDir(name), n.firmware), 'utf8');
    const [got, want] = [board(built), board(model)];
    assert.deepEqual(want.said, [], `${ex}: the example's own .hex runs with no warning`);
    assert.ok(want.seen[1].text.length > 0 && want.seen[1].lcd.join('').trim(), `${ex}: its model shows something`);
    assert.deepEqual(got, want, `${ex}: XC16's .hex runs as the example's`);
  }
});
