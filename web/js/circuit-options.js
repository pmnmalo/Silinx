// The circuit editor's options (web/js/circuit-editor.js): the toolbar's Keep connections (#4059, on by default) and Show
// inside (#4060, off by default), remembered; its ⋮ menu (#4064): Curved wires (the circuit's wireStyle, an edit, Undo
// takes it back; disabled read-only) and Hop-overs (remembered, on by default, as the schematic's).
import { h } from './ui.js';
import { menuCheck, setChecked, toolbarMenu } from './toolbar-menu.js';
import { setWireStyle } from '/core/circuit-edit.js';

const pref = (key, dflt) => { try { const v = localStorage.getItem(key); return v == null ? dflt : v === '1'; } catch { return dflt; } };
const setPref = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* no storage */ } };

/** { keepBox, insideBox, more, keep(), inside(), hops(), sync() } of mountCircuitEditor (M(): its model; applyEdit(r)
 *  an edit; render()). sync(): the menu's ✓ as the circuit is (an undo). */
export function mountCircuitOptions({ M, readOnly, applyEdit, render }) {
  let keepOn = pref('silinx.circuit.keep', true), insideOn = pref('silinx.circuit.inside', false), hopsOn = pref('silinx.circuit.hops', true);
  const keepBox = h('input', { type: 'checkbox', class: 'circ-keep-in', checked: keepOn });
  keepBox.addEventListener('change', () => { keepOn = keepBox.checked; setPref('silinx.circuit.keep', keepOn); });
  const insideBox = h('input', { type: 'checkbox', class: 'circ-inside-in', checked: insideOn });
  insideBox.addEventListener('change', () => { insideOn = insideBox.checked; setPref('silinx.circuit.inside', insideOn); render(); });
  const curvedItem = menuCheck('Curved wires', { checked: M().wireStyle === 'curved', title: 'Draw the wires as smooth curves through their bends, as jumper wires (the connections the same)',
    onChange: (on) => applyEdit(setWireStyle(M(), on ? 'curved' : 'straight')) });
  if (readOnly) curvedItem.disabled = true;
  const hopsItem = menuCheck('Hop-overs', { checked: hopsOn, title: 'Draw a small arc where two wires cross without joining',
    onChange: (on) => { hopsOn = on; setPref('silinx.circuit.hops', on); render(); } });
  const more = toolbarMenu([curvedItem, hopsItem], { title: 'Wires', btnClass: 'asm-btn' });
  return { keepBox, insideBox, more, keep: () => keepOn, inside: () => insideOn, hops: () => hopsOn, sync: () => setChecked(curvedItem, M().wireStyle === 'curved') };
}
