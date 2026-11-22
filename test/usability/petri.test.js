// Usability (#5148, part 4): the Petri net editor as a person uses it, on the lock's net (examples/lock, src/alarm.pn.json:
// the failures counted, the third one the alarm): a place and a transition added with their tools, linked by arcs drawn
// node to node, named, a guard and tokens set in Properties; nodes dragged (their arcs follow, drawn from rim to rim); a
// node deleted with its arcs, an arc deleted; an arc's weight, an inhibitor arc, an arc that cannot be, refused. After
// every step the net's Check has no errors, the HDL it makes in VHDL and Verilog is compiled and elaborated; Check's
// warnings exactly; Undo back to the start and Redo to the end. In both interfaces (SILINX_UI_INTERFACE=ise) and in
// Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { PLACE_R, TRANS_W, TRANS_H } from '../../core/petri.js';

const FILE = 'test/usability/petri.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;
// (the shipped net's one warning: the third failure's place, alarmed, has no way out)
const DEADLOCK = 'WARNING: the net can reach a deadlock, no transition able to fire: after fail1, fail2, fail3';

/** The Petri net editor's actions: its tools, clicks and drags on the net (its coordinates, turned into the page's by
 *  the drawing's own transform), its Properties. The net is read only to know where things are. */
const pnActions = (page, { ed, t, getDoc }) => {
  const TOOLS = ['select', 'place', 'transition', 'arc', 'inhibitor'];   // (the toolbar's .pn-tool, in order)
  const tool = (name) => page.click(`${ed} .pn-tool`, { index: TOOLS.indexOf(name) });
  // a point of the net on the page, the net fitted (Zoom to Full View) when it is out of the view
  const screen = (x, y) => page.eval((e, px, py) => {
    const w = document.querySelector(`${e} .pn-world`), r = w.ownerSVGElement.getBoundingClientRect();
    const q = new DOMPoint(px, py).matrixTransform(w.getScreenCTM());
    return q.x > r.left + 8 && q.x < r.right - 8 && q.y > r.top + 8 && q.y < r.bottom - 8 ? { x: q.x, y: q.y } : null;
  }, ed, x, y);
  const at = async (x, y) => {
    let q = await screen(x, y);
    if (!q) { await page.click(`${ed} [data-act=fit]`); q = await screen(x, y); }
    if (!q) throw new Error(`(${x}, ${y}) out of the editor's view, the net fitted`);
    return q;
  };
  const nodeById = async (id) => {
    const m = await getDoc();
    const nd = [...m.places, ...m.transitions].find((x) => x.id === id);
    if (!nd) throw new Error(`no node ${id}`);
    return nd;
  };
  const centre = async (id) => { const nd = await nodeById(id); return at(nd.x, nd.y); };
  return {
    tool,
    async addPlace(x, y) { await tool('place'); await page.click(await at(x, y)); await tool('select'); },
    async addTransition(x, y) { await tool('transition'); await page.click(await at(x, y)); await tool('select'); },
    /** An arc drawn with the Arc (or Inhibitor) tool: a click on one node, then on the other. */
    async arc(from, to, { inhibitor = false } = {}) {
      await tool(inhibitor ? 'inhibitor' : 'arc');
      await page.click(await centre(from));
      await page.click(await centre(to));
      await tool('select');
    },
    /** A node selected (a click on it). */
    async select(id) { await tool('select'); await page.click(await centre(id)); },
    /** An arc selected (a click on its middle). */
    async selectArc(id) {
      const m = await getDoc();
      const a = m.arcs.find((x) => x.id === id);
      const [p, q] = await Promise.all([nodeById(a.from), nodeById(a.to)]);
      await tool('select');
      await page.click(await at((p.x + q.x) / 2, (p.y + q.y) / 2));
    },
    /** A node dragged by (dx, dy). */
    async move(id, dx, dy) {
      const nd = await nodeById(id);
      await tool('select');
      await page.drag(await at(nd.x, nd.y), await at(nd.x + dx, nd.y + dy), { steps: 10 });
    },
    /** A field of the selection's Properties (its label in English) typed in. */
    async field(label, value) {
      const l = await t(label);
      const i = await page.waitFor((e, x) => [...document.querySelectorAll(`${e} .pn-selection .asm-field`)]
        .findIndex((f) => f.querySelector('.asm-label')?.textContent === x) + 1, [ed, l], { what: `the field ${label}` });
      await page.fill(`${ed} .pn-selection .asm-field:nth-of-type(${i}) :is(input, textarea)`, String(value));
    },
    /** The selection deleted (Del). */
    del: () => page.key('Delete'),
    /** The arcs as drawn whose ends are not on their nodes' rims ([] when every one is). */
    arcsOffNodes: (m) => page.eval((e, m, R, W, H) => {
      const node = (id) => [...m.places, ...m.transitions].find((x) => x.id === id);
      const on = (nd, x, y) => (m.places.includes(nd) ? Math.abs(Math.hypot(x - nd.x, y - nd.y) - R) < 1
        : Math.abs(x - nd.x) <= W / 2 + 3 && Math.abs(y - nd.y) <= H / 2 + 3);
      return [...document.querySelectorAll(`${e} .pn-arc`)].map((g) => {
        const a = m.arcs.find((x) => x.id === g.dataset.id), l = g.querySelector('.pn-arc-hit');
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => +l.getAttribute(k));
        return on(node(a.from), x1, y1) && on(node(a.to), x2, y2) ? null : a.id;
      }).filter(Boolean);
    }, ed, m, PLACE_R, TRANS_W, TRANS_H),
  };
};
const KIT = drawKit('pn', pnActions);

async function alarm(page, title) {
  const name = `UsabPn${++n}`;
  await makeProject(env, { name, template: 'lock' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, kit: KIT });
  await s.open('src/alarm.pn.json');
  return s;
}
const ids = (list) => list.map((x) => x.id);
const added = (d, b, k) => d[k].filter((x) => !ids(b[k]).includes(x.id));
const arcOf = (d, from, to) => d.arcs.find((a) => a.from === from && a.to === to);
uiTest('usability: Petri net: a place and a transition added, linked by arcs, named, a guard and tokens; Check; Undo, Redo', E, async (page) => {
  const s = await alarm(page, 'add and link');
  const { a } = s;
  // a transition right of alarmed, a place under fail3 (both on empty ground)
  await s.step('addTransition', { at: '(640, 260)' }, () => a.addTransition(640, 260), {
    expect: (d, b) => { const [x] = added(d, b, 'transitions'); assert.deepEqual([x?.id, x?.name, x?.x, x?.y], ['t6', 't1', 640, 260]); },
  });
  await s.step('field', { node: 't6', Name: 'cool' }, async () => { await a.select('t6'); await a.field('Name', 'cool'); }, {
    expect: (d) => assert.equal(d.transitions.find((x) => x.id === 't6').name, 'cool'),
  });
  await s.step('field', { node: 't6', Guard: 'opened' }, () => a.field('Guard', 'opened'), {
    expect: (d) => assert.equal(d.transitions.find((x) => x.id === 't6').guard, 'opened'),
  });
  await s.step('addPlace', { at: '(550, 260)' }, () => a.addPlace(550, 260), {
    expect: (d, b) => { const [x] = added(d, b, 'places'); assert.deepEqual([x?.id, x?.name, x?.tokens, x?.x, x?.y], ['p5', 'p1', 0, 550, 260]); },
  });
  await s.step('arc', { from: 'p4', to: 't6' }, () => a.arc('p4', 't6'), { expect: (d) => assert.equal(arcOf(d, 'p4', 't6')?.weight, 1) });
  await s.step('arc', { from: 't6', to: 'p5' }, () => a.arc('t6', 'p5'), { expect: (d) => assert.equal(arcOf(d, 't6', 'p5')?.weight, 1) });
  await s.step('field', { node: 'p5', 'Initial tokens': 1 }, async () => { await a.select('p5'); await a.field('Initial tokens', 1); }, {
    expect: (d) => { const p = d.places.find((x) => x.id === 'p5'); assert.deepEqual([p.tokens, p.capacity], [1, 1]); },
  });
  assert.deepEqual(await a.arcsOffNodes(s.doc), []);
  // (cool never fires: p1 holds its one token from the start, full at its capacity of 1; alarmed is still a dead end)
  await s.warnings(['WARNING: transition cool never fires: no reachable marking enables it', DEADLOCK]);
  await s.undoRedo();
});

uiTest('usability: Petri net: nodes dragged: their arcs follow, drawn from rim to rim; Check; Undo, Redo', E, async (page) => {
  const s = await alarm(page, 'move nodes');
  const { a } = s;
  const moved = (id, x, y) => async (d) => {
    const nd = [...d.places, ...d.transitions].find((q) => q.id === id);
    assert.deepEqual([nd.x, nd.y], [x, y]);
    assert.deepEqual(await a.arcsOffNodes(d), []);
  };
  // forgive2 down and right, two (its arcs from two, to none); two up (its arcs to fail3, from fail2, to forgive2); none left
  await s.step('move', { node: 't5', dx: 40, dy: 40 }, () => a.move('t5', 40, 40), { expect: moved('t5', 320, 340) });
  await s.step('move', { node: 'p3', dy: -60 }, () => a.move('p3', 0, -60), { expect: moved('p3', 460, 80) });
  await s.step('move', { node: 'p1', dx: -40, dy: 20 }, () => a.move('p1', -40, 20), { expect: moved('p1', 60, 160) });
  await s.warnings([DEADLOCK]);
  await s.undoRedo();
});

uiTest('usability: Petri net: a transition deleted with its arcs, then an arc; Check\'s warnings; Undo, Redo', E, async (page) => {
  const s = await alarm(page, 'delete');
  const { a } = s;
  // forgive1 (one → none on opened): it goes with its two arcs
  await s.step('delete', { node: 't4' }, async () => { await a.select('t4'); await a.del(); }, {
    expect: (d, b) => {
      assert.deepEqual(ids(d.transitions), ids(b.transitions).filter((x) => x !== 't4'));
      assert.deepEqual(ids(b.arcs).filter((x) => !ids(d.arcs).includes(x)), ['a7', 'a8']);
    },
  });
  // forgive2's arc back to none (a10): forgive2 then only takes the token
  await s.step('deleteArc', { arc: 'a10' }, async () => { await a.selectArc('a10'); await a.del(); }, {
    expect: (d, b) => assert.deepEqual(ids(b.arcs).filter((x) => !ids(d.arcs).includes(x)), ['a10']),
  });
  await s.warnings([DEADLOCK]);
  await s.undoRedo();
});

uiTest('usability: Petri net: an arc\'s weight, an inhibitor arc, an arc that cannot be, refused; Check; Undo, Redo', E, async (page) => {
  const s = await alarm(page, 'weights and inhibitors');
  const { a } = s;
  // a place to a place: refused (said in the console), nothing changes
  await s.step('arc', { from: 'p1', to: 'p2' }, async () => {
    const n0 = (await page.consoleText()).length;
    await a.arc('p1', 'p2');
    // (its words not checked here: left in English in Portuguese, the todo below)
    await page.waitFor((k) => /(WARNING|AVISO): alarm\.pn\.json: /.test(window.__console().slice(k)), [n0], { what: 'the arc refused' });
  }, { changes: false });
  // an inhibitor arc alarmed ⊸ fail1: no failure counted while the alarm is on
  await s.step('arc', { from: 'p4', to: 't1', inhibitor: true }, () => a.arc('p4', 't1', { inhibitor: true }), {
    expect: (d) => assert.deepEqual(arcOf(d, 'p4', 't1'), { id: 'a11', from: 'p4', to: 't1', weight: 1, inhibitor: true }),
  });
  // fail1's arc from none (a1): weight 2, and none 2 tokens
  await s.step('field', { arc: 'a1', Weight: 2 }, async () => { await a.selectArc('a1'); await a.field('Weight', 2); }, {
    expect: (d) => assert.equal(d.arcs.find((x) => x.id === 'a1').weight, 2),
  });
  await s.step('field', { node: 'p1', Capacity: 2 }, async () => { await a.select('p1'); await a.field('Capacity', 2); }, {
    expect: (d) => { const p = d.places.find((x) => x.id === 'p1'); assert.deepEqual([p.tokens, p.capacity], [1, 2]); },
  });
  await s.step('field', { node: 'p1', 'Initial tokens': 2 }, () => a.field('Initial tokens', 2), {
    expect: (d) => { const p = d.places.find((x) => x.id === 'p1'); assert.deepEqual([p.tokens, p.capacity], [2, 2]); },
  });
  assert.deepEqual(await a.arcsOffNodes(s.doc), []);
  // (fail1 takes both of none's tokens; forgive1 gives one back, too few for fail1, and alarmed still a dead end)
  await s.warnings(['WARNING: the net can reach a deadlock, no transition able to fire: after fail1, forgive1']);
  await s.undoRedo();
});

uiTest('usability: Petri net: an arc that cannot be, refused: said in the page\'s language (Portuguese) (#5164)', E, async (page, _env, t) => {
  t.todo('#5164: the Petri net editor\'s messages are logged untranslated (web/js/drawings.js, its onMessage: no t())');
  const s = await alarm(page, 'refused arc in Portuguese');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  const want = await s.a.t('An arc joins a place and a transition');
  assert.notEqual(want, 'An arc joins a place and a transition');
  const n0 = (await page.consoleText()).length;
  await s.step('arc', { from: 'p1', to: 'p2' }, () => s.a.arc('p1', 'p2'), { changes: false });
  await page.waitFor((k) => /alarm\.pn\.json: /.test(window.__console().slice(k)), [n0], { what: 'the arc refused' });
  const said = (await page.consoleText()).slice(n0).trim();
  assert.ok(said.endsWith(`alarm.pn.json: ${want}`), `said: ${said}`);
});
