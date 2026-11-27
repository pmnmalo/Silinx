// UI: a drawing's HDL file checked against its drawing (#5872, web/js/drawing-check.js): a state diagram replaced in the
// project's folder with another port, while the project is open (the local server's watcher): its HDL made again, its
// module's ports with it, said; its HDL file edited by hand: kept in a version, made again from the drawing, a warning
// (in Portuguese too); edited while the project was closed: the same as it is opened; before Check Syntax. With the
// project open (Pedro's live case): the state diagram open in its editor replaced on disk, the editor and the HDL follow;
// its editor with changes not saved, the user asked (Keep the Editor's: its drawing and HDL; Load from Disk: the
// disk's); a drawing with errors written, said, its HDL left; an HDL file saved as an editor saves (a temporary file
// renamed over it) and a burst of writes (a git checkout's: the drawing, then its HDL) checked once, on the last state.
// Both interfaces; the warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env, P;
before(async () => {
  env = await setupUi();
  // (another process's writes: the MCP server's own functions, on the server's workspace)
  process.env.SILINX_WORKSPACE = env.server.workspace;
  P = await import('../../server/projects.js');
});
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const versions = async (name) => (await import('../../server/versions.js')).serverVersions(P).list(name);
const EDITED = (n) => `WARNING: src/lamps.vhd was changed outside Silinx: made again from src/lamps.bool.json, the drawing being its source; the changed file is kept in version ${n} ("src/lamps.vhd changed outside Silinx").`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

uiTest('#5872 a state diagram replaced on disk with another port: its HDL made again, the module\'s ports with it; its HDL edited by hand: kept in a version, made again, a warning', E, async (page) => {
  await makeProject(env, { name: 'CheckPj', template: 'traffic' });
  await page.openProject('CheckPj');
  const lamps = await P.readFile('CheckPj', 'src/lamps.vhd');
  // the drawing replaced (another process's write): an input more
  const fsm = JSON.parse(await P.readFile('CheckPj', 'src/traffic.fsm.json'));
  fsm.inputs.push({ name: 'hold', width: 1 });
  fsm.transitions.find((t) => t.id === 't3').cond = 'done && !hold';
  await P.writeFile('CheckPj', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  await page.waitConsole(/src\/traffic\.vhd updated from src\/traffic\.fsm\.json \(the drawing was changed outside Silinx\)/);
  await page.waitFor(() => window.SilinxApp.S.modules.find((m) => m.name === 'traffic')?.portList?.some((p) => p.name === 'hold'), [], { what: 'the module\'s new port' });
  assert.match(await P.readFile('CheckPj', 'src/traffic.vhd'), /hold\s+: in\s+std_logic;/);
  // its HDL edited by hand: the drawing wins, the edit kept in a version
  await P.writeFile('CheckPj', 'src/lamps.vhd', lamps.replace('library', '-- my fix\nlibrary'));
  await page.waitConsole(new RegExp(esc(EDITED(1))));
  assert.equal(await P.readFile('CheckPj', 'src/lamps.vhd'), lamps);
  assert.deepEqual((await versions('CheckPj')).map((v) => [v.reason, v.label]), [['before-regenerate', 'src/lamps.vhd changed outside Silinx']]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await P.writeFile('CheckPj', 'src/lamps.vhd', lamps.replace('library', '-- outra\nlibrary'));
    await page.waitConsole(/src\/lamps\.vhd foi alterado fora do Silinx: gerado de novo a partir de src\/lamps\.bool\.json, o desenho sendo a sua fonte; o ficheiro alterado fica guardado na versão 2 \("src\/lamps\.vhd changed outside Silinx"\)\./);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.equal(await P.readFile('CheckPj', 'src/lamps.vhd'), lamps);
  assert.deepEqual(warnings(page).filter((w) => !/changed outside Silinx/.test(w)), []);
});

uiTest('#5872 an HDL file edited while its project was closed: noticed as it is opened; before Check Syntax too', E, async (page) => {
  await makeProject(env, { name: 'ClosedPj', template: 'traffic' });
  const lamps = await P.readFile('ClosedPj', 'src/lamps.vhd');
  await P.writeFile('ClosedPj', 'src/lamps.vhd', lamps.replace('library', '-- closed\nlibrary'));
  await page.openProject('ClosedPj');
  await page.waitConsole(new RegExp(esc(EDITED(1))));
  assert.equal(await P.readFile('ClosedPj', 'src/lamps.vhd'), lamps);
  // (the watcher stopped: a change only Check Syntax sees)
  await page.eval(async () => (await import('/js/project-watch.js')).stopWatching());
  await P.writeFile('ClosedPj', 'src/lamps.vhd', lamps.replace('library', '-- again\nlibrary'));
  await page.eval(async () => (await import('/js/processes.js')).checkSyntax(window.SilinxApp.S.project.top));
  await page.waitConsole(new RegExp(esc(EDITED(2))));
  assert.equal(await P.readFile('ClosedPj', 'src/lamps.vhd'), lamps);
});

const fsmDoc = (page, model, dirty) => page.eval((m, dty) => {
  const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/traffic.fsm.json');
  if (m) { d.fsmEditor.setModel(m); if (dty) { window.SilinxApp.setDirty(d, true, { user: true }); clearTimeout(d._autosave); } }
  return { inputs: d.fsmEditor.getModel().inputs.map((i) => i.name), dirty: !!d.dirty };
}, model, dirty);
const withInput = (fsm, name) => ({ ...fsm, inputs: [...fsm.inputs, { name, width: 1 }] });

uiTest('#5872 live: the state diagram open in its editor replaced on disk: its editor, its HDL and the Design pane follow; with changes not saved, the user chooses', E, async (page) => {
  await makeProject(env, { name: 'LivePj', template: 'traffic' });
  await page.openProject('LivePj');
  await page.eval(() => window.SilinxApp.openFile('src/traffic.fsm.json'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/traffic.fsm.json')?.fsmEditor, [], { what: 'its editor' });
  const fsm = JSON.parse(await P.readFile('LivePj', 'src/traffic.fsm.json'));
  // not changed in the editor: reloaded, its HDL made again
  await P.writeFile('LivePj', 'src/traffic.fsm.json', JSON.stringify(withInput(fsm, 'hold'), null, 2));
  await page.waitConsole(/src\/traffic\.fsm\.json reloaded: changed outside Silinx\./);
  await page.waitConsole(/src\/traffic\.vhd updated from src\/traffic\.fsm\.json \(the drawing was changed outside Silinx\)/);
  assert.deepEqual((await fsmDoc(page)).inputs, ['req', 'done', 'night', 'hold']);
  await page.waitFor(() => window.SilinxApp.S.modules.find((m) => m.name === 'traffic')?.portList?.some((p) => p.name === 'hold'), [], { what: 'the module\'s new port' });
  // changed in the editor, not saved, and on disk: asked; Load from Disk: the disk's drawing and its HDL
  assert.equal((await fsmDoc(page, withInput(fsm, 'mine1'), true)).dirty, true);
  await P.writeFile('LivePj', 'src/traffic.fsm.json', JSON.stringify(withInput(fsm, 'disk1'), null, 2));
  assert.equal(await page.waitDialog('File Changed on Disk'), 'File Changed on Disk');
  await page.dialogButton('Load from Disk');
  await page.waitNoDialog();
  await page.waitConsole(/src\/traffic\.vhd updated from src\/traffic\.fsm\.json \(the drawing was changed outside Silinx\)[\s\S]*src\/traffic\.vhd updated from src\/traffic\.fsm\.json \(the drawing was changed outside Silinx\)/);
  await page.waitFor(async () => /\bdisk1\b/.test(await (await fetch(`/api/projects/LivePj/file?path=${encodeURIComponent('src/traffic.vhd')}`)).text()), [], { what: 'the disk\'s HDL' });
  assert.deepEqual(await fsmDoc(page), { inputs: ['req', 'done', 'night', 'disk1'], dirty: false });
  // again; Keep the Editor's: its drawing written over the disk's, the HDL its
  await fsmDoc(page, withInput(fsm, 'mine2'), true);
  await P.writeFile('LivePj', 'src/traffic.fsm.json', JSON.stringify(withInput(fsm, 'disk2'), null, 2));
  await page.waitDialog('File Changed on Disk');
  await page.dialogButton('Keep the Editor\'s');
  await page.waitNoDialog();
  await page.waitConsole(/src\/traffic\.fsm\.json: the editor's version kept, written over the disk's\./);
  await page.waitFor(async () => /\bmine2\b/.test(await (await fetch(`/api/projects/LivePj/file?path=${encodeURIComponent('src/traffic.vhd')}`)).text()), [], { what: 'the editor\'s HDL' });
  assert.deepEqual(JSON.parse(await P.readFile('LivePj', 'src/traffic.fsm.json')).inputs.map((i) => i.name), ['req', 'done', 'night', 'mine2']);
  assert.doesNotMatch(await P.readFile('LivePj', 'src/traffic.vhd'), /\bdisk2\b/);
  assert.deepEqual(await versions('LivePj'), []);
});

uiTest('#5872 live: a drawing with errors written, said once, its HDL left; an HDL file saved by a temporary file renamed over it; a burst of writes checked once', E, async (page) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  await makeProject(env, { name: 'BurstPj', template: 'traffic' });
  await page.openProject('BurstPj');
  const dir = P.projectDir('BurstPj');
  const hdl = await P.readFile('BurstPj', 'src/traffic.vhd');
  const lamps = await P.readFile('BurstPj', 'src/lamps.vhd');
  const fsm = JSON.parse(await P.readFile('BurstPj', 'src/traffic.fsm.json'));
  // a drawing with errors: said, its HDL left as it was
  const bad = { ...fsm, transitions: fsm.transitions.map((t, i) => (i ? t : { ...t, to: 's99' })) };
  fs.writeFileSync(path.join(dir, 'src/traffic.fsm.json'), JSON.stringify(bad, null, 2));
  await page.waitConsole(/WARNING: src\/traffic\.vhd not updated: src\/traffic\.fsm\.json has errors: A transition starts or ends at a state that does not exist/);
  assert.equal(await P.readFile('BurstPj', 'src/traffic.vhd'), hdl);
  fs.writeFileSync(path.join(dir, 'src/traffic.fsm.json'), JSON.stringify(fsm, null, 2));
  await page.waitConsole(/Changed outside Silinx: src\/traffic\.fsm\.json\.[\s\S]*Changed outside Silinx: src\/traffic\.fsm\.json\./);
  // an editor's save: a temporary file written, then renamed over the HDL file
  fs.writeFileSync(path.join(dir, 'src/.lamps.vhd.tmp'), lamps.replace('library', '-- by an editor\nlibrary'));
  fs.renameSync(path.join(dir, 'src/.lamps.vhd.tmp'), path.join(dir, 'src/lamps.vhd'));
  await page.waitConsole(new RegExp(esc(EDITED(1))));
  await page.waitFor(async (t) => (await (await fetch(`/api/projects/BurstPj/file?path=${encodeURIComponent('src/lamps.vhd')}`)).text()) === t, [lamps], { what: 'made again' });
  // a git checkout's burst: the drawing (a new port), then its HDL as the commit has it, 200 ms apart: checked once on the
  // last state, the HDL the commit's (its line the drawing's), nothing made again nor kept
  const next = withInput(fsm, 'hold');
  const { stampHdl, drawingHash } = await import('../../core/hdl-cache.js');
  const { viewHdl } = await import('../../core/view-hdl.js');
  const committed = await stampHdl(viewHdl('src/traffic.fsm.json', JSON.stringify(next), { linked: () => false }).text, await drawingHash(next), 'vhdl');
  const before = (await page.eval(() => window.__console())).match(/changed outside Silinx/g)?.length ?? 0;
  fs.writeFileSync(path.join(dir, 'src/traffic.fsm.json'), JSON.stringify(next, null, 2));
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(dir, 'src/traffic.vhd'), committed);
  await page.waitConsole(/Changed outside Silinx: [^\n]*src\/traffic\.vhd/);
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal(await P.readFile('BurstPj', 'src/traffic.vhd'), committed);
  assert.equal((await page.eval(() => window.__console())).match(/changed outside Silinx/g)?.length ?? 0, before, 'nothing made again nor kept');
  assert.deepEqual((await versions('BurstPj')).length, 1);
});

uiTest('#5872 its symbol: a state diagram replaced on disk with another port: its symbol put in step and a schematic\'s instance of it flagged, said (in Portuguese too)', E, async (page) => {
  const { handle } = await import('../../server/mcp.js');
  let n = 0;
  const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } })).result; assert.equal(r.isError, false, r.content[0].text); };
  await makeProject(env, { name: 'SymPj', template: 'traffic' });
  await call('edit_symbol', { project: 'SymPj', module: 'traffic', pins: [{ name: 'phase', side: 'N' }] });
  await call('new_source', { project: 'SymPj', type: 'schematic', name: 'wrap' });
  await call('place_instance', { project: 'SymPj', path: 'src/wrap.sch.json', module: 'traffic', name: 'u1', x: 200, y: 200 });
  await page.openProject('SymPj');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const fsm = JSON.parse(await P.readFile('SymPj', 'src/traffic.fsm.json'));
    fsm.inputs.push({ name: 'hold', width: 1 });
    await P.writeFile('SymPj', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
    await page.waitConsole(/src\/traffic\.sym\.json atualizado: as portas de traffic mudaram \(acrescentadas hold\)/);
    await page.waitConsole(/WARNING: src\/wrap\.sch\.json: 1 instância\(s\) de traffic desatualizada\(s\) \(S1\): Atualizar Símbolo/);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.ok(JSON.parse(await P.readFile('SymPj', 'src/traffic.sym.json')).pins.some((q) => q.name === 'hold' && q.side === 'W'));
});
