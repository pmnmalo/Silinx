// The truth table's rows (#405: out of mountTtEditor in web/js/truthtable.js; #3939): every row drawn up to
// VIRTUAL_ROWS rows; a larger table (2^n rows, up to 16 inputs) scrolls in a box of its own, only the rows in view drawn
// (and a few around them), as it scrolls, between two spacers of the height of the rows left out.
import { h } from './ui.js';

const VIRTUAL_ROWS = 256;
const ROW_H = 20, AROUND = 20;   // (a row's height in a large table, its CSS's; the rows drawn above and below the view)

/** The table of model M in `host`: its rows, output `out` selected; select(o) and cycle(o, r) on a click. */
export function renderTtTable(host, { M, out, select, cycle }) {
  const n = M.inputs.length, rows = 2 ** n, big = rows > VIRTUAL_ROWS;
  const head = h('tr', {}, h('th', { class: 'tt-idx' }, '#'), ...M.inputs.map(v => h('th', { class: 'tt-in' }, v)),
    ...M.outputs.map(o => h('th', { class: `tt-out${o === out ? ' sel' : ''}`, title: 'Select this output', onclick: () => select(o) }, o)));
  const row = r => {
    const bits = r.toString(2).padStart(n, '0');
    return h('tr', {}, h('td', { class: 'tt-idx' }, String(r)), ...[...bits].map(b => h('td', { class: 'tt-in' }, b)),
      ...M.outputs.map(o => {
        const c = M.table[o][r];
        return h('td', { class: `tt-cell v${c}${o === out ? ' sel' : ''}`, 'data-out': o, 'data-row': String(r), onclick: () => cycle(o, r) }, c);
      }));
  };
  const t = h('table', { class: `tt-table${big ? ' tt-virtual' : ''}`, 'data-no-i18n': '' }, h('thead', {}, head));
  const body = h('tbody');
  t.append(body);
  host.classList.toggle('tt-table-scroll', big);
  const top = host.scrollTop;
  host.innerHTML = '';
  host.append(t);
  const spacer = height => h('tr', { class: 'tt-spacer', style: { height: `${height}px` } }, h('td', { colspan: String(1 + n + M.outputs.length) }));
  const draw = (at = host.scrollTop) => {
    const from = big ? Math.max(0, Math.floor(at / ROW_H) - AROUND) : 0;
    const to = big ? Math.min(rows, from + Math.ceil((host.clientHeight || 600) / ROW_H) + 2 * AROUND) : rows;
    body.innerHTML = '';
    if (from) body.append(spacer(from * ROW_H));
    for (let r = from; r < to; r++) body.append(row(r));
    if (to < rows) body.append(spacer((rows - to) * ROW_H));
  };
  host.onscroll = big ? () => { if (!host._ttFrame) host._ttFrame = requestAnimationFrame(() => { host._ttFrame = 0; draw(); }); } : null;
  draw(top);   // (drawn again where it was: its rows first, then its scroll, which an empty table would clamp)
  if (big) host.scrollTop = top;
}
