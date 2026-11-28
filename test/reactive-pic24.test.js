// The synchronous reactive model's C on the PIC24 (#5552, core/reactive-c-pic24.js): each drawing's unit of its node's
// program on the PIC24FJ1024GB610's port registers, checked tick by tick against the model (core/reactive.js), as the
// Arduino's are (test/reactive-avr.test.js). Without XC16, a stand-in: this computer's C compiler with a <xc.h> of the
// port registers as plain variables, the unit's ticks driven by a harness (its PORTx the inputs, its LATx read back), with
// no compiler warning (-Wall, as XC16's), its pins' TRISx and ANSx set by its init; and the node's main.c, compiled
// against it. With XC16 (this computer's, or the ISE machine's image: SILINX_TEST_XC16_CONFIG a config.json with its
// ssh and xc16 settings), each drawing with the node's main.c compiled by Compile Firmware and its .hex run on
// silinx-pic24: every TICK_MS of Timer1 a tick, the inputs on its pins, its outputs on its pins the model's. Skipped,
// said why, without them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { drawingToReactive } from '../core/reactive-from.js';
import { TICK_MS } from '../core/reactive-c.js';
import { assignPic24Pins, generatePic24Unit, pic24Main, pic24Pin, PIC24_FCY } from '../core/reactive-c-pic24.js';
import { Pic24Node } from '../packages/silinx-pic24/src/index.js';
import { EDGES, EXAMPLE_DRAWINGS, randomVectors, readJson, runModel, timerModel } from './reactive-lib.mjs';
import { scratchEnv, waitJob, writeConfig } from './server-helpers.js';

const modelOf = (kind, doc) => { const r = drawingToReactive(kind, doc); assert.equal(r.errors, undefined); return r.model; };
const MODELS = () => [...EXAMPLE_DRAWINGS.map(([kind, file]) => modelOf(kind, readJson(file))), ...EDGES.map(([kind, make]) => modelOf(kind, make())), timerModel()];
const PORTS = 'ABCDEFG'.split('');
const pinOf = (p) => ({ port: p[1], bit: Number(p.slice(2)) });

test('#5552 the ports\' pins: the inputs on the buttons, the outputs on the LEDs, then the free pins; the given ones checked, the board\'s own warned of', () => {
  assert.deepEqual([pic24Pin('ra0'), pic24Pin('rd13'), pic24Pin('RG15'), pic24Pin('RA8'), pic24Pin('RH0'), pic24Pin('D2')], ['RA0', 'RD13', 'RG15', null, null, null], 'D2 an Arduino\'s pin, not one');
  const a = assignPic24Pins([{ name: 'go', width: 1 }, { name: 'k', width: 4 }], [{ name: 'led', width: 1 }, { name: 'n', width: 8 }]);
  assert.deepEqual(a, { pins: { go: ['RD6'], k: ['RD13', 'RD7', 'RA7', 'RB2'], led: ['RA0'], n: ['RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RA6', 'RB3', 'RB6'] }, errors: [], warnings: [] });
  const g = assignPic24Pins([{ name: 'rx', width: 1 }], [{ name: 'y', width: 2 }], { rx: 'RF4', y: ['ra7', 'RE0'] });
  assert.deepEqual(g, { pins: { rx: ['RF4'], y: ['RA7', 'RE0'] }, errors: [], warnings: ['RF4 is the USB-UART\'s RX on the Explorer 16/32: \'rx\' on it disturbs it', 'RE0 is the LCD\'s D0 on the Explorer 16/32: \'y\' on it disturbs it'] });
  assert.deepEqual(assignPic24Pins([{ name: 'a', width: 2 }], [{ name: 'b', width: 1 }], { a: ['RA0'], b: 'RZ1' }).errors, ['\'a\' is 2 bits wide: it needs 2 pins, not 1', '\'RZ1\' is not a pin of the PIC24FJ1024GB610 (RA0 to RG15)']);
  assert.deepEqual(assignPic24Pins([{ name: 'a', width: 1 }], [{ name: 'b', width: 1 }], { a: 'RA0', b: 'RA0' }).errors, ['RA0 is given to \'a\' and to \'b\'']);
  assert.deepEqual(assignPic24Pins([], [{ name: 'w', width: 64 }]).errors, ['The ports need 64 more pins: the board has 59 free']);
  // (a port named as one of XC16's registers: renamed, said)
  const m = timerModel();
  m.inputs[0].name = 'PORTA';
  m.arms[1].body[1].cond.name = 'PORTA';
  const u = generatePic24Unit(m);
  assert.deepEqual(u.warnings, ['\'PORTA\' is a word of C or of XC16\'s device header, or a name of the sketch\'s: it is PORTA_v in the sketch']);
});

// ---------------------------------------------------------------------------------------------------- the stand-in
const CC = ['cc', 'gcc', 'clang'].find((c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0);
const NO_CC = !CC && 'no C compiler on this computer (cc, gcc, clang) for the stand-in';
const regs = PORTS.flatMap((p) => [`PORT${p}`, `TRIS${p}`, `LAT${p}`, ...(p === 'F' ? [] : [`ANS${p}`])]).concat(['PR1', 'TMR1', 'IFS0', 'T1CON']);
// (the port registers as variables: XC16's <xc.h> declares them so, at their addresses)
const XC_H = ['#include <stdint.h>', ...regs.map((r) => `extern volatile uint16_t ${r};`), '#define ClrWdt() ((void)0)', ''].join('\n');
// (the harness: the registers at their reset (every pin an input, the analog ones analog), the unit's init, its TRISx and
// ANSx said; then a line of PORTA..PORTG a tick, its LATA..LATG said)
const ANALOG = { A: 0x06c0, B: 0xffff, C: 0x6010, D: 0x20c0, E: 0x0210, G: 0x03c0 };
const harness = (module) => ['#include <stdio.h>', '#include "xc.h"', ...regs.map((r) => `volatile uint16_t ${r};`),
  `void ${module}_init(void);`, `void ${module}_tick(void);`, 'int main(void) {',
  ...PORTS.map((p) => `  TRIS${p} = 0xffff;${p === 'F' ? '' : ` ANS${p} = ${ANALOG[p]};`}`), `  ${module}_init();`,
  `  printf("${PORTS.map(() => '%u').join(' ')}\\n", ${PORTS.map((p) => `TRIS${p}`).join(', ')});`,
  `  printf("${PORTS.filter((p) => p !== 'F').map(() => '%u').join(' ')}\\n", ${PORTS.filter((p) => p !== 'F').map((p) => `ANS${p}`).join(', ')});`,
  `  unsigned v[7];`, `  while (scanf("${PORTS.map(() => '%u').join(' ')}", ${PORTS.map((_, i) => `&v[${i}]`).join(', ')}) == 7) {`,
  ...PORTS.map((p, i) => `    PORT${p} = v[${i}];`), `    ${module}_tick();`,
  `    printf("${PORTS.map(() => '%u').join(' ')}\\n", ${PORTS.map((p) => `LAT${p}`).join(', ')});`, '  }', '  return 0;', '}', ''].join('\n');

let dir;
before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-reactive-pic24-')); fs.writeFileSync(path.join(dir, 'xc.h'), XC_H); });
after(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

// a compile by the stand-in: no error, no warning (-Wall, XC16's; gnu99, its C)
function cc(files, out) {
  const r = spawnSync(CC, ['-std=gnu99', '-Wall', '-I', dir, '-o', out, ...files], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.trim(), '', 'no compiler warning');
}

// the inputs `v` on their pins: PORTA..PORTG; the outputs from LATA..LATG, as runModel's rows
const portsOf = (model, pins, v) => {
  const w = Object.fromEntries(PORTS.map((p) => [p, 0]));
  for (const i of model.inputs) pins[i.name].forEach((p, b) => { if ((BigInt(v[i.name]) >> BigInt(b)) & 1n) w[pinOf(p).port] |= 1 << pinOf(p).bit; });
  return PORTS.map((p) => w[p]);
};
const rowOf = (model, pins, level) => model.outputs.map((o) => [...pins[o.name]].reverse().map(level).join('')).join('_');

test('#5552 the drawings\' C on the PIC24\'s registers, by a stand-in compiler with no warning: their pins\' TRISx and ANSx, then tick by tick what their models do', { skip: NO_CC }, () => {
  for (const [k, m] of MODELS().entries()) {
    const g = generatePic24Unit(m);
    assert.equal(g.errors, undefined, JSON.stringify(g.errors));
    assert.deepEqual(g.warnings, [], `${m.name}: no warning`);
    fs.writeFileSync(path.join(dir, g.filename), g.code);
    fs.writeFileSync(path.join(dir, 'harness.c'), harness(m.name));
    const exe = path.join(dir, `run_${m.name}`);
    cc(['harness.c', g.filename], exe);
    const vectors = randomVectors(m.inputs, 200, 41 + k);
    const r = spawnSync(exe, [], { input: vectors.map((v) => portsOf(m, g.pins, v).join(' ')).join('\n') + '\n', encoding: 'utf8' });
    const [tris, ans, ...rows] = r.stdout.trim().split('\n').map((l) => l.split(' ').map(Number));
    // (its inputs' pins inputs, its outputs' outputs, all of them digital; the others as at reset)
    const T = Object.fromEntries(PORTS.map((p, i) => [p, tris[i]])), A = Object.fromEntries(PORTS.filter((p) => p !== 'F').map((p, i) => [p, ans[i]]));
    for (const [ports, out] of [[m.inputs, false], [m.outputs, true]]) for (const x of ports) for (const p of g.pins[x.name]) {
      const { port, bit } = pinOf(p);
      assert.equal((T[port] >> bit) & 1, out ? 0 : 1, `${m.name}: ${p}'s TRIS${port}`);
      if (port !== 'F') assert.equal((A[port] >> bit) & 1, 0, `${m.name}: ${p}'s ANS${port}`);
    }
    const used = new Set(Object.values(g.pins).flat());
    for (const p of PORTS) assert.equal(T[p] | [...used].filter((x) => pinOf(x).port === p).reduce((a, x) => a | (1 << pinOf(x).bit), 0), 0xffff, `${m.name}: TRIS${p}'s other pins inputs`);
    const lat = (row) => (pin) => (row[PORTS.indexOf(pinOf(pin).port)] >> pinOf(pin).bit) & 1;
    const got = rows.map((row) => rowOf(m, g.pins, lat(row)));
    assert.deepEqual(got, runModel(m, vectors), m.name);
    assert.ok(new Set(got).size > 1, `${m.name}: its outputs change`);
  }
});

test('#5552 the node\'s main.c: each unit\'s init, then every tick of Timer1 (Fcy / 8, its period TICK_MS) each one\'s tick, the watchdog cleared; by the stand-in with no warning', { skip: NO_CC }, () => {
  const units = [{ module: 'traffic', file: 'pic/traffic.fsm.json' }, { module: 'alarm', file: 'pic/alarm.pn.json' }];
  const main = pic24Main('pic', units, { mark: 'generated by Silinx from the node\'s drawings' });
  const L = main.split('\n');
  assert.equal(L[0], '// pic: its program, generated by Silinx from the node\'s drawings (traffic.fsm.json, alarm.pn.json): edit the drawings, not this file.');
  for (const l of ['#define FCY 2000000UL   // the instruction clock: the FRC (8 MHz) through its divider at reset, over 2', '#define TICK_MS 10   // the tick\'s period',
    '  traffic_init();', '  alarm_init();', `  PR1 = ${PIC24_FCY / 8 / 1000 * TICK_MS - 1};   // FCY / 8 / 1000 * TICK_MS - 1`, '  T1CON = 0x8010;   // TON, a 1:8 prescaler, Fcy', '    ClrWdt();',
    '      traffic_tick();', '      alarm_tick();']) assert.ok(L.includes(l), l);
  assert.equal(PIC24_FCY / 8 / 1000 * TICK_MS - 1, 2499);
  fs.writeFileSync(path.join(dir, 'main.c'), main);
  const r = spawnSync(CC, ['-std=gnu99', '-Wall', '-I', dir, '-fsyntax-only', 'main.c'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.trim(), '', 'no compiler warning');
});

// ---------------------------------------------------------------------------------------------------- XC16
let tmp, P, jobs, xc;
const given = process.env.SILINX_TEST_XC16_CONFIG;
{
  tmp = await scratchEnv('silinx-reactive-pic24-xc16-');
  const cfg = given ? JSON.parse(fs.readFileSync(given, 'utf8')) : {};
  await writeConfig({ mode: 'silinx', ...(given ? { ssh: cfg.ssh, xc16: cfg.xc16 ?? { mode: 'ssh' } } : {}) });
  ({ detectXc16: xc } = await import('../server/xc16-compile.js'));
}
const real = await xc();
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const NO_XC16 = !real.available && `no XC16 here (${real.reason})`;

test('#5552 XC16: each drawing with the node\'s main.c compiled with no warning, its .hex run on silinx-pic24: each tick of Timer1 its outputs the model\'s', { skip: NO_XC16, timeout: 600000 }, async () => {
  P = await import('../server/projects.js');
  jobs = await import('../server/jobs.js');
  const { startFirmwareCompile } = await import('../server/avr-compile.js');
  const tick = TICK_MS * 1e9;   // (ps)
  for (const [k, m] of MODELS().entries()) {
    const g = generatePic24Unit(m);
    const name = `rp${k}`;
    await P.createProject({ name, template: 'uart-fpga-pic24' });
    // (the node's main.c the test's: not one made from drawings, which the compile would make again)
    await P.writeFile(name, `pic/${g.filename}`, g.code);
    await P.writeFile(name, 'pic/main.c', pic24Main('pic', [{ module: m.name, file: g.filename }], { mark: 'its test\'s harness' }));
    const j = await waitJob(jobs, (await startFirmwareCompile(name, { node: 'pic' })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines.filter((l) => /^(ERROR|WARNING)/.test(l)), [], `${m.name}: no warning`);
    const node = new Pic24Node({ hex: fs.readFileSync(path.join(P.projectDir(name), 'pic/lcd_uart.hex'), 'utf8') });
    assert.equal(node.fcy, PIC24_FCY, 'its instruction clock the one main.c counts on');
    const vectors = randomVectors(m.inputs, 40, 61 + k), rows = [];
    for (let t = 0; t < vectors.length; t++) {
      for (const i of m.inputs) g.pins[i.name].forEach((p, b) => node.setInput(p, Number((BigInt(vectors[t][i.name]) >> BigInt(b)) & 1n)));
      node.run((t + 1.5) * tick);
      rows.push(rowOf(m, g.pins, (p) => node.device.ports.driven(p) ?? 0));
    }
    assert.deepEqual(rows, runModel(m, vectors), m.name);
    assert.deepEqual(node.messages().filter((x) => x.kind !== 'info'), [], `${m.name}: the emulator said nothing`);
  }
});
