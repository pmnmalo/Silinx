// The Design pane's rows of a palette symbol built of others (#4984, #4806): the block an adder, a multiplexer, a
// counter… of a schematic is in its generated HDL (its own entity, marked with what it was drawn as: core/schdoc-hdl.js
// blockMarkOf) is shown as its composition, ADD8 of two ADD4 of four FA1, not as that HDL; each row opens the
// composition at its level (web/js/sch-composition.js).
import { blockMarkOf } from '/core/schdoc.js';
import { composition } from '/core/symlib.js';
import { S } from './app.js';

/** The palette symbol module `info` (moduleInfo's) is the block of, when it has a composition: { type, params, comp }. */
export function compositionOf(info) {
  if (!info || !/\.(vhdl?|v)$/i.test(info.file || '')) return null;
  const text = S.sources?.find(s => s.path === info.file)?.text;
  const blk = text ? blockMarkOf(text, info.name) : null;
  const comp = blk ? composition(blk.type, blk.params) : null;
  return comp ? { ...blk, comp } : null;
}

/**
 * The rows of a composition under `parentUl`: the symbol's own (`instName` - ADD8), then its levels' instances (U1 -
 * ADD4, U0 - FA1 …), each one opening the composition at its level. treeItem: the Design pane's; select: what selecting
 * a row selects (the block's module, as its own row did).
 */
export function compositionRows(parentUl, { blk, instName, path, depth, treeItem, select }) {
  const { comp } = blk;
  const levelOf = name => comp.modules.find(m => m.name === name);
  const open = at => import('./sch-composition.js').then(m => m.openComposition({ type: blk.type, params: blk.params }, null, at));
  const add = (ul, module, label, at, key, d) => {
    const kids = levelOf(module).doc.symbols.filter(s => s.type === 'module');
    const it = treeItem({
      label, meta: '(composition)', ico: 'schematic', key, open: d < 2, module,
      badges: [{ text: 'Composition', base: true, title: 'How it is built, down to the gates (read-only)', open: () => open(at) }],
      onSelect: select, onOpen: () => open(at),
    });
    ul.append(it.li);
    if (!kids.length) it.setLeaf();
    for (const s of [...kids].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) add(it.ul, s.params.module, `${s.name} - ${s.params.module}`, [...at, s.name], `${key}/${s.name}`, d + 1);
  };
  add(parentUl, comp.top, instName ? `${instName} - ${comp.symbol}` : comp.symbol, [], `m:${path}`, depth);
}
