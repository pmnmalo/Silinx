// The followed participant's text selection in a text editor (#4192, HDL, C, C++): each of its ranges marked in their
// presence colour (its caret: editor-peers.js), under the page's own selection, which it never changes. Positions are
// 0-based [anchorLine, anchorCh, headLine, headCh] (core/collab-select.js), kept inside the text; a change of the
// text moves them with it until they come again.
import { StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { clampRange } from '/core/collab-select.js';

const setSelEffect = StateEffect.define();

export const peerSelField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    let d = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setSelEffect)) continue;
      const marks = [];
      for (const { color, from, to } of e.value) {
        if (from === to) continue;
        marks.push(Decoration.mark({ class: 'cm-peer-sel', attributes: { style: `background-color: ${color}40; outline: 1px solid ${color}80` } }).range(from, to));
      }
      d = Decoration.set(marks, true);
    }
    return d;
  },
  provide: f => EditorView.decorations.from(f),
});

/** An editor's own selection, as it is sent: { ranges: [[anchorLine, anchorCh, headLine, headCh], …] } (the main one
 *  first). */
export function textSelection(view) {
  const st = view.state, pos = off => { const l = st.doc.lineAt(off); return [l.number - 1, off - l.from]; };
  const rs = st.selection.ranges, main = st.selection.mainIndex;
  const order = [rs[main], ...rs.filter((_, i) => i !== main)];
  return { ranges: order.map(r => [...pos(r.anchor), ...pos(r.head)]) };
}

/** An editor's setPeerSelection([{ name, color, sel }]): the ranges marked, drawn again only when they change. */
export function peerSelSetter(view) {
  let shown = '[]';
  return list => {
    const k = JSON.stringify(list);
    if (k === shown) return;
    shown = k;
    const v = view(), doc = v.state.doc;
    const off = ({ line, ch }) => doc.line(line + 1).from + ch;
    const ranges = [];
    for (const p of list) {
      for (const r of p.sel?.ranges || []) {
        const [a, b] = clampRange(r, doc.lines, i => doc.line(i + 1).length).map(off);
        ranges.push({ color: p.color, from: Math.min(a, b), to: Math.max(a, b) });
      }
    }
    v.dispatch({ effects: setSelEffect.of(ranges) });
  };
}
