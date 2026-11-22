// The properties of a module's instance out of date (#1183, core/schdoc-modsym.js): what its module changed in its
// ports, Update Symbol (this instance) and Update All (every out-of-date instance of the module in this schematic);
// Update Symbol of its right-click menu too (sch-context.js, #3791).
import { symbolDiff, symbolUpdateNote, updateModuleSymbols } from '/core/schdoc.js';
import { h } from './dom.js';

// the instances of the module of `s` out of date in this schematic
const staleOf = (s, doc, modules) => doc().symbols.filter(x => x.type === 'module' && x.params.module === s.params.module && symbolDiff(x, modules()));

/** Update Symbol of the instance `s` (all: Update All, every out-of-date instance of its module): one edit, its console
 *  line saying what it did, a warning when a pin is left unconnected (the Properties' buttons and the right-click menu's
 *  item, #3791, #5277). */
export function updateSymbol(s, { doc, modules, edit, message }, all = false) {
  let r;
  edit(() => { r = updateModuleSymbols(doc(), modules(), all ? staleOf(s, doc, modules).map(x => x.id) : [s.id]); });
  const { text, warn } = symbolUpdateNote(r);
  message(warn ? `WARNING: ${text}` : text);
}

/** The note and the buttons for the instance `s` (none when it is up to date, or the view read-only). */
export function staleSection(s, { readOnly, doc, modules, edit, message }) {
  const od = !readOnly && symbolDiff(s, modules());
  if (!od) return [];
  const what = [od.added.length && `added ${od.added.join(', ')}`, od.removed.length && `removed ${od.removed.join(', ')}`,
    od.turned.length && `direction changed ${od.turned.join(', ')}`].filter(Boolean).join('; ');
  const stale = () => staleOf(s, doc, modules);
  const update = all => updateSymbol(s, { doc, modules, edit, message }, all);
  const others = stale().length - 1;
  // (its symbol's layout changed, #3755: Symbol Editor)
  const why = what ? `module '${s.params.module}' changed its ports (${what})` : `module '${s.params.module}' has a new symbol`;
  return [h('div', { class: 'se-note se-stale' }, h('span', { text: `The symbol is out of date: ${why}.` })),
    h('div', { class: 'se-pbtns' }, h('button', { class: 'btn se-update', type: 'button', text: 'Update Symbol', onclick: () => update(false) }),
      others > 0 ? h('button', { class: 'btn se-update-all', type: 'button', text: `Update All (${others + 1})`, onclick: () => update(true) }) : null)];
}
