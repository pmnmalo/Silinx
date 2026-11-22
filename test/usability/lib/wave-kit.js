// Usability tests (#5206, phase 1): the simulator's wave window's kit for a session (lib/session.js): its document the
// window as a person sees it (its rows, their radixes, the cursor, the markers, the zoom, and the Value column's texts
// at the cursor, as they are drawn), its invariant the values: each row's at the cursor the reference simulator's
// (core's, on the same files, run as long), written in the row's radix (`shownValue`, written here from the value's
// bits); its actions a person's clicks (the toolbar's, the waves', the context menus', the instance tree's and the
// Objects panel's, the ⋮ menu's wave configuration).
import { compile, elaborate } from '../../../core/compile.js';
import { Simulator } from '../../../core/simulator.js';
import { toBin } from '../../../core/values.js';
import { tr } from './hdl-actions.js';

/** The reference: the design simulated by core's simulator for `ps`; a signal's value at a time by its path as the
 *  wave window has it (tb.uut.r). */
export function waveReference(files, top, ps) {
  const lib = compile(files.map((f) => ({ path: f.path, text: f.text })));
  const design = elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter((d) => d.severity === 'error');
  if (errors.length) throw new Error(`the reference does not elaborate: ${errors.map((e) => e.message).join('; ')}`);
  const sim = new Simulator(design);
  sim.run(ps);
  const byPath = new Map();
  const walk = (inst, prefix) => {
    for (const p of inst.ports || []) if (!byPath.has(prefix + p.name)) byPath.set(prefix + p.name, p.sig);
    for (const s of inst.signals || []) if (!byPath.has(prefix + s.name)) byPath.set(prefix + s.name, s);
    for (const c of inst.children || []) walk(c, `${prefix}${c.name}.`);
  };
  walk(design.top, `${top}.`);
  return {
    now: sim.now,
    // (the top's signals, its ports first, as the wave window lists them)
    rows: [...byPath.keys()].filter((p) => p.split('.').length === 2),
    signal: (p) => byPath.get(p) ?? null,
    at(p, t) { const s = byPath.get(p); return s ? { v: sim.valueAt(s, t), t: s.t } : null; },
  };
}

/** A value as the wave window writes it in a radix (default: a bit as it is, a vector in hexadecimal, an integer in
 *  decimal, a boolean TRUE / FALSE, an array as such): from its bits, a digit of unknown bits X (Z when all are high
 *  impedance). */
export function shownValue(v, type, radix = 'default') {
  if (Array.isArray(v)) return '(array)';
  if (type?.kind === 'bool') return v.v ? 'TRUE' : 'FALSE';
  if (type?.kind === 'int' && radix === 'default') return /[xz]/.test(toBin(v)) ? 'X' : BigInt.asIntN(v.w, v.v).toString();
  const bits = toBin(v).toUpperCase();
  if (radix === 'default') radix = bits.length === 1 ? 'bin' : 'hex';
  if (radix === 'bin') return bits;
  if (radix === 'udec') return /[XZ]/.test(bits) ? 'X' : BigInt(`0b${bits}`).toString();
  if (radix !== 'hex') throw new Error(`shownValue: radix ${radix}`);
  const pad = bits.padStart(Math.ceil(bits.length / 4) * 4, '0');
  let s = '';
  for (let i = 0; i < pad.length; i += 4) {
    const d = pad.slice(i, i + 4);
    s += /^Z+$/.test(d) ? 'Z' : /[XZ]/.test(d) ? 'X' : parseInt(d, 2).toString(16).toUpperCase();
  }
  return s;
}

/** What the window must show at its cursor: the rows whose value is not the reference's. */
export function wrongValues(doc, ref) {
  const out = [];
  doc.rows.forEach(([p, radix], i) => {
    const r = ref.at(p, doc.cursor);
    if (!r) { out.push(`${p}: not in the reference`); return; }
    const want = shownValue(r.v, r.t, radix), got = doc.values[i];
    if (got !== want) out.push(`${p} at ${doc.cursor} ps (${radix}): shown ${JSON.stringify(got)}, the reference's ${JSON.stringify(want)}`);
  });
  return out;
}

/** The wave window's kit for a Session, its values checked against `ref` (waveReference). */
export function waveKit(ref) {
  return {
    actions: waveActions,
    invariants: (doc) => { const w = wrongValues(doc, ref); return w.length ? { values: w } : {}; },
    hdlErrors: () => [],
    detached: () => [],
    dangling: () => [],
  };
}

export function waveActions(page) {
  const view = (fn, ...a) => page.eval(fn, ...a);
  const tbBtn = async (title) => { const [t] = await tr(page, [title]); await page.click(`.doc:not([hidden]) .isim-toolbar .tb-btn[title="${t}"]`); };
  // a time and a row's point on the waves (row -1: the ruler)
  const waveAt = (t, row) => view((tt, r) => {
    const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect();
    return { x: c.left + (tt - s.t0) / s.scale, y: c.top + (r < 0 ? 15 : 30 + r * 20 + 10 - s.scrollY) };
  }, t, row);
  const menuItem = async (label) => { const [l] = await tr(page, [label]); await page.click('.isim-menu-item', { text: l }); };
  const a = {
    /** The window as it is: its rows ([path, radix]), the cursor, the markers, the zoom, the Value column's texts. */
    getDoc: () => view(() => {
      const v = window.Silinx.active.view, s = v.state;
      const c = document.querySelector('.doc:not([hidden]) .isim-names'), ctx = c.getContext('2d'), out = [];
      const f = ctx.fillText;
      ctx.fillText = function (x, ...r) { out.push(String(x)); return f.call(this, x, ...r); };
      try { v.redraw(); } finally { ctx.fillText = f; }
      // (the texts drawn: Name, Value, then each row's name and value)
      const values = s.rows.map((_, i) => out[3 + 2 * i] ?? null);
      return { rows: s.rows.map((r) => [r.sig?.path ?? `-- ${r.name}`, r.radix ?? 'default']), cursor: s.cursor, markers: s.markers.map((m) => m.t), scale: s.scale, t0: s.t0, fit: s.fit, values };
    }),
    open: async () => {},
    zoomIn: () => tbBtn('Zoom In'),
    zoomOut: () => tbBtn('Zoom Out'),
    zoomFull: () => tbBtn('Zoom to Full View'),
    addMarkerAtCursor: () => tbBtn('Add Marker at cursor'),
    /** The waves clicked at a time (in view) on a row: the cursor there, snapped to the row's nearest transition. */
    async clickAt(t, row) { await page.click(await waveAt(t, row)); },
    /** A signal of an instance added from the Objects panel: the instance chosen in the tree, the signal's row
     *  right-clicked, Add to Wave Window. */
    async addSignal(inst, name) {
      await page.showSide();
      await page.click('.doc:not([hidden]) .isim-tree .row', { text: `▾${inst}` });
      const i = await page.waitFor((n) => { const k = [...document.querySelectorAll('.doc:not([hidden]) .isim-objs tbody tr')].findIndex((r) => [...(r.querySelector('.c-name')?.childNodes || [])].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('') === n); return k >= 0 ? k + 1 : 0; }, [name], { what: `${name} in the Objects panel` }) - 1;
      await page.rightClick('.doc:not([hidden]) .isim-objs tbody tr', { index: i });
      await menuItem('Add to Wave Window');
    },
    /** A row's radix from its context menu (on the waves at a time in view). */
    async radix(row, t, label) {
      await page.rightClick(await waveAt(t, row));
      const [r, l] = await tr(page, ['Radix', label]);
      await page.hover(await page.point('.isim-menu-item', { text: r }));
      await page.waitForSelector('.isim-menu-root .isim-menu');
      await page.click('.isim-menu-root .isim-menu .isim-menu-item', { text: l });
    },
    /** ⋮ ▸ Save Wave Configuration…, the name it offers kept: the line it writes in the simulator's console. */
    async saveConfig() {
      const [title, ok] = await tr(page, ['Save Wave Configuration', 'OK']);
      await page.click('.doc:not([hidden]) .isim-toolbar .tb-more-btn');
      await page.click('.doc:not([hidden]) .isim-toolbar .tb-more-menu button:nth-of-type(1)');
      await page.waitDialog(title);
      await page.dialogButton(ok);
      await page.waitNoDialog();
    },
    /** ⋮ ▸ Load Wave Configuration…, the one it offers. */
    async loadConfig() {
      const [title, load] = await tr(page, ['Load Wave Configuration', 'Load']);
      await page.click('.doc:not([hidden]) .isim-toolbar .tb-more-btn');
      await page.click('.doc:not([hidden]) .isim-toolbar .tb-more-menu button:nth-of-type(2)');
      await page.waitDialog(title);
      await page.dialogButton(load);
      await page.waitNoDialog();
      await page.waitFor(() => window.Silinx.active.view.state.markers.length > 0, [], { what: 'the configuration loaded' });
    },
    /** The simulator's console's lines. */
    isimLines: () => view(() => Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent)),
  };
  return a;
}
