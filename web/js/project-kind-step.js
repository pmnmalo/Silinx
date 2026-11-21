// Silinx - New Project's first page, the project's kind (#5041): a project with no FPGA (the design and simulation
// project, #3780, #3891), with an FPGA (a board and a device), or co-design (FPGA and microcontroller nodes linked,
// roadmap #4695), each said in a few words: what it is for, what it shows. Co-design is shown but cannot be chosen yet
// (its System document, #4697, and its editor, #4700, are still being built): its reason in its card, as the MCP
// server's new_project says it (core/project-kind.js).
import { CODESIGN_KIND, CODESIGN_NOT_YET, DESIGN_KIND, PROJECT_KINDS } from '/core/project-kind.js';
import { h } from './ui.js';

/**
 * The page (`value`: the kind first chosen, 'fpga' or 'design'). Returns { page, kind() }: the wizard's page and the kind
 * chosen now; `onChange(kind)` is called when the choice changes.
 */
export function kindStep(value = 'fpga', onChange = () => {}) {
  let kind = value;
  const card = k => {
    const off = k.id === CODESIGN_KIND;
    const input = h('input', { type: 'radio', name: 'project-kind', value: k.id, disabled: off });
    input.checked = k.id === kind;
    input.addEventListener('change', () => { if (input.checked) { kind = k.id; onChange(kind); } });
    return h('label', { class: `kind-card${off ? ' off' : ''}`, 'data-kind': k.id },
      input,
      h('div', { class: 'kind-text' },
        h('div', { class: 'kind-name' }, k.name),
        h('div', { class: 'kind-about' }, k.about),
        off ? h('div', { class: 'kind-not-yet' }, CODESIGN_NOT_YET) : null));
  };
  const page = {
    title: 'Project Kind',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Choose the kind of project to create.'),
      h('div', { class: 'kind-cards', role: 'radiogroup' }, ...PROJECT_KINDS.map(card))),
  };
  return { page, kind: () => kind, design: () => kind === DESIGN_KIND };
}
