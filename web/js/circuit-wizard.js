// The Digital Electronic Circuit Wizard (#4061), New Source ▸ 'Digital Electronic Circuit' ▸ Wizard >: the name,
// language and location (not shown from New Source, #2082) -> an assembly to start from (core/circuit-templates.js: N
// breadboards and a supply, switches and LEDs, the assemblies of ICs of core/circuit-assemblies.js; their parameters) -> summary; it creates the .circ.json and opens it
// in the circuit editor. The pages: web/js/modwizard.js (namePage), web/js/template-page.js.
import { api } from './api.js';
import { alertDlg, toast } from './ui.js';
import { circuitTemplate, CIRCUIT_TEMPLATES } from '/core/circuit-templates.js';
import { circuitCounts } from '/core/circuit.js';
import { templatePage } from './template-page.js';
import { h } from './dom.js';
import { wizard, replaceGuard, closeBeforeReplace } from './wizards.js';
import { namePage } from './modwizard.js';
import { S, app } from './app.js';
import { namedPages } from './wizard-util.js';
import { designOnly, langNote } from './design-only.js';

export async function circuitWizard({ name = '', location = 'src', lang = null, named = false, back = null } = {}) {
  const guard = replaceGuard('Digital Electronic Circuit Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({
    title: 'Name and Language', name, lang: L, loc: location, guard, ext: '.circ.json', nameLabel: 'Circuit (module) name:',
    hint: designOnly() ? 'The wizard creates a digital electronic circuit from a typical assembly: breadboards, their supply, switches and LEDs ready for your chips, or chips already wired to their switches, LEDs and display.'   // (no HDL, #3891)
      : 'The wizard creates a digital electronic circuit from a typical assembly: breadboards, their supply, switches and LEDs ready for your chips, or chips already wired to their switches, LEDs and display; its HDL is generated from it.',
  });
  const tpl = templatePage('circuit', CIRCUIT_TEMPLATES, () => {});
  const made = () => circuitTemplate(tpl.id(), tpl.params(), { name: p1.name(), lang: p1.lang() });
  const summary = h('pre', { class: 'mw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const m = made();
      summary.textContent = [
        `The wizard will create the digital electronic circuit ${p1.path()} and open it in the circuit editor.`,
        '',
        `Module: ${m.name}${langNote(m.lang)}`,
        `Assembly: ${tpl.label()}`,
        `Parts: ${m.parts.length} (${circuitCounts(m)})`,
      ].join('\n');
    },
    validate: () => guard(p1.path()),
  };
  const ok = await wizard('Digital Electronic Circuit Wizard', namedPages(p1.page, [p1.page, tpl.page, pSum], named, p1.tail), { width: 720, back });
  if (!ok) return;
  let m;
  try { m = made(); } catch (e) { return alertDlg('Digital Electronic Circuit Wizard', e.message, 'error'); }
  if (p1.desc.value.trim()) m.description = p1.desc.value.trim();
  const path = p1.path();
  await closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2));
  await app.reloadProject();
  app.log(`Digital Electronic Circuit Wizard: created ${path} (${tpl.label()}, ${m.parts.length} part(s), ${m.wires.length} wire(s)).`, 'ok');
  toast(`Circuit ${m.name} created`, 'ok');
  app.openFile(path);   // (the circuit editor)
  return path;
}
