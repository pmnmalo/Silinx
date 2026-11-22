// Usability tests (#5148): the kit of a drawing that is not a schematic nor a circuit, for a session (lib/session.js): a
// state diagram (.fsm.json), an ASM chart (.asm.json), a truth table (.bool.json, .tt.json), a Petri net (.pn.json). Its
// checks: its editor's Check (Check State Diagram, Validate, Check Petri Net: core's validateFsm, validate, checkPetri),
// its errors an invariant; the HDL it makes (core/view-hdl.js viewHdl, as the IDE makes it) in VHDL and Verilog,
// compiled and elaborated. Its actions: the base every editor shares (opened, its model read, Edit ▸ Undo / Redo, its
// Check's console lines), to which each scenario adds its own clicks and drags.
import { validateFsm } from '../../../core/fsm.js';
import { validate as validateAsm } from '../../../core/asm.js';
import { checkPetri } from '../../../core/petri-analysis.js';
import { viewHdl } from '../../../core/view-hdl.js';
import { compile, elaborate } from '../../../core/compile.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each kind: its file's extension, its editor (Silinx.active's), its root's selector, its Check button's label, its
 *  check (core's). */
export const KINDS = {
  fsm: { ext: 'fsm.json', editor: 'fsmEditor', root: '.fsm-editor', check: 'Check', diags: (m) => validateFsm(m) },
  asm: { ext: 'asm.json', editor: 'asmEditor', root: '.asm-editor:not(.fsm-editor):not(.petri-editor)', check: 'Validate', diags: (m) => validateAsm(m) },
  tt: { ext: 'bool.json', editor: 'ttEditor', root: '.tt-editor', check: null, diags: () => [] },
  pn: { ext: 'pn.json', editor: 'petriEditor', root: '.petri-editor', check: 'Check', diags: (m) => checkPetri(m) },
};

/** A drawing's Check: its messages ('warning: …', 'error: …'). */
export function drawDiagnostics(kind, m) {
  return KINDS[kind].diags(m).filter((d) => d.severity === 'error' || d.severity === 'warning').map((d) => `${d.severity}: ${d.message}`);
}

/** The HDL the drawing makes, in VHDL and in Verilog, compiled and elaborated: the errors ([] when none). */
export function drawHdlErrors(kind, m) {
  const out = [];
  for (const lang of ['vhdl', 'verilog']) {
    const r = viewHdl(`src/${m.name || 'drawing'}.${KINDS[kind].ext}`, JSON.stringify({ ...m, lang, generatedFile: undefined }), { lang });
    for (const e of r.errors) out.push(`${lang}: made: ${e}`);
    if (r.errors.length || !r.text) continue;
    const lib = compile([{ path: `${r.module}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: r.text }]);
    const errs = lib.errors.filter((x) => x.severity === 'error');
    for (const e of errs) out.push(`${lang}: compile: ${e.message}`);
    if (errs.length) continue;
    for (const e of elaborate(lib, r.module).diags.filter((x) => x.severity === 'error')) out.push(`${lang}: elaborate: ${e.message}`);
  }
  return out;
}

/** The actions every one of these editors shares; a scenario adds its own (`ed`: the root's selector, `t`: a label in
 *  the page's language). */
export function drawActions(kind) {
  const K = KINDS[kind];
  const ED = `.doc:not([hidden]) ${K.root}`;
  return (page) => {
    const t = (s) => page.eval(async (x) => (await import('/js/i18n.js')).t(x), s);
    const menu = async (m, item) => page.menu(await t(m), await t(item));
    return {
      page, ed: ED, t,
      getDoc: () => page.eval((e) => window.Silinx.active[e].getModel(), K.editor),
      async open(file) {
        await page.eval((f) => window.SilinxApp.openFile(f), file);
        await page.waitFor((e) => window.Silinx.active?.[e], [K.editor], { what: `the ${kind} editor` });
        await sleep(200);
      },
      undo: () => menu('Edit', 'Undo'),
      redo: () => menu('Edit', 'Redo'),
      /** Its Check (Validate): the console's text it adds. */
      async check() {
        const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
        await page.click(`${ED} button`, { text: await t(K.check) });
        await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
        await sleep(300);
        return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
      },
    };
  };
}

/** The kit of a kind of drawing for a session; `more(page, base)` adds the scenario's own actions to the base ones. */
export function drawKit(kind, more = () => ({})) {
  const base = drawActions(kind);
  return {
    actions: (page) => { const b = base(page); return Object.assign(b, more(page, b)); },
    invariants: (m) => { const e = drawDiagnostics(kind, m).filter((x) => x.startsWith('error')); return e.length ? { errors: e } : {}; },
    hdlErrors: (m) => drawHdlErrors(kind, m),
    detached: () => [],
    dangling: () => [],
  };
}
