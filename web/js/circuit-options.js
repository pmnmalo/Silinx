// The circuit editor's options (web/js/circuit-editor.js): the toolbar's Keep connections (#4059, on by default) and Show
// inside (#4060, off by default), remembered; its ⋮ menu (#4064, #4080): Wires, Direct, Orthogonal or Curved (the
// circuit's wireStyle, an edit, Undo takes it back; disabled read-only) and Hop-overs (remembered, on by default, as the schematic's); the items the editor is
// given (`menuItems`: its HDL's language, #4063).
import { h } from './ui.js';
import { menuCheck, menuChoice, setChoice, toolbarMenu } from './toolbar-menu.js';
import { setWireStyle } from '/core/circuit-edit.js';

const pref = (key, dflt) => { try { const v = localStorage.getItem(key); return v == null ? dflt : v === '1'; } catch { return dflt; } };
const setPref = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* no storage */ } };

/** { keepBox, insideBox, more, keep(), inside(), hops(), sync() } of mountCircuitEditor (M(): its model; applyEdit(r)
 *  an edit; render()). sync(): the menu's ✓ as the circuit is (an undo). */
export function mountCircuitOptions({ M, readOnly, applyEdit, render, menuItems = [] }) {
  let keepOn = pref('silinx.circuit.keep', true), insideOn = pref('silinx.circuit.inside', false), hopsOn = pref('silinx.circuit.hops', true);
  const keepBox = h('input', { type: 'checkbox', class: 'circ-keep-in', checked: keepOn });
  keepBox.addEventListener('change', () => { keepOn = keepBox.checked; setPref('silinx.circuit.keep', keepOn); });
  const insideBox = h('input', { type: 'checkbox', class: 'circ-inside-in', checked: insideOn });
  insideBox.addEventListener('change', () => { insideOn = insideBox.checked; setPref('silinx.circuit.inside', insideOn); render(); });
  const wiresItems = menuChoice('Wires', [
    { value: 'direct', label: 'Direct', title: 'Each wire a straight line from point to point' },
    { value: 'orthogonal', label: 'Orthogonal', title: 'Each wire of horizontal and vertical segments' },
    { value: 'curved', label: 'Curved', title: 'Each wire a smooth curve through its bends, as a jumper wire' },
  ], { value: M().wireStyle || 'direct', onChange: (v) => applyEdit(setWireStyle(M(), v)) });
  if (readOnly) for (const it of wiresItems) if (it.tagName === 'BUTTON') it.disabled = true;
  const hopsItem = menuCheck('Hop-overs', { checked: hopsOn, title: 'Draw a small arc where two wires cross without joining',
    onChange: (on) => { hopsOn = on; setPref('silinx.circuit.hops', on); render(); } });
  // (and its HDL's language, #4063: drawing-lang-menu.js)
  const more = toolbarMenu([...wiresItems, hopsItem, ...menuItems], { title: menuItems.length ? 'Wires and language' : 'Wires', btnClass: 'asm-btn' });
  return { keepBox, insideBox, more, keep: () => keepOn, inside: () => insideOn, hops: () => hopsOn, sync: () => setChoice(wiresItems, M().wireStyle || 'direct') };
}
