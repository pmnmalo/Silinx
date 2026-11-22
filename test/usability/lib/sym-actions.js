// Usability tests (#5206, phase 4): the Symbol Editor's kit for a session (lib/session.js): its document the symbol it
// shows (its pins' order and sides, the spacing, the body's size), its actions a person's: Edit Symbol of a module's row
// of the Design pane (right-clicked), a pin clicked and its Side chosen in the Properties, dragged to another side,
// moved along its side (Later ▶ / ◀ Earlier), the body's Width and Height typed, Ctrl+S, Exit, Edit ▸ Undo / Redo. Its
// invariant: the symbol's pins are its module's ports (the module the project's HDL on disk holds, lib/hier-kit.js).
import { projectActions } from './project-actions.js';
import { tr } from './hdl-actions.js';
import { symbolPortsWrong } from './hier-kit.js';

export const SY = '.doc:not([hidden]) .sym-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Symbol Editor's actions on `page` (`env`: the server's, for the Design pane's menu). */
export function symActions(page, env) {
  const getDoc = () => page.eval(() => window.Silinx.active?.symEditor?.getSymbol() ?? null);
  const menu = async (m, item) => { const [a, b] = await tr(page, [m, item]); return page.menu(a, b); };
  const pick = async (name) => {
    await page.click(`${SY} .sy-pin[data-pin="${name}"]`);
    await page.waitFor((s, p) => document.querySelector(`${s} .sy-pin.sel[data-pin="${p}"]`) && document.querySelector(`${s} .sy-pin-props h3`)?.textContent === p, [SY, name], { what: `${name} selected` });
  };
  return {
    getDoc,
    /** Edit Symbol of the module `name`: its row of the Design pane right-clicked (its own, or its first instance's,
     *  'inst_1 - pick'), Edit Symbol; the Symbol Editor in front, its symbol fitted. */
    async open(name) {
      await page.leftTab('design');
      const row = await page.waitFor((m) => [...document.querySelectorAll('#hier .row .lbl')].filter((l) => l.getClientRects().length)
        .map((l) => l.textContent).find((t) => t === m || t.endsWith(` - ${m}`)), [name], { what: `a row of ${name}` });
      await projectActions(page, env).rowMenu(row, 'Edit Symbol');
      await page.waitFor((s, m) => window.Silinx.active?.symEditor?.getSymbol().module === m && document.querySelector(`${s} .sy-pin`), [SY, name], { what: `${name}'s symbol in the Symbol Editor` });
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    },
    /** A pin clicked: selected, its Properties shown. */
    select: pick,
    /** A pin's Side chosen in its Properties ('W', 'E', 'N', 'S'): last on that side. */
    async side(name, side) { await pick(name); await page.fill(`${SY} .sy-side`, side); },
    /** A pin moved one place along its side (Later ▶, or ◀ Earlier when `by` < 0). */
    async shift(name, by = 1) { await pick(name); await page.click(`${SY} ${by > 0 ? '.sy-later' : '.sy-earlier'}`); },
    /** A pin dragged by its handle to just before the pin `to` (above it on a left or right side, left of it on the top
     *  or the bottom). */
    async drag(name, to) {
      const from = await page.point(`${SY} .sy-pin[data-pin="${name}"]`);
      const at = await page.eval((s, p) => {
        const c = document.querySelector(`${s} .sy-pin[data-pin="${p}"]`), r = c.getBoundingClientRect(), b = document.querySelector(`${s} svg .body, ${s} svg rect`)?.getBoundingClientRect();
        const across = !b || r.left + r.width / 2 < b.left || r.left + r.width / 2 > b.right;
        return across ? { x: r.left + r.width / 2, y: r.top - 6 } : { x: r.left - 6, y: r.top + r.height / 2 };
      }, SY, to);
      await page.mouse('mouseMoved', from.x, from.y);
      await page.mouse('mousePressed', from.x, from.y);
      for (let i = 1; i <= 8; i++) await page.mouse('mouseMoved', from.x + (at.x - from.x) * i / 8, from.y + (at.y - from.y) * i / 8, { buttons: 1, button: 'left' });
      await page.mouse('mouseReleased', at.x, at.y);
    },
    /** The body's Width or Height typed in the Properties ('' automatic). */
    async size(field, value) { await page.fill(`${SY} .sy-${field}`, String(value)); },
    /** Ctrl+S: saved (the tab's mark gone). */
    async save() {
      await page.eval(() => clearTimeout(window.Silinx.active._autosave));
      await page.key('s', { modifiers: 2 });
      await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'the symbol saved' });
    },
    /** Exit: the Symbol Editor's tab closed, its changes saved. */
    async exit() {
      const path = await page.eval(() => window.Silinx.active.path);
      await page.click(`${SY} .sy-exit`);
      await page.waitFor((p) => !window.Silinx.docs.some((d) => d.path === p && d.symEditor), [path], { what: 'the Symbol Editor closed' });
      await sleep(200);
    },
    /** The status line's fields ('4 pin(s)', '80 × 80'). */
    status: () => page.eval((s) => [...document.querySelectorAll(`${s} .doc-status .ds-f`)].map((f) => f.textContent), SY),
    undo: () => menu('Edit', 'Undo'),
    redo: () => menu('Edit', 'Redo'),
  };
}

/** The Symbol Editor's kit: `ctx.modules` the project's modules (lib/hier-kit.js's, from the disk), read when checked. */
export const symKit = (env, ctx) => ({
  actions: (page) => symActions(page, env),
  invariants: (sym) => { const w = symbolPortsWrong(sym, ctx.modules); return w.length ? { 'the symbol\'s pins': w } : {}; },
  hdlErrors: () => [], detached: () => [], dangling: () => [],
});
