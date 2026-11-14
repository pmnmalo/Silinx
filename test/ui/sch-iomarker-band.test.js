// UI: I/O markers added with a rectangle (#4000): the Add I/O Marker tool dragged over an AND gate's and an 8-bit
// inverter's pins puts a marker on each open one, in2, in3, out1 (in1 taken), in4(7:0), out2(7:0), its direction and
// width the pin's; a wire end of no direction skipped; the console's lines (in Portuguese too); one Undo removes them
// all; a click still asks one marker's name.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

// screen position of a sheet point (through the view transform)
const at = (page, x, y) => page.eval((px, py) => {
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + px * +m[3], y: r.top + +m[2] + py * +m[3] };
}, x, y);
const ports = page => page.eval(() => window.Silinx.active.schEditor.getDoc().ports.map(p => `${p.name}:${p.dir}:${p.width}:${p.x},${p.y}`));
const lines = page => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map(l => l.textContent));

uiTest('#4000 schematic: a rectangle of the Add I/O Marker tool adds a marker to every open pin, named in2, out1…; one Undo; in Portuguese', E, async (page) => {
  const doc = newDoc('band', 'vhdl');
  // U1: I0 (200, 110), I1 (200, 130), O (280, 120); U2 (8 bits): I (200, 310), O (280, 310); in1 elsewhere; a wire on nothing
  doc.symbols.push({ id: 'S1', type: 'and2', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: {} },
    { id: 'S2', type: 'inv', x: 200, y: 300, rot: 0, mirror: false, name: 'U2', params: { width: 8 } });
  doc.ports.push({ id: 'P1', name: 'in1', dir: 'in', width: 1, x: 600, y: 600 });
  doc.wires.push({ id: 'W1', points: [{ x: 400, y: 200 }, { x: 400, y: 250 }] });
  await makeProject(env, { name: 'BandPj', files: { 'src/band.sch.json': JSON.stringify(doc) } });
  await page.openProject('BandPj');
  await page.eval(() => window.SilinxApp.openSch('src/band.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  await page.click(`${ED} .se-btn[data-act=io]`);
  const before = (await lines(page)).length;
  await page.drag(await at(page, 150, 60), await at(page, 450, 350));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 6, [], { what: 'the markers added' });
  assert.deepEqual(await ports(page), ['in1:in:1:600,600', 'in2:in:1:200,110', 'in3:in:1:200,130', 'out1:out:1:280,120', 'in4:in:8:200,310', 'out2:out:8:280,310']);
  assert.equal(await page.eval(() => document.querySelector('.se-prompt')), null, 'no name asked');
  await page.waitFor((n) => document.querySelectorAll('#console-log .ln').length >= n + 3, [before], { what: 'the console\'s lines' });
  assert.deepEqual((await lines(page)).slice(before).filter(l => /band\.sch\.json: /.test(l)), ['band.sch.json: 5 I/O markers added: in2, in3, out1, in4(7:0), out2(7:0)',
    'WARNING: band.sch.json: no I/O marker on the wire end at 400, 200: its direction is unknown (no symbol\'s pin on its net)',
    'WARNING: band.sch.json: no I/O marker on the wire end at 400, 250: its direction is unknown (no symbol\'s pin on its net)']);
  // one Undo: all of them gone
  await page.click('#toolbar [data-cmd=undo]');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 1, [], { what: 'undone' });
  assert.deepEqual(await ports(page), ['in1:in:1:600,600']);
  // a click still adds one, its name asked
  await page.click(await at(page, 200, 110));
  await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
  assert.equal(await page.eval(() => document.querySelector('.se-prompt input').value), '');
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.se-prompt'), [], { what: 'prompt closed' });
  // in Portuguese: the console's lines
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    const n = (await lines(page)).length;
    await page.drag(await at(page, 150, 60), await at(page, 300, 150));
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 4, [], { what: 'the markers added' });
    await page.waitFor((k) => document.querySelectorAll('#console-log .ln').length > k, [n], { what: 'the console\'s line' });
    assert.deepEqual((await lines(page)).slice(n).filter(l => /band\.sch\.json: /.test(l)), ['band.sch.json: 3 marcadores de E/S adicionados: in2, in3, out1']);
    const k = (await lines(page)).length;
    await page.drag(await at(page, 380, 180), await at(page, 420, 220));
    await page.waitFor((x) => document.querySelectorAll('#console-log .ln').length >= x + 1, [k], { what: 'the console\'s warning' });
    assert.deepEqual((await lines(page)).slice(k).filter(l => /band\.sch\.json: /.test(l)), ['band.sch.json: Nenhum marcador de E/S adicionado: nenhum pino ou ponta de fio livre aí',
      'WARNING: band.sch.json: nenhum marcador de E/S na ponta de fio em 400, 200: a sua direção é desconhecida (nenhum pino de símbolo na sua rede)']);
    assert.equal((await ports(page)).length, 4, 'nothing added');
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
    await page.key('Escape');
  }
});
