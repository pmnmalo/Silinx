// Silinx - New Project's first page, the project's mode since #5754 (roadmap #5753, core/project-mode.js): Circuit (the
// design and simulation project, #3780, #3891: no FPGA or HDL in its card, #5133), Board (one board: an FPGA's flow, its
// emulator and its programming) or System (devices linked in a System document, roadmap #4695, #4702), each a card with a
// small drawing and a few words: what it is for. Each card creates the project kind it always did (its data-kind: design,
// fpga, system); a System's finer profile (Embedded / SoC, #5440) is Design Properties'.
import { DESIGN_KIND, newSystemKind } from '/core/project-kind.js';
import { MODES, modeOn } from '/core/project-mode.js';
import { SYSTEMS_OFF } from '/core/build-channel.js';
import { h } from './ui.js';
import { sv } from './dom.js';

// each mode's drawing, in the text's colour, its shapes as [tag, attributes]: a gate; a board, its chip and its header;
// two boards linked
const path = d => ['path', { d }];
const rect = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];
const ART = {
  circuit: [path('M4 14h12M4 26h12M38 20h14'), path('M16 8h10a12 12 0 0 1 0 24H16z')],
  board: [rect(4, 6, 48, 28, 2), rect(20, 13, 14, 14), path('M17 16h3M17 20h3M17 24h3M34 16h3M34 20h3M34 24h3M44 12v16'),
    ['circle', { cx: 9, cy: 11, r: 1.5 }], ['circle', { cx: 9, cy: 29, r: 1.5 }]],
  system: [rect(2, 10, 20, 20, 2), rect(8, 16, 8, 8), rect(34, 10, 20, 20, 2), rect(40, 16, 8, 8),
    ['path', { d: 'M22 17h12M22 23h12', 'stroke-dasharray': '3 2' }]],
};
export const art = id => h('span', { class: 'kind-art', 'aria-hidden': 'true' },
  sv('svg', { viewBox: '0 0 56 40', width: 56, height: 40, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' },
    ...ART[id].map(([tag, a]) => sv(tag, a))));

/**
 * The page (`value`: the kind first chosen, 'fpga' or 'design'). Returns { page, kind() }: the wizard's page and the kind
 * chosen now; `onChange(kind)` is called when the choice changes.
 */
export function kindStep(value = 'fpga', onChange = () => {}) {
  let kind = value;
  const card = m => {
    // (Systems not in a release yet: its card disabled, the reason said, #5202)
    const off = !modeOn(m.id);
    const input = h('input', { type: 'radio', name: 'project-kind', value: m.kind, disabled: off });
    input.checked = m.kind === kind;
    input.addEventListener('change', () => { if (input.checked) { kind = m.kind; onChange(kind); } });
    return h('label', { class: `kind-card${off ? ' off' : ''}`, 'data-kind': m.kind, 'data-mode': m.id },
      input, art(m.id),
      h('div', { class: 'kind-text' },
        h('div', { class: 'kind-name' }, m.label),
        h('div', { class: 'kind-about' }, m.about),
        off ? h('div', { class: 'kind-not-yet' }, SYSTEMS_OFF) : null));
  };
  const page = {
    title: 'Project Mode',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Choose the mode of the project.'),
      h('div', { class: 'kind-cards', role: 'radiogroup' }, ...MODES.map(card))),
  };
  return { page, kind: () => kind, design: () => kind === DESIGN_KIND, system: () => newSystemKind(kind) };
}
