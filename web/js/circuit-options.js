// The circuit editor's options (web/js/circuit-editor.js): the toolbar's Keep connections (#4059, on by default) and Show
// inside (#4060, off by default), remembered; its ⋮ menu (#4064, #4080): Wires, Direct, Orthogonal or Curved (the
// circuit's wireStyle, core/wire-style.js as the schematic's, Direct its default; an edit, Undo takes it back; read only
// or in a shared project, #4239: the viewer's own, the circuit untouched) and Wire crossings: Hop-overs or Plain crossings (#4101; remembered, hop-overs by default, as the
// schematic's). No HDL Language (#4168: its Source Properties choose it).
import { h } from './ui.js';
import { menuCheck, menuChoice, setChoice, toolbarMenu } from './toolbar-menu.js';
import { setWireStyle } from '/core/circuit-edit.js';
import { crossingsChoice } from './wire-crossings.js';
import { WIRE_STYLES, WIRE_STYLE_TITLE, wireStyleOf } from '/core/wire-style.js';

const pref = (key, dflt) => { try { const v = localStorage.getItem(key); return v == null ? dflt : v === '1'; } catch { return dflt; } };
const setPref = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* no storage */ } };

/** { keepBox, insideBox, more, keep(), inside(), hops(), sync(), style(), setStyle(s), setOwn(on) } of mountCircuitEditor (M(): its model; applyEdit(r)
 *  an edit; render()). sync(): the menu's ✓ as the circuit is (an undo). */
export function mountCircuitOptions({ M, readOnly, applyEdit, render }) {
  let keepOn = pref('silinx.circuit.keep', true), insideOn = pref('silinx.circuit.inside', false), hopsOn = pref('silinx.circuit.hops', true);
  const keepBox = h('input', { type: 'checkbox', class: 'circ-keep-in', checked: keepOn });
  keepBox.addEventListener('change', () => { keepOn = keepBox.checked; setPref('silinx.circuit.keep', keepOn); });
  const insideBox = h('input', { type: 'checkbox', class: 'circ-inside-in', checked: insideOn });
  insideBox.addEventListener('change', () => { insideOn = insideBox.checked; setPref('silinx.circuit.inside', insideOn); render(); });
  const TITLES = { direct: 'Each wire a straight line from point to point', orthogonal: 'Each wire of horizontal and vertical segments',
    curved: 'Each wire a smooth curve through its bends, as a jumper wire' };
  // (read only, or a shared project's participant, #4239 (own): the viewer's own choice, the circuit untouched)
  let own = readOnly, viewStyle = null;
  const style = () => (own && viewStyle !== null ? viewStyle : wireStyleOf(M(), 'direct'));
  const setStyle = (v) => { if (v === style()) return; if (own) { viewStyle = v; render(); } else applyEdit(setWireStyle(M(), v)); };
  const wiresItems = menuChoice(WIRE_STYLE_TITLE, WIRE_STYLES.map((s) => ({ value: s.id, label: s.label, title: TITLES[s.id] })),
    { value: style(), onChange: setStyle });
  // (Wire crossings: Hop-overs, Plain crossings, a choice as the schematic's, #4101)
  const crossings = crossingsChoice(hopsOn, (on) => { hopsOn = on; setPref('silinx.circuit.hops', on); render(); });
  const more = toolbarMenu([...wiresItems, ...crossings], { title: 'Wires', btnClass: 'asm-btn' });
  return { keepBox, insideBox, more, keep: () => keepOn, inside: () => insideOn, hops: () => hopsOn, sync: () => setChoice(wiresItems, style()),
    style, setStyle, setOwn: (on) => { own = readOnly || !!on; } };
}
