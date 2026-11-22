// A phone's screen (#5121): under 600 px wide (PHONE_QUERY of web/js/narrow.js) one pane at a time, the whole
// width and height: the side panel (Start, Design, Files… and the Processes; Simulate's and Emulate's), the
// document in front, or the console. A bar of three buttons at the bottom (#phone-panes, above the Silinx
// interface's task tabs) switches them; the pane shown is <html data-pane="side|doc|console">, its look
// web/css/phone.css (nothing on a wider screen, where the attribute is ignored). The pane follows what the
// user does: a project opened or closed shows the side panel (its Design or Start page), a document opened or
// brought to the front shows it, a task chosen (Simulate, Emulate, Implement) shows its document, or its side panel
// when it has none yet (what to simulate, the emulator's processes: #task-empty shown); a new error or
// warning marks the Console button (a dot) until the console is shown or no error or warning is left. The side
// panel replaces the drawer of the narrow screen (web/js/narrow.js), and the Silinx interface's Layout buttons
// (fold, messages, maximize).

import { h } from './ui.js';
import { icons } from './icons.js';
import { isPhone, PHONE_QUERY } from './narrow.js';

const PANES = ['side', 'doc', 'console'];
const LABEL = { side: 'Panels', doc: 'Document', console: 'Console' };
const ICON = { side: icons.mPanel, doc: icons.file, console: icons.console };

const root = () => document.documentElement;
/** The pane shown on a phone: 'side', 'doc' or 'console'. */
const phonePane = () => (PANES.includes(root().dataset.pane) ? root().dataset.pane : 'side');

/** Shows `pane` ('side', 'doc' or 'console'): the attribute set on every screen, only a phone's reading it. */
function setPane(pane) {
  if (!PANES.includes(pane)) return;
  root().dataset.pane = pane;
  for (const b of document.querySelectorAll('#phone-panes [data-pane]')) {
    const on = b.dataset.pane === pane;
    b.setAttribute('aria-pressed', String(on));
    if (on) b.classList.remove('news');
  }
}

/** On a phone, shows `pane`; on a wider screen nothing. */
function phoneShow(pane) { if (isPhone()) setPane(pane); }

/** The bar of panes and what switches them; once, at start-up (after the drawer, web/js/app.js). */
export function initPhone() {
  if (document.getElementById('phone-panes')) return;
  const button = (p) => h('button', { type: 'button', class: 'phone-pane', 'data-pane': p, title: LABEL[p], 'aria-pressed': 'false' },
    h('span', { class: 'ico-inline', html: ICON[p] }), h('span', { class: 'lbl' }, LABEL[p]));
  const bar = h('nav', { id: 'phone-panes', 'aria-label': 'Panes' }, ...PANES.map(button));
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) setPane(b.dataset.pane); });
  document.getElementById('console-wrap').after(bar);
  setPane(phonePane());
  addEventListener('silinx:project-opened', () => phoneShow('side'));
  addEventListener('silinx:project-closed', () => phoneShow('side'));
  addEventListener('silinx:doc-activated', (e) => { if (!e.detail?.background) phoneShow('doc'); });
  // a task chosen in the Silinx interface: its document (the waves, the board, the summary), or its side panel where it
  // starts when it has none; Design keeps the pane
  let task = root().dataset.task;
  new MutationObserver(() => {
    const t = root().dataset.task;
    if (t !== task && t && t !== 'edit') phoneShow(document.querySelector('#task-empty:not([hidden])') ? 'side' : 'doc');
    task = t;
  }).observe(root(), { attributes: true, attributeFilter: ['data-task'] });
  // a new error or warning: the Console button marked while the console is not shown, until it is or none is left
  const mark = bar.querySelector('[data-pane="console"]');
  document.addEventListener('silinx:console-problems', () => { if (phonePane() !== 'console') mark.classList.add('news'); });
  const counts = ['err-count', 'warn-count'].map((id) => document.getElementById(id)).filter(Boolean);
  new MutationObserver(() => { if (counts.every((c) => !c.textContent)) mark.classList.remove('news'); })
    .observe(document.getElementById('console-tabs') || document.body, { childList: true, subtree: true, characterData: true });
  globalThis.matchMedia?.(PHONE_QUERY).addEventListener?.('change', () => setPane(phonePane()));
}
