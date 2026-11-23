// Usability (#5206, phase 5): a design's pins given as a person gives them, in I/O Pin Planning, on the stopwatch
// example (examples/stopwatch: a clock, buses of buttons, LEDs, segments and digits) with the Silinx toolchain: its
// pins cleared (Clear All), then each port dragged from the Ports panel of the Board view onto the board (the switch,
// the buttons, the LEDs, the digits) or onto a row of Board Resources (the clock: its period with it; the decimal
// point); Undo to the start and Redo to the end; a pin typed in the table that another bit has (the clash: both rows
// marked, the console's warning when it is saved), Process ▸ Implement Top Module refused for it (the constraints'
// error, exactly), the pin typed right, implemented to the bitstream with no warning. After every step: the table's
// status line counts the bits with a pin, a pin given twice marked on both rows, the console's lines exactly; at the
// end the UCF on disk gives every bit the pin and the clock the period of the example's own UCF. In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, ROOT } from '../ui/harness.js';
import { Session, RUN } from './lib/session.js';
import { PIN_KIT, FLOW, ucfPins } from './lib/pin-actions.js';
import { consoleCount, consoleLines } from './lib/project-actions.js';
import { tr } from './lib/hdl-actions.js';
import { sameLines } from './lib/hier-kit.js';

const FILE = 'test/usability/constraints.test.js';
let env;
before(async () => { env = await setupUi(); await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' }); });
after(async () => { await env?.server?.api('PUT', '/api/toolchain', { mode: 'local' }).catch(() => {}); await env?.teardown?.(); });
const E = () => env;
// (I/O Pin Planning's lines are written in English in every language, as the processes' are: pinplanner-board's UI test)
const asIs = (l) => new RegExp(`^${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const same = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
// (the example's own pins: the reference)
const EXAMPLE = ucfPins(fs.readFileSync(path.join(ROOT, 'examples/stopwatch/constraints/top.ucf'), 'utf8'));
const NETS = Object.keys(EXAMPLE.pins).length;
const bus = (port, res, n, from = 0) => Array.from({ length: n }, (_, i) => `${port}<${i}> → ${res}<${from + i}>`).join(', ');
// (the Check Syntax the implementation runs first)
const CHECKED = ['Started : "Check Syntax".', ...['debounce', 'to_decimal', 'sevenseg', 'stopwatch'].map((f) => `Parsing VHDL file "src/${f}.vhd" into library work`),
  'Elaborating top module <stopwatch>: 52 signals, 23 processes.', 'Process "Check Syntax" completed successfully'];
// the drags: the port, where it is dropped, the console's line
const DRAGS = [
  ['clk', '.pp-res .res[data-res="mclk"]', 'clk → mclk'],
  ['sw', '[data-part="sw0"]', 'sw<0> → sw<0>'],
  ['btn', '[data-part="btn0"]', bus('btn', 'btn', 4)],
  ['led', '[data-part="led0"]', bus('led', 'led', 8)],
  ['seg', '[data-part="an1"]', bus('seg', 'seg', 7)],
  ['dp', '.pp-res .res[data-res="dp"]', 'dp → dp'],
  ['an', '[data-part="an3"]', bus('an', 'an', 4)],
];

uiTest('usability: constraints: the stopwatch\'s pins given in I/O Pin Planning, a clock and buses dragged onto the board; Undo, Redo; a pin given twice refused by the implementation, corrected, implemented with no warning', E, async (page) => {
  await makeProject(env, { name: 'UsabPins', template: 'stopwatch' });
  await page.setViewport(1440, 1000);
  await page.openProject('UsabPins');
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  const s = new Session(page, env, { file: FILE, title: 'constraints: stopwatch', hdl: false, kit: PIN_KIT });
  const a = s.a;
  // (the console's lines from here on: once the project's opening is done)
  let n = await consoleCount(page);
  for (let k = 0, m = -1; k < 60 && n !== m; k++) { await new Promise((r) => setTimeout(r, 300)); m = n; n = await consoleCount(page); }
  const lines = (want) => async () => { await sameLines(page, n, want); n = await consoleCount(page); };
  // (a check between the steps: its failure the session's report)
  const check = async (where, fn) => { try { await fn(); } catch (e) { await s.fail(where, { expected: [e.message] }); } };
  // the planner: the example's pins in its table
  s.steps.push({ name: 'Tools ▸ I/O Pin Planning', args: {} });
  await a.open(NETS);
  s.docs.push(await s.settled());
  await check('the example\'s pins', async () => { same(s.doc.pins, EXAMPLE.pins, 'the pins'); await lines([])(); });
  // Clear All; the Board view; each port dragged onto the board, what it placed said
  await s.step('Clear All', {}, () => a.clearAll(), { expect: async (d) => { same(Object.values(d.pins).filter(Boolean), [], 'the pins'); await lines([])(); } });
  await a.view('Board');
  for (const [port, target, said] of DRAGS) {
    await s.step('drag', { port, to: target }, () => a.drag(port, target), { expect: lines([asIs(`I/O Pin Planning: ${said}.`)]) });
  }
  await s.step('saved', {}, () => a.saved(), { changes: false });
  await check('the pins dragged', () => { same(s.doc.pins, EXAMPLE.pins, 'the example\'s pins'); same(s.doc.periods, { clk: EXAMPLE.periods.clk.replace(/ ns$/, '') }, 'the clock\'s period'); });
  await s.undoRedo();
  await s.step('saved', {}, () => a.saved(), { changes: false, expect: lines([]) });

  // the clash: dp given led<0>'s pin in the table, both rows marked; said once it is saved
  await a.view('Table');
  const led0 = EXAMPLE.pins['led<0>'];
  await s.step('type a pin', { net: 'dp', loc: led0 }, () => a.typeLoc('dp', led0), { expect: (d) => same(d.conflicts, ['led<0>', 'dp'], 'the pins marked') });
  await s.step('saved', {}, () => a.saved(), { changes: false, expect: lines([asIs(`I/O Pin Planning: pins assigned more than once: ${led0}.`)]) });
  // Implement Top Module refused: the constraints' error, the line of each bit; nothing run after them
  s.steps.push({ name: 'Process ▸ Implement Top Module', args: {} });
  const refused = await a.implement();
  await check('Implement Top Module refused', async () => same(refused, [null, 'err', null, null, null, null], 'the processes'));
  await check('Implement Top Module refused', lines([...CHECKED, `ERROR:ConstraintSystem - "constraints/top.ucf" Line 24: pin ${led0} is already assigned to NET "led<0>" (line 9)`,
    'Process "Check Constraints" failed (1 error(s), 0 warning(s))', 'ERROR: fix the errors in constraints/top.ucf before implementing (see the Errors tab).',
    'Process "Generate Programming File" stopped: the constraints have errors.']));
  // dp's own pin typed; implemented to the bitstream, no warning
  await s.step('type a pin', { net: 'dp', loc: EXAMPLE.pins.dp }, () => a.typeLoc('dp', EXAMPLE.pins.dp), { expect: (d) => same(d.conflicts, [], 'the pins marked') });
  await s.step('saved', {}, () => a.saved(), { changes: false, expect: lines([]) });
  s.steps.push({ name: 'Process ▸ Implement Top Module', args: {} });
  const status = await a.implement();
  const got = await consoleLines(page, n), [done] = await tr(page, ['Process "Generate Programming File" completed successfully']);
  await check('Implement Top Module', () => same([status, got.filter((l) => /^(WARNING|ERROR|AVISO|ERRO)\b/.test(l)), got.at(-1)], [FLOW.map(() => 'ok'), [], done], 'the processes, the warnings, the last line'));
  // the UCF on disk: the example's pins, its clock's period
  const ucf = ucfPins(await readWs(env, 'UsabPins', 'constraints/top.ucf'));
  await check('the UCF', () => same(ucf, EXAMPLE, 'the UCF\'s pins and periods'));
}, { timeout: 420000 });
