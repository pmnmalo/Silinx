// A document's selection in live sharing (#4192): this page's own, as its view sends it (core/collab-select.js), and
// the followed participant's, drawn in their presence colour without changing this page's own selection:
// - a text editor (HDL, C, C++): its ranges (editor-peer-sel.js);
// - a drawing (a schematic, a state diagram, an ASM chart, a Petri net, a circuit, a truth table, a symbol): each
//   object selected, found by its 'kind:id' (its group's data-kind and data-id, or the attribute its editor gives it),
//   marked data-peer-sel and glowing in --peer-sel (app.css); marked again when the editor draws itself again (a
//   MutationObserver on its document), an object deleted meanwhile not drawn.
// A truth table's look (#4193: its SOP / POS, its map and Quine-McCluskey's steps shown, the output in front) is
// followed, not drawn: its editor's setLook.
import { liveItems } from '/core/collab-select.js';

/** A document's drawing editor (null: a text editor's document, or none). */
const drawingEditorOf = d => d?.schEditor || d?.fsmEditor || d?.asmEditor || d?.petriEditor || d?.circuitEditor || d?.ttEditor || d?.symEditor || null;

/** This page's selection in a document, as its view sends it (null: none). */
export function selectionOfDoc(d) {
  try { return (d?.editor?.sharedSelection || drawingEditorOf(d)?.sharedSelection)?.() ?? null; } catch { return null; }
}

// an item's object in the document (the attribute its editor gives it; else its group's data-kind and data-id)
const ATTR = { state: 'data-state', trans: 'data-trans', node: 'data-node', edge: 'data-edge', pin: 'data-pin', out: 'data-out' };
function find(root, item) {
  const i = item.indexOf(':'), kind = item.slice(0, i), id = item.slice(i + 1);
  const sel = ATTR[kind] ? `[${ATTR[kind]}="${CSS.escape(id)}"]` : `[data-kind="${CSS.escape(kind)}"][data-id="${CSS.escape(id)}"]`;
  return root.querySelector(kind === 'out' ? `.tt-tab${sel}` : sel);
}

const marks = new WeakMap();   // document -> { list, observer, marked: Set<Element> }

/** The followed participants' selections in a document: [{ name, color, sel }] ([]: none shown). */
export function showPeerSelection(d, list) {
  if (!d) return;
  if (d.editor?.setPeerSelection) { d.editor.setPeerSelection(list); return; }
  const ed = drawingEditorOf(d), root = d.el;
  if (!ed || !root) return;
  const look = list.find(p => p.sel?.look)?.sel.look;
  if (look && ed.setLook) ed.setLook(look, list.find(p => p.sel?.look).sel.items);
  let m = marks.get(d);
  const key = JSON.stringify(list.map(p => [p.color, p.sel?.items || []]));
  if (m?.key === key) return;
  if (!m) {
    m = { key: '', list: [], marked: new Set(), observer: null };
    marks.set(d, m);
  }
  m.key = key;
  m.list = list.filter(p => p.sel?.items?.length);
  apply(root, m);
  if (m.list.length && !m.observer) {
    m.observer = new MutationObserver(() => apply(root, m));
    m.observer.observe(root, { childList: true, subtree: true });
  } else if (!m.list.length && m.observer) { m.observer.disconnect(); m.observer = null; }
}

function apply(root, m) {
  const now = new Set();
  for (const p of m.list) {
    for (const item of liveItems(p.sel, x => !!find(root, x))) {
      const el = find(root, item);
      now.add(el);
      if (el.getAttribute('data-peer-sel') !== p.name) el.setAttribute('data-peer-sel', p.name);
      if (el.style.getPropertyValue('--peer-sel') !== p.color) el.style.setProperty('--peer-sel', p.color);
    }
  }
  for (const el of m.marked) if (!now.has(el)) { el.removeAttribute('data-peer-sel'); el.style.removeProperty('--peer-sel'); }
  m.marked = now;
}
