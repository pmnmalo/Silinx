// Generic UI widgets: dialogs, menus, context menus, splitters; the element builder h and esc of dom.js re-exported.
import { icons } from './icons.js';
import { h, esc } from './dom.js';
import { prefKey } from './prefs.js';

export { h, esc };

// A drawing editor's model with its HDL file linked (generatedFile; none: unlinked), in place: the
// link alone changes (#245), the editor's history, selection and view are kept
export function linkModel(m, file) {
  if (file) m.generatedFile = String(file); else delete m.generatedFile;
  return m;
}
// the same for a snapshot of the editor's history (its JSON): an Undo / Redo keeps the link (#245);
// `norm`: the editor's normalization, when its history holds normalized models
export const linkSnapshot = (s, file, norm = m => m) => JSON.stringify(norm(linkModel(JSON.parse(s), file)));

// ------------------------------------------------------------------ dialogs
let dialogZ = 1000, dialogIds = 0;
const dialogStack = [];   // open dialogs, innermost last: only it reacts to Enter / Escape
// what Tab goes through in a dialog (#4761: kept in it, Shift+Tab too)
const TABBABLE = 'button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
// the keys with Ctrl / Cmd a field in a dialog keeps; the others are the app's shortcuts, not for the document behind
// a modal dialog (Ctrl+P printed it, #4761)
const FIELD_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y']);
// A modal dialog (#4761): role dialog, aria-modal, named by its title; Tab and Shift+Tab kept inside it; the focus
// back where it was when it closes; the app's shortcuts not reaching the document behind it.
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }, { label: 'Cancel', value: null }], width = 460, onOpen, className = '' }) {
  return new Promise(resolve => {
    const overlay = h('div', { class: 'dlg-overlay', style: { zIndex: ++dialogZ } });
    const content = typeof body === 'function' ? body() : body;
    // once only: a second click or key (a button pressed twice) must not close another dialog (#490)
    let closed = false;
    const opener = remember(document.activeElement);
    const close = v => {
      if (closed) return;
      closed = true; overlay.remove(); document.removeEventListener('keydown', onKey, true); dialogStack.splice(dialogStack.indexOf(overlay), 1);
      // (the focus back where it was, unless something else took it meanwhile: another dialog)
      if (opener && (!document.activeElement || document.activeElement === document.body)) focusBack(opener);
      resolve(v);
    };
    const btnRow = h('div', { class: 'dlg-buttons' });
    const titleId = `dlg-title-${++dialogIds}`;
    const dlg = h('div', { class: `dlg ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: { width: typeof width === 'number' ? `${width}px` : width } },
      h('div', { class: 'dlg-title' }, h('span', { id: titleId }, title), h('button', { class: 'dlg-x', onclick: () => close(null), title: 'Close', 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'dlg-body' }, content),
      btnRow,
    );
    for (const b of buttons) {
      const el = h('button', { class: `btn${b.primary ? ' primary' : ''}`, onclick: async () => {
        if (b.validate) { const ok = await b.validate(); if (!ok) return; }
        close(typeof b.value === 'function' ? b.value() : b.value);
      } }, b.label);
      if (b.disabled) el.disabled = true;
      b.el = el;
      btnRow.append(el);
    }
    const onKey = e => {
      if (dialogStack[dialogStack.length - 1] !== overlay) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Tab') {
        const list = [...dlg.querySelectorAll(TABBABLE)].filter(x => x.getClientRects().length);
        const at = list.indexOf(document.activeElement);
        if (list.length && (at < 0 || (e.shiftKey ? at === 0 : at === list.length - 1))) { e.preventDefault(); list[e.shiftKey ? list.length - 1 : 0].focus(); }
      }
      if ((e.ctrlKey || e.metaKey) && String(e.key).length === 1 && !FIELD_KEYS.has(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
        const p = buttons.find(b => b.primary);
        if (p && !p.el.disabled) { e.preventDefault(); p.el.click(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    dialogStack.push(overlay);
    overlay.append(dlg);
    document.body.append(overlay);
    // drag by title: pointer events, so a finger drags it too (#264)
    const t = dlg.querySelector('.dlg-title');
    t.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || !e.isPrimary) return;
      const r = dlg.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      dlg.style.position = 'fixed';
      try { t.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
      const mv = ev => { if (ev.pointerId !== e.pointerId) return; dlg.style.left = `${ev.clientX - ox}px`; dlg.style.top = `${ev.clientY - oy}px`; dlg.style.margin = '0'; };
      const up = ev => { if (ev.pointerId !== e.pointerId) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    onOpen?.({ dlg, close, buttons });
    const first = dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea');
    (first || btnRow.querySelector('.primary'))?.focus();
  });
}

// (no alert box: a message goes to the console, #4747: commandError…, message())
// the answers' labels: Yes / No, or others (`{ yes: 'Replace', no: 'Cancel' }`, #1467)
export const confirmDlg = (title, message, { yes = 'Yes', no = 'No' } = {}) => dialog({
  title, width: 420,
  body: h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'), h('div', { class: 'msg-text' }, message)),
  buttons: [{ label: yes, value: true, primary: true }, { label: no, value: false }],
});

export async function promptDlg(title, label, value = '') {
  const inp = h('input', { type: 'text', value, style: { width: '100%' } });
  const r = await dialog({ title, body: h('div', {}, h('label', {}, label), inp), buttons: [{ label: 'OK', primary: true, value: () => inp.value }, { label: 'Cancel', value: null }] });
  return r;
}

// ------------------------------------------------------------------ menus
let openMenu = null;
// where the focus goes back when the menus close (#4761): what had it before the keyboard went into a menu (F10, Alt,
// an arrow on a menu opened), so that a command acts on it (Edit ▸ Copy on the field, #677)
let menuReturn = null;
// an element the focus goes back to, or, when it was drawn again meanwhile (the Design tree, redrawn as a row is
// selected), the first one of the same place that takes the focus
const SAME_PLACE = '[tabindex="0"], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
function focusBack(el) {
  if (!el) return;
  if (!el.isConnected) {
    const host = el.focusHost && document.getElementById(el.focusHost);
    el = host && (host.matches(SAME_PLACE) ? host : host.querySelector(SAME_PLACE));
    if (!el) return;
  }
  el.focus({ preventScroll: true });
}
// (where the focus was: the element, and the id of the place it is in, for focusBack)
const remember = el => { if (el && el !== document.body) el.focusHost = el.closest('[id]')?.id; return el; };
export function closeMenus() {
  if (openMenu) { openMenu.remove(); openMenu = null; }
  document.querySelectorAll('.menubar .item.open').forEach(e => { e.classList.remove('open'); e.setAttribute('aria-expanded', 'false'); });
  const back = menuReturn;
  menuReturn = null;
  if (back && (!document.activeElement || document.activeElement === document.body || document.activeElement.closest?.('.menu-popup, .menubar'))) focusBack(back);
}
addEventListener('mousedown', e => { if (!e.target.closest('.menu-popup') && !e.target.closest('.menubar')) closeMenus(); });
addEventListener('blur', closeMenus);
// a menu's entries the arrows go through, and moves between them (↑ ↓ Home End; wrapping)
const menuRows = m => [...m.querySelectorAll(':scope > .mi:not(.disabled)')];
function moveIn(m, to) {
  const rows = menuRows(m);
  if (!rows.length) return;
  const at = rows.indexOf(document.activeElement);
  rows[to === 'next' ? (at + 1) % rows.length : to === 'prev' ? (at - 1 + rows.length) % rows.length : to === 'last' ? rows.length - 1 : 0].focus();
}
// a menu open (a context menu, one of the menu bar's): ↓ / ↑ take the keyboard into it, Esc closes it
addEventListener('keydown', e => {
  if (!openMenu) return;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    // (a menu of the bar the keyboard took: back on its name in the bar; else back where the focus was)
    const item = barReturn && document.querySelector('.menubar .item.open');
    if (item) menuReturn = null;
    closeMenus();
    item?.focus();
    return;
  }
  if (!openMenu.contains(document.activeElement) && !document.activeElement?.closest?.('.menubar') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault(); e.stopPropagation();
    menuReturn ||= remember(document.activeElement);
    moveIn(openMenu, e.key === 'ArrowDown' ? 0 : 'last');
  }
}, true);

// items: [{ label, action, shortcut, disabled, checked, icon }|'-'|{label, submenu:[...]}]
// how a menu command runs (the app records the ones that change the project: Undo / Redo)
let actionRunner = (label, fn) => fn();
export function setActionRunner(f) { actionRunner = f; }
export const runAction = (label, fn) => actionRunner(label, fn);
// where a message goes (#3591: a menu action's error, an editor's "No quick fix here."): the app's console
// (setMessageSink, app.js), a toast in a page without one (the demos); level: 'error', 'warning' or 'info'
let messageSink = (text, level) => toast(text, level === 'info' ? 'info' : 'error');
export function setMessageSink(f) { messageSink = f; }
export const message = (text, level = 'info') => messageSink(text, level);

export function popupMenu(items, x, y) {
  closeMenus();
  const m = buildMenu(items);
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, innerWidth - r.width - 4)}px`;
  m.style.top = `${Math.min(y, innerHeight - r.height - 4)}px`;
  openMenu = m;
  return m;
}

function buildMenu(items) {
  const m = h('div', { class: 'menu-popup', role: 'menu' });
  // a menu pressed leaves the focus where it is, as the menu bar does (Edit ▸ Copy takes the selection of the
  // text field in focus, #677)
  m.addEventListener('mousedown', e => e.preventDefault());
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'sep', role: 'separator' })); continue; }
    if (!it) continue;
    const disabled = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
    // (its role, #4761: a checkable item's, its ✓ said; a submenu's)
    const row = h('div', { class: `mi${disabled ? ' disabled' : ''}`, role: 'checked' in it ? 'menuitemcheckbox' : 'menuitem', tabindex: '-1',
      ...('checked' in it && { 'aria-checked': String(!!it.checked) }), ...(disabled && { 'aria-disabled': 'true' }), ...(it.submenu && { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }) },
      h('span', { class: 'chk', 'aria-hidden': 'true' }, it.checked ? '✓' : (it.icon || '')),
      h('span', { class: 'lbl', ...(it.raw && { 'data-no-i18n': '' }) }, it.label),   // raw: a name or a title, not translated
      h('span', { class: 'sc', ...(it.submenu && { 'aria-hidden': 'true' }) }, it.submenu ? '▸' : (it.shortcut || '')),
    );
    if (typeof it.icon === 'object' && it.icon instanceof Node) { row.firstChild.textContent = ''; row.firstChild.append(it.icon); }
    if (it.title) row.title = it.title;   // e.g. why the item is disabled
    if (it.submenu) {
      let sub = null;
      row.addEventListener('mouseenter', () => {
        m.querySelectorAll(':scope > .menu-popup').forEach(s => s.remove());
        m.querySelectorAll(':scope > .mi[aria-expanded]').forEach(r => r.setAttribute('aria-expanded', 'false'));
        row.setAttribute('aria-expanded', 'true');
        sub = buildMenu(it.submenu);
        sub.classList.add('sub');
        m.append(sub);
        const r = row.getBoundingClientRect();
        sub.style.left = `${r.right - 2}px`; sub.style.top = `${r.top - 3}px`;
        sub.style.position = 'fixed';
        // kept inside the window (#767): on the menu's left when there is no room on its right (the last menu of the
        // bar, long labels), else against the window's edge; moved up when it runs
        // past the bottom
        const W = window.innerWidth, H = window.innerHeight, b = sub.getBoundingClientRect();
        if (b.right > W) {
          sub.style.maxWidth = `${W - 8}px`;
          const w = sub.getBoundingClientRect().width;
          sub.style.left = `${r.left - w + 2 >= 4 ? r.left - w + 2 : Math.max(4, W - w - 4)}px`;
        }
        if (b.bottom > H) sub.style.top = `${Math.max(4, H - b.height - 4)}px`;
      });
    } else {
      row.addEventListener('mouseenter', () => m.querySelectorAll(':scope > .menu-popup').forEach(s => s.remove()));
    }
    // (the keyboard on a menu's entry, #4761: → opens its submenu on its first entry, ← goes back to the menu above,
    // Enter or Space runs it)
    row.addEventListener('keydown', e => {
      if (e.target !== row) return;
      const k = e.key;
      if (it.submenu && (k === 'ArrowRight' || k === 'Enter' || k === ' ')) { row.dispatchEvent(new Event('mouseenter')); if (sub) moveIn(sub, 0); }
      else if ((k === 'Enter' || k === ' ') && !disabled) row.click();
      else if (k === 'ArrowLeft' && m.classList.contains('sub')) { const up = m.parentElement.querySelector(':scope > .mi[aria-expanded="true"]'); m.remove(); up?.setAttribute('aria-expanded', 'false'); up?.focus(); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') { const bar = document.querySelector('.menubar .item.open'); if (!bar) return; e.preventDefault(); e.stopPropagation(); stepBar(bar, k === 'ArrowRight' ? 1 : -1, true); return; }
      else if ({ ArrowDown: 1, ArrowUp: 1, Home: 1, End: 1 }[k]) moveIn(m, { ArrowDown: 'next', ArrowUp: 'prev', Home: 0, End: 'last' }[k]);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    if (!disabled && it.action) row.addEventListener('click', e => {
      e.stopPropagation(); closeMenus();
      Promise.resolve().then(() => runAction(it.label, it.action)).catch(err => { console.error(err); message(`${it.label}: ${err.message || err}`, 'error'); });
    });
    m.append(row);
  }
  return m;
}

// ------------------------------------------------------------------ long press: the right-click menus on touch (#263)
// iPadOS Safari fires no 'contextmenu' on a long press (only with a mouse or trackpad), so a press
// of a finger or a pen held still for LP_DELAY ms over an element wired here dispatches the same
// 'contextmenu' event at the press's point, on the element pressed (its listener, or an outer one,
// shows the menu as a right-click does). A press that moves more than LP_SLOP px (a drag, a scroll)
// or ends sooner (a tap) is left alone; the click (and the mouse events) of the release are
// swallowed; a browser that fires its own 'contextmenu' (Android) shows one menu, not two. The mouse
// is not concerned: the desktop's right-click stays as it is.
//   longPressMenu(el)                       el, its own callout and text selection off
//   longPressMenu(el, { select: true })     text kept selectable (a text editor)
const LP_DELAY = 500, LP_SLOP = 8;
let lpPress = null;      // the press being timed: { ev, id, x, y, timer, fired }
let lpSwallow = 0;       // until when (ms) the release's click / mouse events are swallowed
export function longPressMenu(el, { select = false } = {}) {
  if (!el || el.longPressMenu) return el;
  el.longPressMenu = true;
  if (!select) { el.style.webkitTouchCallout = 'none'; el.style.webkitUserSelect = 'none'; el.style.userSelect = 'none'; }
  el.addEventListener('pointerdown', lpDown);
  return el;
}
function lpDown(e) {
  if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || !e.isPrimary) return;
  if (lpPress?.ev === e) return;          // timed already by an element inside this one
  lpCancel();
  const target = e.target, x = e.clientX, y = e.clientY;
  const p = lpPress = { ev: e, id: e.pointerId, x, y, fired: false };
  p.timer = setTimeout(() => {
    if (lpPress !== p) return;
    p.fired = true;
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, view: window, button: 2, clientX: x, clientY: y, screenX: e.screenX, screenY: e.screenY }));
  }, LP_DELAY);
}
function lpCancel() { if (lpPress) clearTimeout(lpPress.timer); lpPress = null; }
function lpEnd(e) {
  if (lpPress?.id !== e.pointerId) return;
  if (lpPress.fired && e.type === 'pointerup') lpSwallow = Date.now() + 700;
  lpCancel();
}
addEventListener('pointerdown', () => { lpSwallow = 0; }, true);
addEventListener('pointermove', e => {
  if (lpPress?.id === e.pointerId && !lpPress.fired && Math.hypot(e.clientX - lpPress.x, e.clientY - lpPress.y) > LP_SLOP) lpCancel();
}, true);
addEventListener('pointerup', lpEnd, true);
addEventListener('pointercancel', lpEnd, true);
for (const type of ['mousedown', 'mouseup', 'click']) {
  addEventListener(type, e => {
    if (Date.now() >= lpSwallow) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (type === 'click') lpSwallow = 0;
  }, true);
}
// the browser's own 'contextmenu' of a long press: before ours, ours is not needed; after, it is one too many
addEventListener('contextmenu', e => {
  if (!e.isTrusted || !lpPress) return;
  if (lpPress.fired) { e.preventDefault(); e.stopImmediatePropagation(); } else lpCancel();
}, true);

// ------------------------------------------------------------------ two fingers on a drawing: pan and pinch (#674)
// On a touch screen a second finger on `el` (a drawing's canvas) takes the gesture from the editor:
// cancel() undoes what the first finger started (a selection band, a move), then the fingers' centre
// moving pans the view, pan(dx, dy), and their spread changing zooms it about that centre, zoom(f, cx,
// cy) (client px). The fingers' events are the gesture's until the last one is lifted (the editor sees
// none of them, a finger left alone pans); one finger, the mouse and the pen stay the editor's own.
// Wired before the editor's own 'pointerdown' listener on `el` (a capture one: it comes first).
export function twoFingerView(el, { cancel, pan, zoom }) {
  const pts = new Map();     // the fingers down on el: pointerId → { x, y }
  let g = null;              // the gesture: its centre and spread as last applied
  let raf = 0;
  const measure = () => {
    const p = [...pts.values()], n = p.length;
    const x = p.reduce((s, q) => s + q.x, 0) / n, y = p.reduce((s, q) => s + q.y, 0) / n;
    return { x, y, d: n > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
  };
  // applied once a frame, from every finger's last point: each finger's move comes as an event of its own,
  // and a spread measured between them (one finger moved, not yet the other) would zoom in and out
  const apply = () => {
    cancelAnimationFrame(raf); raf = 0;
    if (!g || !pts.size) return;
    const m = measure();
    if (m.x !== g.x || m.y !== g.y) pan(m.x - g.x, m.y - g.y);
    if (m.d > 10 && g.d > 10 && m.d !== g.d) zoom(m.d / g.d, m.x, m.y);
    g = m;
  };
  const own = e => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
  const onMove = e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    own(e);
    raf ||= requestAnimationFrame(apply);
  };
  const onUp = e => {
    if (!pts.has(e.pointerId)) return;
    if (g) { own(e); apply(); }
    pts.delete(e.pointerId);
    if (g) g = pts.size ? measure() : null;
    if (!pts.size) unlisten();
  };
  const listen = () => { addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onUp, true); };
  const unlisten = () => { removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onUp, true); };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) { pts.clear(); g = null; }      // the first finger: none is down (one lifted unseen is forgotten)
    if (!pts.size) listen();
    if (g) apply();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size < 2) return;
    if (!g) { lpCancel(); cancel?.(); }
    g = measure();
    own(e);
  }, true);
  // Safari's own pinch (the page zoomed): touch-action: none says it already, its gesture events too
  el.addEventListener('gesturestart', e => e.preventDefault());
  return el;
}

// The menu bar (#4761): role menubar, its menus' names menuitems; the keyboard: F10 or Alt alone takes it (the focus
// back where it was when it leaves: Esc), ← → move between its menus, Enter, Space or ↓ opens one on its first entry,
// ← → in an open menu go to the menu beside it.
const barItems = item => [...item.parentElement.querySelectorAll(':scope > .item')].filter(x => x.getClientRects().length);
function stepBar(item, d, open) {
  const list = barItems(item), next = list[(list.indexOf(item) + d + list.length) % list.length];
  if (open) { next.dispatchEvent(new CustomEvent('menu-open')); return; }
  item.tabIndex = -1; next.tabIndex = 0; next.focus();
}
export function menuBar(el, menus) {
  el.classList.add('menubar');
  el.setAttribute('role', 'menubar');
  el.innerHTML = '';
  for (const menu of menus) {
    const item = h('div', { class: 'item', 'data-menu': menu.label, role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', tabindex: '-1' }, menu.label);   // (its name, whatever the language: #1217)
    const open = () => {
      const back = menuReturn;
      menuReturn = null;
      closeMenus();
      menuReturn = back;
      item.classList.add('open');
      item.setAttribute('aria-expanded', 'true');
      const r = item.getBoundingClientRect();
      openMenu = buildMenu(typeof menu.items === 'function' ? menu.items() : menu.items);
      openMenu.style.left = `${r.left}px`; openMenu.style.top = `${r.bottom}px`;
      document.body.append(openMenu);
      // (kept inside the window too, #767: the last menus of the bar on a narrow window)
      const b = openMenu.getBoundingClientRect();
      if (b.right > window.innerWidth) openMenu.style.left = `${Math.max(4, window.innerWidth - b.width - 4)}px`;
    };
    item.addEventListener('mousedown', e => { e.preventDefault(); if (item.classList.contains('open')) closeMenus(); else open(); });
    item.addEventListener('mouseenter', () => { if (openMenu && !item.classList.contains('open')) open(); });
    // (from the keyboard: opened on its first entry)
    item.addEventListener('menu-open', () => { open(); menuReturn = barReturn || menuReturn; item.tabIndex = 0; moveIn(openMenu, 0); });
    item.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') stepBar(item, k === 'ArrowRight' ? 1 : -1, false);
      else if (k === 'Enter' || k === ' ' || k === 'ArrowDown') item.dispatchEvent(new CustomEvent('menu-open'));
      else if (k === 'Escape' || k === 'Tab') { if (k === 'Escape') e.preventDefault(); leaveBar(item); return; }
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    el.append(item);
  }
}
// the keyboard leaves the menu bar: the focus back where it was
function leaveBar(item) {
  const back = barReturn;
  barReturn = null;
  item.tabIndex = -1;
  if (back) focusBack(back); else item.blur();
}
let barReturn = null, altAlone = false;
function enterBar() {
  const bar = document.querySelector('.menubar');
  const first = bar && barItems(bar.firstElementChild || bar)[0];
  if (!first || document.querySelector('.dlg-overlay')) return false;
  if (!document.activeElement?.closest?.('.menubar, .menu-popup')) barReturn = remember(document.activeElement);
  closeMenus();
  first.tabIndex = 0; first.focus();
  return true;
}
addEventListener('keydown', e => {
  altAlone = e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && enterBar()) e.preventDefault();
}, true);
addEventListener('keyup', e => { if (e.key === 'Alt' && altAlone) { altAlone = false; if (enterBar()) e.preventDefault(); } }, true);
addEventListener('pointerdown', () => { altAlone = false; }, true);
// (a command run from a menu the keyboard opened from the bar: the focus back where it was before the bar)
addEventListener('focusin', e => { if (barReturn && !e.target.closest?.('.menubar, .menu-popup') && e.target !== barReturn) barReturn = null; });

// ------------------------------------------------------------------ splitters
// Drag handle between two flex children; `target` is the element whose size changes. `size`: its size when a drag
// starts (else its own), `max` a number or a function (the room now), `onSize(px)`: called with each new size, before
// the window's resize (Simulate's side panel, whose width is #left's, #4627).
/** The side panel's splitter (#v-split, #left): its limits and its key, the tasks' all (Simulate's too, #4627). */
export const LEFT_SPLIT = { dir: 'h', min: 180, max: 700, storageKey: 'xl.leftW' };
export function splitter(handle, target, { dir = 'h', min = 80, max = 2000, invert = false, storageKey, size = null, onSize = null } = {}) {
  handle.classList.add('splitter', dir === 'h' ? 'split-h' : 'split-v');
  if (storageKey) {
    try { const v = localStorage.getItem(prefKey(storageKey)); if (v) target.style[dir === 'h' ? 'width' : 'height'] = v; } catch { /* storage unavailable */ }
  }
  // pointer events, so a finger drags it too (#264); the mouse's own default (a text selection, the
  // focus leaving the editor) stays prevented
  handle.addEventListener('mousedown', e => e.preventDefault());
  handle.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const start = dir === 'h' ? e.clientX : e.clientY;
    const size0 = size ? size() : dir === 'h' ? target.offsetWidth : target.offsetHeight;
    const top = typeof max === 'function' ? max() : max;
    document.body.classList.add(dir === 'h' ? 'resizing-h' : 'resizing-v');
    const mv = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const d = (dir === 'h' ? ev.clientX : ev.clientY) - start;
      const sz = Math.max(min, Math.min(top, size0 + (invert ? -d : d)));
      target.style[dir === 'h' ? 'width' : 'height'] = `${sz}px`;
      onSize?.(sz);
      dispatchEvent(new Event('resize'));
    };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-h', 'resizing-v');
      if (storageKey) { try { localStorage.setItem(prefKey(storageKey), target.style[dir === 'h' ? 'width' : 'height']); } catch { /* ignore */ } }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}

// action (optional): { label, run } — a button in the toast (e.g. Undo)
// (#4761: said by a screen reader, an error at once; kept while the pointer is over it or its button has the focus, then
// its time again)
export function toast(msg, kind = 'info', ms = 3000, action = null) {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: `toast toast-${kind}`, ...(kind === 'error' && { role: 'alert' }) }, msg);
  if (action) t.append(' ', h('button', { class: 'btn toast-action', onclick: () => { t.remove(); action.run(); } }, action.label));
  host.append(t);
  let timer = setTimeout(() => t.remove(), ms);
  const hold = () => { clearTimeout(timer); timer = 0; };
  const resume = () => { if (!timer && !t.matches(':hover') && !t.contains(document.activeElement)) timer = setTimeout(() => t.remove(), ms); };
  t.addEventListener('pointerenter', hold); t.addEventListener('focusin', hold);
  t.addEventListener('pointerleave', resume); t.addEventListener('focusout', () => setTimeout(resume));
}

export function downloadText(filename, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
