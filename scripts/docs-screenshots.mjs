#!/usr/bin/env node
// The documentation's screenshots (#4499): the app driven through the examples by the UI tests' harness
// (test/ui/harness.js: the local server on a temporary workspace, configuration directory and HOME, so no user's
// name, path or host is ever in a picture), at a fixed size, in the light theme, each written to docs/images/ as
// WebP. Run again, it makes them again from the code as it is.
//
//   node scripts/docs-screenshots.mjs                 every shot
//   node scripts/docs-screenshots.mjs hero gates      the shots named (their names: --list)
//
// SHOTS is the list: a shot's `ui` gives the interfaces it is made in (silinx, ise: the ISE style one's file ends in
// -ise), `lang` its languages (en, pt: the Portuguese one's ends in -pt).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { setupUi, makeProject, tick, ROOT } from '../test/ui/harness.js';

const OUT = path.join(ROOT, 'docs', 'images');
const SIZE = { width: 1280, height: 800 };
const QUALITY = 82;
const sleep = tick;

/** A project made from an example, opened, its board (an id of core's boards) changed when given. */
async function example(page, env, name, example, { board } = {}) {
  // (made again for each interface and language: the one before removed)
  await env.server.api('DELETE', `/api/projects/${encodeURIComponent(name)}`).catch(() => {});
  // (the board's device given at the creation: the example's constraints made again in its family's format, #3142)
  const device = board ? (await env.server.api('GET', '/api/devices')).boards.find((b) => b.id === board).device : undefined;
  await makeProject(env, { name, template: example, ...(board ? { board, device } : {}) });
  await page.openProject(name);
}
/** A file opened in its editor, and its document shown. */
async function open(page, file) {
  await page.eval((f) => window.SilinxApp.openFile(f), file);
  await page.waitFor((f) => window.Silinx.active?.path === f || window.Silinx.active?.id?.endsWith(f), [file], { what: `${file} open` });
  // (the Silinx interface's messages folded: empty, they would take a fifth of the picture)
  await panels(page, { console: false });
  await sleep(600);
}

/** The console emptied: the start-up lines name this computer's tools (ISE not found, the programmers). */
const clearConsole = (page) => page.eval(() => document.getElementById('console-clear').click());
/** A task of the Silinx interface (edit, sim, emu, impl); none in the ISE style one. */
async function task(page, id) {
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) {
    await page.click(`#task-switch .task-btn[data-task="${id}"]`);
    await page.waitFor((t) => document.documentElement.dataset.task === t, [id], { what: `task ${id}` });
  }
}
/** The Silinx interface's side panel or messages folded (`side`, `console`: false folds it), as its buttons do. */
async function panels(page, { side = true, console = true } = {}) {
  for (const [act, want] of [['side', side], ['console', console]]) {
    const open = await page.eval((a) => document.documentElement.dataset.layout === 'tasks' && document.documentElement.dataset[a] === 'open', act);
    if (open && !want) { await page.click(`#task-view [data-act=${act}]`); await sleep(300); }
  }
}
/** The Board Emulator of the project's top (its RTL model), running, its switches set as `on` says. */
async function emulate(page, lang = 'en') {
  await page.menu(lang === 'pt' ? 'Ferramentas' : 'Tools', lang === 'pt' ? 'Emulador da Placa' : 'Board Emulator');
  await page.waitFor(() => window.SilinxApp.findDoc('emulator')?.view?.outputs, [], { what: 'the emulator running', timeout: 60000 });
  await sleep(2500);
  await panels(page, { side: false, console: false });
  await foldProps(page);
}
/** The active document's side panels folded (their ‹ › buttons: Properties, a circuit's Parts), the drawing given
 *  the room and fitted to it again. */
async function foldProps(page, { all = false } = {}) {
  await page.eval((a) => { for (const b of document.querySelectorAll(`.doc:not([hidden]) .asm-fold${a ? '' : '[data-fold=props]'}`)) b.click(); }, all);
  await sleep(300);
  await page.eval(() => dispatchEvent(new Event('resize')));
  await sleep(800);
}
/** A process's label in the Processes panel, by its status id, in each language. */
const PROCESS = { bitgen: { en: 'Generate Programming File', pt: 'Gerar Ficheiro de Programação' }, impl: { en: 'Implement Design', pt: 'Implementar Projeto' } };
/** A process of the Processes panel run (the Silinx toolchain's), to its end (its status ok or warn). */
async function runProcess(page, id, lang = 'en') {
  await task(page, 'impl');
  await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
  await page.treeRow('#procs', PROCESS[id][lang], { dbl: true, exact: true });
  const status = await page.waitFor((i) => ['ok', 'warn', 'error'].includes(window.SilinxApp.S.status?.[i]) && window.SilinxApp.S.status[i],
    [id], { what: `${PROCESS[id].en} done`, timeout: +process.env.SILINX_DOCS_TIMEOUT || 300000 });
  if (status === 'error') throw new Error(`${PROCESS[id].en} failed: ${(await page.consoleText()).slice(-1500)}`);
}

export const SHOTS = [
  {
    name: 'hero', ui: ['silinx', 'ise'], lang: ['en', 'pt'],
    about: 'The IDE: the traffic example\'s state diagram, its Design pane',
    async run(page, env) {
      await example(page, env, 'traffic', 'traffic');
      await open(page, 'src/traffic.fsm.json');
    },
  },
  {
    name: 'new-project', lang: ['en', 'pt'],
    about: 'New Project: its examples to start from',
    async run(page) {
      await page.eval(() => [...document.querySelectorAll('button')].find((b) => /^(New Project|Novo Projeto)…$/.test(b.textContent.trim()) && b.getClientRects().length).click());
      await page.waitDialog(null);
      // a name, and an example to start from
      await page.eval(() => {
        const d = [...document.querySelectorAll('.dlg-overlay')].pop();
        const name = d.querySelector('input[type=text], input:not([type])');
        name.value = 'my-traffic-light'; name.dispatchEvent(new Event('input', { bubbles: true }));
        const from = [...d.querySelectorAll('select')].find((s) => [...s.options].some((o) => /traffic/.test(o.textContent)));
        from.value = [...from.options].find((o) => /traffic/.test(o.textContent)).value; from.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(800);
    },
  },
  {
    name: 'hdl',
    about: 'The HDL editor: the stopwatch example\'s VHDL',
    async run(page, env) {
      await example(page, env, 'stopwatch', 'stopwatch');
      await open(page, 'src/stopwatch.vhd');
    },
  },
  {
    name: 'schematic',
    about: 'The schematic editor: the gates example',
    async run(page, env) {
      await example(page, env, 'gates', 'gates');
      await open(page, 'src/gates.sch.json');
    },
  },
  {
    name: 'asm',
    about: 'An ASM chart: the blinky example\'s speed control',
    async run(page, env) {
      await example(page, env, 'blinky', 'blinky');
      await open(page, 'src/speed_ctrl.asm.json');
    },
  },
  {
    name: 'algebra', lang: ['en', 'pt'],
    about: 'Boolean algebra, a truth table: the traffic example\'s lamps',
    async run(page, env) {
      await example(page, env, 'traffic', 'traffic');
      await open(page, 'src/lamps.bool.json');
      await panels(page, { console: false });
    },
  },
  {
    name: 'circuit',
    about: 'A digital circuit on a breadboard: the breadboard example',
    async run(page, env) {
      await example(page, env, 'breadboard', 'breadboard');
      await open(page, 'src/breadboard.circ.json');
      await panels(page, { side: false, console: false });
      await foldProps(page, { all: true });
    },
  },
  {
    name: 'simulation', lang: ['en', 'pt'],
    about: 'The waveforms of a simulation: the traffic example\'s test bench',
    async run(page, env) {
      await example(page, env, 'traffic', 'traffic');
      await task(page, 'sim');
      await page.eval(() => window.SilinxApp.runSimulation('tb_traffic'));
      await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_traffic' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'the simulation run', timeout: 60000 });
      await panels(page, { console: false });
      await page.eval(() => window.Silinx.active.view.state && document.querySelector('.doc:not([hidden]) canvas')?.focus());
      await page.key('f');
      await sleep(800);
    },
  },
  {
    name: 'emulator-basys2', lang: ['en', 'pt'],
    about: 'The Board Emulator: the stopwatch example on a Basys2',
    async run(page, env, { lang }) {
      await example(page, env, 'stopwatch', 'stopwatch');
      await task(page, 'emu');
      await emulate(page, lang);
    },
  },
  {
    name: 'emulator-nexys3',
    about: 'The Board Emulator: the vga example on a Nexys3, its VGA monitor',
    async run(page, env, { lang }) {
      await example(page, env, 'vga', 'vga', { board: 'nexys3' });
      await task(page, 'emu');
      await emulate(page, lang);
    },
  },
  {
    name: 'emulator-icebreaker',
    about: 'The Board Emulator: the clock example on an iCEBreaker',
    async run(page, env, { lang }) {
      await example(page, env, 'clock', 'clock', { board: 'icebreaker' });
      await task(page, 'emu');
      await emulate(page, lang);
    },
  },
  {
    name: 'emulator-basys3',
    about: 'The Board Emulator: the clock example on a Basys 3 (7-series)',
    async run(page, env, { lang }) {
      await example(page, env, 'clock', 'clock', { board: 'basys3' });
      await task(page, 'emu');
      await emulate(page, lang);
    },
  },
  {
    name: 'implement-nexys2', lang: ['en', 'pt'],
    about: 'Implementation with the Silinx toolchain: blinky on a Nexys2, its Design Summary',
    async run(page, env, { lang }) {
      await example(page, env, 'blinky', 'blinky', { board: 'nexys2' });
      await runProcess(page, 'bitgen', lang);
      await page.eval(() => window.SilinxApp.openSummary());
      await panels(page, { console: false });
      await sleep(1000);
    },
  },
  {
    name: 'implement-icebreaker',
    about: 'Implementation with the Silinx toolchain: blinky on an iCEBreaker (iCE40), its Design Summary',
    async run(page, env, { lang }) {
      await example(page, env, 'blinky', 'blinky', { board: 'icebreaker' });
      await runProcess(page, 'bitgen', lang);
      await page.eval(() => window.SilinxApp.openSummary());
      await panels(page, { console: false });
      await sleep(1000);
    },
  },
  {
    name: 'fpga-view',
    about: 'The implemented design inside the chip: blinky on a Basys2',
    async run(page, env, { lang }) {
      await example(page, env, 'blinky', 'blinky');
      await runProcess(page, 'impl', lang);
      await page.menu(lang === 'pt' ? 'Ferramentas' : 'Tools', lang === 'pt' ? 'Projeto Implementado (Vista da FPGA)' : 'Implemented Design (FPGA View)');
      await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view', timeout: 60000 });
      await panels(page, { console: false });
      await sleep(1500);
    },
  },
];

/** A shot's file in docs/images/ for an interface and a language. */
export const shotFile = (shot, ui, lang) => `${shot.name}${ui === 'ise' ? '-ise' : ''}${lang === 'pt' ? '-pt' : ''}.webp`;
/** Every file the shots make. */
export const shotFiles = (shots = SHOTS) => shots.flatMap((s) => (s.ui || ['silinx']).flatMap((ui) => (s.lang || ['en']).map((l) => shotFile(s, ui, l))));
/** The largest a picture may be (bytes): test/docs-images.test.js checks it. */
export const MAX_BYTES = 150 * 1024;

async function shoot(env, shot, ui, lang) {
  const page = await env.newPage(undefined, { ui });
  try {
    await page.setViewport(SIZE.width, SIZE.height);
    // the light theme, the default notation (the tests' is the text one), the language
    await page.eval((l) => { localStorage.setItem('silinx.theme', 'light'); localStorage.setItem('silinx.notation', 'engineering'); localStorage.setItem('silinx.lang', l); }, lang);
    await page.goto(env.server.url);
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot', timeout: 30000 });
    await shot.run(page, env, { ui, lang });
    await clearConsole(page);
    await sleep(400);
    // the temporary workspace shown as the default one, ~/Silinx-projects (the Start page's Where Projects Are Kept)
    await page.eval((ws) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) if (n.nodeValue.includes(ws)) n.nodeValue = n.nodeValue.split(ws).join('~/Silinx-projects');
    }, env.server.workspace);
    const leak = await page.eval(() => { const t = document.body.innerText; return (/(\/var\/folders|\/private\/|\/tmp\/|\/Users\/|\/home\/|[A-Z]:\\Users|silinx-ui-)[^\s]*|[\w.+-]+@[\w-]+\.[\w.]+/.exec(t) || [])[0]; });
    if (leak) throw new Error(`the page shows a path or an address of this computer (${leak}): not shot`);
    const r = await page.send('Page.captureScreenshot', { format: 'webp', quality: QUALITY });
    const file = path.join(OUT, shotFile(shot, ui, lang));
    await fsp.writeFile(file, Buffer.from(r.data, 'base64'));
    const errs = page.errors.filter((e) => !(shot.allowErrors || []).some((re) => re.test(e)));
    if (errs.length) throw new Error(`page errors: ${errs.join(' | ')}`);
    return file;
  } finally { await page.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) { for (const s of SHOTS) console.log(`${s.name.padEnd(16)} ${s.about}`); return; }
  const unknown = args.filter((a) => !SHOTS.some((s) => s.name === a));
  if (unknown.length) throw new Error(`no such shot: ${unknown.join(', ')} (--list)`);
  const shots = args.length ? SHOTS.filter((s) => args.includes(s.name)) : SHOTS;
  await fsp.mkdir(OUT, { recursive: true });
  const env = await setupUi();
  if (env.skip) throw new Error(env.skip);
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  let failed = 0;
  try {
    for (const shot of shots) for (const ui of shot.ui || ['silinx']) for (const lang of shot.lang || ['en']) {
      try {
        const file = await shoot(env, shot, ui, lang);
        console.log(`${path.relative(ROOT, file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
      } catch (e) { failed++; console.error(`${shot.name} (${ui}, ${lang}): ${e.message}`); }
    }
  } finally { await env.teardown(); }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
