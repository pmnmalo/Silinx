// A phone's main toolbar (#5121): under 600 px (PHONE_QUERY of web/js/narrow.js) it keeps the tools a phone is for,
// Open Project, Undo, Redo and Find in Project, and gathers the others (New Project, Close Project, Share, Print,
// Cut, Copy, Paste; in the ISE style interface the processes' buttons too: Implement, Stop, Simulate, Emulate,
// iMPACT, the toolchain's settings, About) in the menu of a "More tools" button (⋯) at its end, in their order, each
// enabled as its button is and run by it. Wider, the button is not shown and the toolbar is as it was. A menu (this
// one, the menu bar's, a right-click's) is the whole width there, as tall as the screen below where it opened allows,
// its items scrolled. Its look: web/css/phone.css.

import { h, popupMenu } from './ui.js';
import { icons } from './icons.js';
import { isPhone } from './narrow.js';

/** The main toolbar's buttons a phone keeps (their data-cmd). */
const PHONE_TOOLS = ['open', 'undo', 'redo', 'find'];

// three dots (an icon, as every button of the toolbar has)
const ICON = { more: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="3" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="13" cy="8" r="1.6"/></svg>' };
const $ = (id) => document.getElementById(id);
// a button's name, its tip as the toolbar made it (in English: the menu's items are translated as every menu's)
const names = new WeakMap();
const shownByLayout = (b) => !b.hidden && getComputedStyle(b).display !== 'none';

/** The menu's items: the toolbar's buttons a phone does not keep, in their order, a separator between their groups. */
function moreItems(toolbar = $('toolbar')) {
  const items = [];
  let group = false;
  for (const el of toolbar.children) {
    if (el.classList.contains('tb-sep')) { if (group) items.push('-'); group = false; continue; }
    if (!el.classList.contains('tb-btn') || !el.dataset.cmd || PHONE_TOOLS.includes(el.dataset.cmd)) continue;
    // (a tool the layout hides on a wider screen too: the Silinx interface's processes, a design project's toolchain)
    el.classList.remove('phone-gone');
    const off = !shownByLayout(el);
    el.classList.add('phone-gone');
    if (off) continue;
    items.push({ label: names.get(el) || el.title, icon: h('span', { class: 'ico-inline', html: icons[el.dataset.cmd] || '' }),
      disabled: () => el.disabled || (el._enabled && !el._enabled()), action: () => el.click() });
    group = true;
  }
  while (items.at(-1) === '-') items.pop();
  return items;
}

/** The "More tools" button at the toolbar's end and the classes that hide the other tools on a phone; once, after
 *  the toolbar is made (web/js/app.js). */
export function mountPhoneToolbar() {
  const tb = $('toolbar');
  if (!tb || $('phone-more')) return;
  for (const b of tb.querySelectorAll(':scope > .tb-btn[data-cmd]')) {
    names.set(b, b.title);
    if (!PHONE_TOOLS.includes(b.dataset.cmd)) b.classList.add('phone-gone');
  }
  const more = h('button', { class: 'tb-btn', id: 'phone-more', type: 'button', title: 'More tools', 'aria-label': 'More tools', 'aria-haspopup': 'menu', html: ICON.more });
  more.addEventListener('click', () => {
    const r = more.getBoundingClientRect();
    popupMenu(moreItems(tb), r.left, r.bottom);
  });
  const last = [...tb.querySelectorAll(':scope > .tb-btn[data-cmd]')].at(-1);
  (last ? last.after(more) : tb.append(more));
}

// a menu opened on a phone: no taller than the screen below its top (its items scrolled, web/css/phone.css)
function fitMenu(m) {
  if (!isPhone()) return;
  m.style.maxHeight = `${Math.max(120, innerHeight - m.getBoundingClientRect().top - 4)}px`;
}
/** Menus fitted to a phone's screen as they open; once, at start-up (web/js/app.js). */
export function fitPhoneMenus() {
  new MutationObserver((recs) => {
    for (const r of recs) for (const n of r.addedNodes) if (n.classList?.contains('menu-popup')) fitMenu(n);
  }).observe(document.body, { childList: true });
}
