// Silinx - New Project's first page, the project's kind (#5041): Digital Logic (the design and simulation project,
// #3780, #3891: no FPGA or HDL in its card, #5133), FPGA (a board and a device), or co-design (FPGA and microcontroller nodes linked,
// roadmap #4695, #4702: its System document, its editor and its simulation), each said in a few words: what it is for,
// what it shows (core/project-kind.js).
import { CODESIGN_KIND, DESIGN_KIND, PROJECT_KINDS } from '/core/project-kind.js';
import { h } from './ui.js';

/**
 * The page (`value`: the kind first chosen, 'fpga' or 'design'). Returns { page, kind() }: the wizard's page and the kind
 * chosen now; `onChange(kind)` is called when the choice changes.
 */
export function kindStep(value = 'fpga', onChange = () => {}) {
  let kind = value;
  const card = k => {
    const input = h('input', { type: 'radio', name: 'project-kind', value: k.id });
    input.checked = k.id === kind;
    input.addEventListener('change', () => { if (input.checked) { kind = k.id; onChange(kind); } });
    return h('label', { class: 'kind-card', 'data-kind': k.id },
      input,
      h('div', { class: 'kind-text' },
        h('div', { class: 'kind-name' }, k.name),
        h('div', { class: 'kind-about' }, k.about)));
  };
  const page = {
    title: 'Project Kind',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Choose the kind of project to create.'),
      h('div', { class: 'kind-cards', role: 'radiogroup' }, ...PROJECT_KINDS.map(card))),
  };
  return { page, kind: () => kind, design: () => kind === DESIGN_KIND, codesign: () => kind === CODESIGN_KIND };
}
