// The circuit editor's toolbar (#3897, docs/UI-GUIDELINES.md): the tools (select, wire), Rotate, Delete, the zoom, Check,
// Try it (and Reset while trying it), the ☰ Properties toggle (no Print of its own: the main toolbar's prints it); the
// status line of its counts and, while simulating, its time.
import { h } from './ui.js';
import { toolIcon, toolWide, zoomTools } from './editor-icons.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { statusLine } from './status-line.js';

/** { tools, delBtn, rotBtn, checkBtn, simBtn, resetBtn, zoomLbl, info, toolbar } of mountCircuitEditor. */
export function mountCircuitToolbar(ctx) {
  const { root, btn, sep, setTool, deleteSelection, rotateSelection, check, toggleSim, resetSim, zoomBtn, fit } = ctx;
  const tools = {
    select: toolIcon('select', 'select', 'Select and move (drag the background to pan, wheel to zoom)', () => setTool('select'), 'circ-tool'),
    wire: toolWide('wire', 'Wire', 'Draw a wire: click its start, its bends, then its end on a pin or a hole (double click or Esc: end it there)', () => setTool('wire'), 'circ-tool'),
  };
  const rotBtn = toolIcon('rotate', 'rotate', 'Turn the selected part a quarter clockwise (R)', () => rotateSelection(), 'circ-edit');
  const delBtn = toolIcon('delete', 'del', 'Delete the selection (Del)', () => deleteSelection(), 'asm-danger');
  const checkBtn = toolWide('check', 'Check', 'Check the circuit: short circuits, unpowered ICs, floating inputs, parts and wires that join nothing', () => check(), 'circ-check');
  const simBtn = toolWide('sim', 'Try it', 'Try it: click a switch to flip it, press a button to hold it; the LEDs and each pin\'s level show the circuit working', () => toggleSim(), 'circ-sim-btn');
  const resetBtn = btn('↺ Reset', 'Start the simulation again from time 0', () => resetSim(), 'circ-reset');
  resetBtn.hidden = true;
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  const info = statusLine();
  const toolbar = h('div', { class: 'asm-toolbar circ-toolbar' },
    h('div', { class: 'asm-group' }, ...Object.values(tools)), sep(),
    h('div', { class: 'asm-group' }, rotBtn, delBtn), sep(),
    h('div', { class: 'asm-group' }, ...zoomTools((f) => zoomBtn(f), () => fit()), zoomLbl), sep(),
    h('div', { class: 'asm-group' }, checkBtn), sep(),
    h('div', { class: 'asm-group' }, simBtn, resetBtn),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })));
  return { tools, delBtn, rotBtn, checkBtn, simBtn, resetBtn, zoomLbl, info, toolbar };
}
