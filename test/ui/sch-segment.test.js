// UI (#688): dragging one segment of a schematic wire moves only that segment, a vertical one left or
// right, a horizontal one up or down; its neighbours stretch, the others stay; an end segment's
// connection to a pin stays put (a short segment added); the net name on the segment goes with it; the
// nets and the generated HDL do not change; a part dragged still drags its wires' ends.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });

uiTest('#688 schematic: a wire segment dragged moves alone, its neighbours stretch, its end stays on the pin; the HDL the same', E, async (page) => {
  // U1 at (80, 90): I (80, 100), O (160, 100); W2 from U1.O to the marker y, the net name y on its vertical
  const doc = newDoc('seg', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 80, y: 90, rot: 0, mirror: false, name: 'U1', params: { width: 1 } });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(250, 100), P(250, 300), P(400, 300)] });
  doc.labels.push({ id: 'L1', x: 250, y: 200, net: 'y' });
  await makeProject(env, { name: 'SegPj', files: { 'src/seg.sch.json': JSON.stringify(doc) } });
  await page.openProject('SegPj');
  await page.eval(() => window.SilinxApp.openSch('src/seg.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const w2 = async () => (await getDoc()).wires.find((w) => w.id === 'W2').points.map((p) => [p.x, p.y]);
  const hdl0 = generateHdl(doc, { lang: 'vhdl' }).code;
  const same = async (what) => {
    const d = await getDoc();
    const nl = netlist(d);
    assert.deepEqual(nl.diagnostics.map((x) => x.message), [], `${what}: no warnings`);
    assert.equal(generateHdl(d, { lang: 'vhdl' }).code, hdl0, `${what}: the same HDL`);
  };
  const keep = await page.eval((ed) => [...document.querySelectorAll(`${ed} input[type=checkbox]`)].find((x) => x.parentElement.textContent.includes('Keep connections')).checked, ED);
  assert.equal(keep, true, 'Keep connections (the default)');

  // the vertical segment dragged 40 to the right (and 30 down: a vertical one moves only sideways)
  await page.drag(await at(250, 260), await at(290, 290));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W2').points[1].x === 290, [], { what: 'the segment moved' });
  assert.deepEqual(await w2(), [[160, 100], [290, 100], [290, 300], [400, 300]]);
  assert.deepEqual((await getDoc()).labels.map((l) => [l.x, l.y]), [[290, 200]], 'the net name went with it');
  assert.deepEqual((await getDoc()).wires.find((w) => w.id === 'W1').points, [P(60, 100), P(80, 100)], 'the other wire stays');
  await same('a middle segment');

  // the first segment (from U1.O) dragged up 40: its end stays on the pin, a short segment joins them
  await page.drag(await at(220, 100), await at(220, 60));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W2').points.length === 5, [], { what: 'the end segment moved' });
  assert.deepEqual(await w2(), [[160, 100], [160, 60], [290, 60], [290, 300], [400, 300]]);
  await same('an end segment');

  // undone: back as it was before
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W2').points.length === 4, [], { what: 'undone' });
  assert.deepEqual(await w2(), [[160, 100], [290, 100], [290, 300], [400, 300]]);

  // the part dragged down 40: its wires' ends go with its pins
  await page.drag(await at(130, 100), await at(130, 140));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].y === 130, [], { what: 'the part moved' });
  const d = await getDoc();
  assert.deepEqual(d.wires.find((w) => w.id === 'W2').points[0], P(160, 140), 'W2 still starts on U1.O');
  assert.deepEqual(d.wires.find((w) => w.id === 'W1').points.at(-1), P(80, 140), 'W1 still ends on U1.I');
  await same('the part moved');
});

// #4920: a segment dragged onto the wire it continues (two wires meeting end to end): no stub left. W1 from the marker
// in1 to (340, 180); W3 from there down and right to U1's input; W3's vertical segment dragged 60 to the left, onto
// W1's corner: the two wires meet there, nothing drawn twice (no dangling stub), the HDL the same; Undo, Redo
uiTest('#4920 schematic: a segment dragged onto the wire it continues leaves no stub; the HDL the same; Undo, Redo', E, async (page) => {
  const doc = newDoc('stub', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 500, y: 330, rot: 0, mirror: false, name: 'U1', params: { width: 1 } });
  doc.ports.push({ id: 'P1', name: 'in1', dir: 'in', width: 1, x: 210, y: 120 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 620, y: 340 });
  doc.wires.push({ id: 'W1', points: [P(210, 120), P(280, 120), P(280, 180), P(340, 180)] },
    { id: 'W3', points: [P(340, 180), P(340, 340), P(500, 340)] }, { id: 'W4', points: [P(580, 340), P(620, 340)] });
  await makeProject(env, { name: 'StubPj', files: { 'src/stub.sch.json': JSON.stringify(doc) } });
  await page.openProject('StubPj');
  await page.eval(() => window.SilinxApp.openSch('src/stub.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const wires = async () => Object.fromEntries((await getDoc()).wires.map((w) => [w.id, w.points.map((p) => `${p.x},${p.y}`).join(' ')]));
  const hdl0 = generateHdl(doc, { lang: 'vhdl' }).code;
  const before = { W1: '210,120 280,120 280,180 340,180', W3: '340,180 340,340 500,340', W4: '580,340 620,340' };
  assert.deepEqual(await wires(), before);

  await page.drag(await at(340, 260), await at(280, 260));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points[0].x === 280, [], { what: 'the segment moved' });
  const after = { W1: '210,120 280,120 280,180', W3: '280,180 280,340 500,340', W4: '580,340 620,340' };
  assert.deepEqual(await wires(), after, 'no stub: W3 starts where W1 now ends');
  const d = await getDoc();
  assert.deepEqual(netlist(d).diagnostics.map((x) => x.message), [], 'no warnings');
  assert.equal(generateHdl(d, { lang: 'vhdl' }).code, hdl0, 'the same HDL');
  // nothing drawn on (300, 180), where the stub was
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg [data-kind=wire]`)].length, ED), 3);

  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points[0].x === 340, [], { what: 'undone' });
  assert.deepEqual(await wires(), before);
  await page.menu('Edit', 'Redo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W3').points[0].x === 280, [], { what: 'redone' });
  assert.deepEqual(await wires(), after);
});
