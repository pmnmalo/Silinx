// The schematic of a digital circuit (#4069, as a Boolean algebra's, drawings-tt.js): always generated from the circuit,
// in its HDL logic form (core/circuit-sch.js), a read-only view of its module (a badge of its row in the Design pane),
// redrawn whenever the circuit changes. Not a file of the project.
import { S, activateDoc, findDoc, flushDoc, openDoc } from './app.js';
import { h } from './ui.js';
import { api } from './api.js';
import { logError } from './console.js';

const circModel = async (path) => { const d = findDoc(`circ:${path}`); if (d?.circuitEditor) { await flushDoc(d); return d.circuitEditor.getModel(); } return JSON.parse(await api.readFile(S.project.name, path)); };
const schematicOf = async (model) => (await import('/core/circuit-sch.js')).circuitSchematic(model, { layout: window.ELK ? (g) => new window.ELK().layout(g) : undefined });

export async function openCircuitSchematic(path) {
  const id = `circsch:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = await circModel(path); } catch (e) { logError(`cannot open ${path}: ${e.message}`); return; }
  const [{ mountSchEditor }, first] = await Promise.all([import('./sch-editor.js'), schematicOf(model)]);
  openDoc({
    id, title: `${path.split('/').pop().replace(/\.circ\.json$/i, '')} (Schematic)`, icon: 'schematic',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountSchEditor(host, { doc: first.doc, modules: first.modules, readOnly: true });
      d.viewer = ed;
      // (where it comes from at the end of its toolbar, as the Boolean algebra's schematic's)
      d.showCirc = ({ doc, modules, errors }) => {
        const link = h('a', { onclick: async () => (await import('./drawings.js')).openCircuit(path) }, path.split('/').pop());
        ed.setBanner(errors ? h('span', { class: 'gen-banner read-only out-of-sync' }, 'Read-only, not in sync with ', link, ` — the circuit has errors: ${errors.join('; ')}`)
          : h('span', { class: 'gen-banner read-only' }, 'Read-only, generated from ', link));
        if (!errors) { ed.setModules?.(modules); ed.setDoc(doc); }
      };
      d.showCirc(first);
      return { destroy: () => ed.destroy?.() };
    },
  });
}

// the circuit changed: its schematic, when open, follows
let timer = null;
export function refreshCircuitSchematic(path, model) {
  if (!findDoc(`circsch:${path}`)) return;
  clearTimeout(timer);
  timer = setTimeout(async () => { const d = findDoc(`circsch:${path}`); if (d?.showCirc) d.showCirc(await schematicOf(model)); }, 150);
}
