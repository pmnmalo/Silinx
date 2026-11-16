// The circuit editor's toolbar (#3897, docs/UI-GUIDELINES.md): the tools (select, wire), Rotate, Delete, the zoom, Keep
// connections (#4059, as the schematic's: remembered, on by default), Show inside (#4060, remembered), Check,
// Try it (its Reset and Stop on the Try it bar, #4067), the ☰ Properties toggle (no Print of its own: the main toolbar's prints it); the
// status line of its counts and, while simulating, its time; the ⋮ menu (#4064, #4080: Wires, Wire crossings).
import { h } from './ui.js';
import { toolIcon, toolWide, zoomTools } from './editor-icons.js';
import { panelToggle, PROPS_KEY, CIRCUIT_PARTS_KEY } from './narrow.js';
import { statusLine } from './status-line.js';

/** { tools, delBtn, rotBtn, checkBtn, simBtn, zoomLbl, info, toolbar } of mountCircuitEditor. */
export function mountCircuitToolbar(ctx) {
  const { root, btn, sep, setTool, deleteSelection, rotateSelection, check, toggleSim, zoomBtn, fit, keepBox, insideBox, more } = ctx;
  const tools = {
    select: toolIcon('select', 'select', 'Select and move (drag the background to pan, wheel to zoom)', () => setTool('select'), 'circ-tool'),
    wire: toolWide('wire', 'Wire', 'Draw a wire: click its start on a pin or a hole, then its end (the points between: where it goes through); it is made in the ⋮ menu\'s wire style, routed when Orthogonal (double click or Esc: end it there)', () => setTool('wire'), 'circ-tool'),
  };
  const rotBtn = toolIcon('rotate', 'rotate', 'Turn the selected part a quarter clockwise (R)', () => rotateSelection(), 'circ-edit');
  const delBtn = toolIcon('delete', 'del', 'Delete the selection (Del)', () => deleteSelection(), 'asm-danger');
  const checkBtn = toolWide('check', 'Check', 'Check the circuit: short circuits, unpowered ICs, floating inputs, parts and wires that join nothing', () => check(), 'circ-check');
  const simBtn = toolWide('sim', 'Try it', 'Try it: click a switch to flip it, press a button to hold it; the LEDs and each pin\'s level show the circuit working', () => toggleSim(), 'circ-sim-btn try-btn');
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  const info = statusLine();
  const toolbar = h('div', { class: 'asm-toolbar circ-toolbar' },
    h('div', { class: 'asm-group' }, ...Object.values(tools)), sep(),
    h('div', { class: 'asm-group' }, rotBtn, delBtn), sep(),
    h('div', { class: 'asm-group' }, ...zoomTools((f) => zoomBtn(f), () => fit()), zoomLbl), sep(),
    h('div', { class: 'asm-group circ-keep-group' }, h('label', { class: 'circ-opt circ-keep', title: 'Moving or turning a part: its wires\' ends follow its pins and holes, or stay where they are (a breadboard always carries the parts on it)' },
      keepBox, h('span', {}, 'Keep connections')),
      // (Show inside, #4060: the ICs' gates or pins' names, the breadboards' strips)
      h('label', { class: 'circ-opt circ-inside', title: 'Show what is inside the parts: the gates of each IC and its pins\' names, the strips of holes joined in each breadboard' },
        insideBox, h('span', {}, 'Show inside'))), sep(),
    h('div', { class: 'asm-group' }, checkBtn), sep(),
    h('div', { class: 'asm-group' }, simBtn),
    h('div', { class: 'asm-spacer' }),
    // (a narrow screen: the parts and the properties over the canvas, shown by these, #4062)
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Parts', 'Show / hide the parts panel', null, 'circ-parts-btn'), { cls: 'parts-open', key: CIRCUIT_PARTS_KEY }),
      panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })),
    more.el);
  return { tools, delBtn, rotBtn, checkBtn, simBtn, zoomLbl, info, toolbar };
}
