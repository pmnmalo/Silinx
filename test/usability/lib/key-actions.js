// Usability tests (#5206, phase 6): a person with a keyboard and no mouse: Tab (and Shift+Tab) on to a control, the
// arrows in a list, Enter; the menus by the keyboard (the ISE style's menu bar taken by F10, its menu found with ← →,
// opened by ↓, its entry found with ↓, run by Enter: #4761), and the command palette (Ctrl+K: the Silinx interface has no
// menu bar, its menus' commands there), a command found by typing its name and the arrows to its row. Each press a real
// key (CDP's key events); each search bounded, its failure saying the keys pressed and where the focus went.
import { tr } from './hdl-actions.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Cmd on a Mac (the browser's key map there), Ctrl elsewhere. */
export const MOD = process.platform === 'darwin' ? 4 : 2;
const SHIFT = 8;

/** `key` pressed until `done()` says so (before the first press too), at most `max` times (`prep()` before each): the
 *  presses made; else an error saying `what`, the presses and the last places `where()` gave. */
export async function pressUntil(page, key, done, { max = 60, what = 'the target', where = async () => '', modifiers = 0, prep = null } = {}) {
  const seen = [];
  for (let k = 0; k <= max; k++) {
    if (await done()) return k;
    if (k === max) break;
    await prep?.();
    await page.key(key, { modifiers });
    seen.push(await where());
  }
  throw new Error(`${what} not reached after ${max} × ${key}: ${seen.slice(-6).join(' → ')}`);
}

/** Where the keyboard's focus is, as a person reads it: the element's role or tag and its name. */
export const focusOf = (page) => page.eval(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'the page';
  const name = (a.getAttribute('aria-label') || a.title || (a.matches('input, textarea, select') ? a.value : a.textContent) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return `${a.getAttribute('role') || a.tagName.toLowerCase()} ${JSON.stringify(name)}`;
});

export function keyActions(page) {
  const where = () => focusOf(page);
  const k = {
    where,
    /** Tab (Shift+Tab: `back`) until the focus is on an element matching `sel` (or in one; `text`: whose text, or
     *  name, as focusOf reads it, is that); out of a text editor by Escape first (its Tab indents: Escape, then Tab moves the focus on). */
    tabTo: (sel, { back = false, max = 80, text = null } = {}) => pressUntil(page, 'Tab', () => page.eval((s, t) => {
      const a = document.activeElement?.closest(s);
      return !!a && (t == null || (a.getAttribute('aria-label') || a.title || a.textContent).trim() === t);
    }, sel, text), {
      max, what: sel, where, modifiers: back ? SHIFT : 0,
      prep: async () => { if (await page.eval(() => !!document.activeElement?.closest('.cm-editor'))) await page.key('Escape'); },
    }),
    /** The Design tree focused (Tab), its selection moved by ↓ (↑: `up`) to the row named `label` (an instance's:
     *  'u_fsm - traffic'), once the tree shows it. */
    async treeTo(label, { up = false } = {}) {
      const named = (l) => { const t = document.querySelector('#hier .row.sel .lbl')?.textContent || ''; return t === l || t.startsWith(`${l} - `); };
      await page.waitFor((l) => [...document.querySelectorAll('#hier .row .lbl')].some((e) => e.textContent === l || e.textContent.startsWith(`${l} - `)), [label], { what: `the Design row ${label}` });
      await k.tabTo('#hier .tree');
      await pressUntil(page, up ? 'ArrowUp' : 'ArrowDown', () => page.eval(named, label),
        { max: 30, what: `the Design row ${label}`, where: () => page.eval(() => document.querySelector('#hier .row.sel .lbl')?.textContent || 'none') });
    },
    /** The command palette (Ctrl+K), `text` typed, ↓ to the row of `item` (in the page's language; a menu's command:
     *  its `group`, the menu's name), Enter. */
    async palette(text, item, group = null) {
      await page.key('k', { modifiers: MOD });
      await page.waitFor(() => document.activeElement?.matches('.pal-input'), [], { what: 'the command palette' });
      await page.type(text);
      await sleep(100);
      await pressUntil(page, 'ArrowDown', () => page.eval((i, g) => {
        const r = document.querySelector('.pal-item.sel');
        return !!r && r.querySelector('.pal-label')?.textContent === i && (g == null || r.querySelector('.pal-kind')?.textContent.split(' › ')[0] === g);
      }, item, group), { max: 20, what: `the palette's ${group ? `${group} › ` : ''}${item}`, where: () => page.eval(() => document.querySelector('.pal-item.sel')?.textContent || 'none') });
      await page.key('Enter');
      await page.waitFor(() => !document.querySelector('.pal-overlay'), [], { what: 'the palette closed' });
    },
    /** A menu's entry by the keyboard (labels in the page's language): the menu bar's (F10, → to the menu, ↓ into it, ↓
     *  to the entry, Enter) where it is shown, else the command palette's. */
    async menu(menu, item) {
      if (!await page.eval(() => !!document.querySelector('#menubar > .item')?.getClientRects().length)) return k.palette(item, item, menu);
      await page.key('F10');
      const bar = () => page.eval(() => document.activeElement?.closest('#menubar .item')?.textContent ?? null);
      await pressUntil(page, 'ArrowRight', async () => (await bar()) === menu, { max: 12, what: `the menu ${menu}`, where: bar });
      await page.key('ArrowDown');
      await page.waitFor(() => document.querySelector('body > .menu-popup')?.contains(document.activeElement), [], { what: `the menu ${menu} open` });
      await pressUntil(page, 'ArrowDown', () => page.eval((i) => document.activeElement?.querySelector('.lbl')?.textContent === i || document.activeElement?.firstChild?.textContent === i, item),
        { max: 30, what: `${menu} ▸ ${item}`, where: () => page.eval(() => document.activeElement?.textContent || 'none') });
      await page.key('Enter');
    },
    /** As `menu`, its labels in English (translated as the page shows them). */
    async menuEn(menu, item) { const [m, i] = await tr(page, [menu, item]); return k.menu(m, i); },
  };
  return k;
}
