// Usability (#5148, part 5): the New Source wizards as a student goes through them, one after the other in a new
// project: Project ▸ New Source…, a type, its name, Wizard >, two inputs and an output added on its Inputs and
// Outputs page, its own pages with what they propose (Next > to Finish). Each source made: in the project, the HDL it is
// (or its drawing makes) compiled and elaborated in VHDL with no warnings, its drawing's check exactly (lib/draw-kit.js,
// the circuit's, the schematic's netlist: what is still to draw), and no warning in the console all along. In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from '../ui/harness.js';
import { pickSourceType, addPort } from '../ui/new-source-helpers.js';
import { RUN } from './lib/session.js';
import { drawDiagnostics } from './lib/draw-kit.js';
import { circDiagnostics } from './lib/circ-invariants.js';
import { diagnostics as schDiagnostics } from './lib/sch-invariants.js';
import { viewHdl } from '../../core/view-hdl.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// each type: its wizard's dialog, the file it makes, its kind of drawing (null: HDL), its drawing's check exactly
const TYPES = [
  { type: 'Module (HDL)', wizard: 'Module Wizard', name: 'm_hdl', file: 'src/m_hdl.vhd', kind: null, check: [] },
  // (an empty sheet with its three markers, still to be wired)
  { type: 'Schematic', wizard: 'Schematic Wizard', name: 'm_sch', file: 'src/m_sch.sch.json', kind: 'sch',
    check: ["warning: I/O marker 'a' is not connected", "warning: I/O marker 'b' is not connected", "warning: I/O marker 'y' is not connected"] },
  // (two states and no transition yet: the States and Transitions page left as it proposes)
  { type: 'Finite State Machine (FSM)', wizard: 'FSM Wizard', name: 'm_fsm', file: 'src/m_fsm.fsm.json', kind: 'fsm',
    check: ['warning: State S1 cannot be reached from the initial state S0', 'warning: State S0 has no exit: once there, the machine stays in it until a reset',
      'warning: State S1 has no exit: once there, the machine stays in it until a reset', "warning: Output 'y' is never set: it always keeps its default value 0"] },
  { type: 'Algorithmic State Machine (ASM)', wizard: 'ASM Wizard', name: 'm_asm', file: 'src/m_asm.asm.json', kind: 'asm', check: [] },
  { type: 'Boolean Algebra', wizard: 'Boolean Algebra Wizard', name: 'm_tt', file: 'src/m_tt.bool.json', kind: 'tt', check: [] },
  { type: 'Petri Net', wizard: 'Petri Net Wizard', name: 'm_pn', file: 'src/m_pn.pn.json', kind: 'pn', check: [] },
  { type: 'Digital Electronic Circuit', wizard: 'Digital Electronic Circuit Wizard', name: 'm_circ', file: 'src/m_circ.circ.json', kind: 'circ', check: [] },
];

const tr = (page, list) => page.eval(async (l) => { const { t } = await import('/js/i18n.js'); return l.map((x) => t(x)); }, list);
const buttons = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].filter((b) => b.getClientRects().length && !b.disabled).map((b) => b.textContent.trim()));

/** A drawing's check (its kind's), its messages. */
function checkOf(kind, m) {
  if (kind === 'circ') return circDiagnostics(m);
  if (kind === 'sch') return schDiagnostics(m);
  return drawDiagnostics(kind, m);
}

uiTest('usability: wizards: a source of each kind made with its wizard: in the project, its HDL compiled, no warnings', E, async (page) => {
  await makeProject(env, { name: 'UsabWiz', top: '' });
  await page.openProject('UsabWiz');
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  const [menuL, itemL, dialogL, nextL, wizardL, fileL, finishL] = await tr(page, ['Project', 'New Source…', 'New Source', 'Next >', 'Wizard >', 'File Name and Location', 'Finish']);
  for (const T of TYPES) {
    const [typeL, wizL] = await tr(page, [T.type, T.wizard]);
    await page.menu(menuL, itemL);
    await page.waitDialog(dialogL);
    await pickSourceType(page, typeL);
    await page.dialogButton(nextL);
    await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [fileL], { what: `${T.type}: ${fileL}` });
    await page.fill('.dlg-overlay .wiz-main input[type=text]', T.name);
    await page.dialogButton(wizardL);
    await page.waitDialog(wizL);
    // its pages: the ports added where it asks for them, the rest as it proposes, to Finish
    let ported = false;
    for (let k = 0; k < 10; k++) {
      if (!ported && await page.eval(() => !!document.querySelector('.dlg-overlay .mw-add'))) {
        for (const [n, d] of [['a', 'in'], ['b', 'in'], ['y', 'out']]) await addPort(page, n, d);
        ported = true;
      }
      const b = await buttons(page);
      if (b.includes(finishL)) { await page.dialogButton(finishL); break; }
      const h = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3, .dlg-overlay h3')?.textContent);
      await page.dialogButton(nextL);
      await page.waitFor((x) => document.querySelector('.dlg-overlay .wiz-main h3, .dlg-overlay h3')?.textContent !== x || !document.querySelector('.dlg-overlay'), [h], { what: `${T.type}: the next page` });
    }
    await page.waitNoDialog();
    await page.waitFor((f) => window.Silinx.project.files.some((x) => x.path === f) || window.Silinx.project.files.some((x) => x.path.startsWith(f.replace(/\.[^/]*$/, ''))), [T.file], { what: `${T.file} in the project`, timeout: 15000 });
    const text = await readWs(env, 'UsabWiz', T.file);
    // the HDL: the file's, or its drawing's (as the IDE makes it)
    let hdl = text, module = T.name;
    if (T.kind) {
      const m = JSON.parse(text);
      const r = viewHdl(T.file, JSON.stringify({ ...m, lang: 'vhdl', generatedFile: undefined }), { lang: 'vhdl' });
      assert.deepEqual(r.errors, [], `${T.type}: its HDL made`);
      hdl = r.text; module = r.module;
      assert.deepEqual(checkOf(T.kind, m), T.check, `${T.type}: its drawing's check`);
    }
    const lib = compile([{ path: `${module}.vhd`, lang: 'vhdl', text: hdl }]);
    const d = elaborate(lib, module);
    assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity !== 'note').map((x) => `${x.severity}: ${x.message}`), [], `${T.type}: compiled and elaborated, no warnings`);
  }
  // no warning in the console all along
  const lines = (await page.eval(() => document.getElementById('console-log').innerText)).split('\n').filter((l) => /^(WARNING|AVISO|ERROR|ERRO)\b/.test(l.trim()));
  assert.deepEqual(lines, []);
}, { timeout: 300000 });
