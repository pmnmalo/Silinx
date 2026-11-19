// The side panel's tabs with no project open (#4625): Start and Collaboration (#4619) both whole, their icon and name,
// sharing the row (#left-tabs[data-fit], web/css/app.css), so that the user sees that there are two; where the row is too
// narrow for both names (a narrow panel, a longer language), the tabs as with a project: the active one whole, the other
// its icon (the Silinx interface) or its name cut (the ISE style). A row of tabs only (not the Silinx interface's
// activity bar, a column). Measured again when the row's width, the project, the interface or the language changes.
import { onLanguageChange } from './i18n.js';

/** Whether the row's tabs are drawn whole and sharing it: set, measured, and taken back when something does not fit. */
function fitLeftTabs() {
  const row = document.getElementById('left-tabs');
  if (!row) return;
  const root = document.documentElement;
  if (!root.hasAttribute('data-no-project') || getComputedStyle(row).flexDirection !== 'row') { delete row.dataset.fit; return; }
  row.dataset.fit = '';
  const shown = [...row.querySelectorAll('.tab')].filter(t => t.getClientRects().length);
  const over = row.scrollWidth > row.clientWidth + 1
    || shown.some(t => { const l = t.querySelector('.tab-lbl'); return !l || l.scrollWidth > l.clientWidth + 1 || t.scrollWidth > t.clientWidth + 1; });
  if (over) delete row.dataset.fit;
}

/** Measured now, and again on the row's resize, a project opened or closed, the interface's or the layout's change, a tab
 *  shown or hidden (the Collaboration tab with no git), the language. */
export function watchLeftTabs() {
  const row = document.getElementById('left-tabs');
  if (!row) return;
  let queued = false;
  const again = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fitLeftTabs(); }); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(again).observe(row);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(again).observe(document.documentElement, { attributes: true, attributeFilter: ['data-no-project', 'data-ui', 'data-layout', 'data-task', 'lang'] });
    new MutationObserver(again).observe(row, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class'] });
  }
  onLanguageChange(again);
  fitLeftTabs();
}
