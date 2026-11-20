// The schematic of a state diagram (#4910, as a Boolean algebra's, drawings-tt.js): its gate-level implementation, not
// the RTL (core/fsm-schematic.js: a D flip-flop per state bit, the next-state and output logic in gates), a read-only
// view of its module (a badge of its row in the Design pane), redrawn whenever the diagram changes. Not a file of the
// project. A diagram that cannot be drawn (one-hot, errors, too many bits): none, why said in the console.
import { S, activateDoc, findDoc, flushDoc, openDoc } from './app.js';
import { h } from './ui.js';
import { api } from './api.js';
import { logError, logInfo } from './console.js';

const fsmModel = async (path) => { const d = findDoc(`fsm:${path}`); if (d?.fsmEditor) { await flushDoc(d); return d.fsmEditor.getModel(); } return JSON.parse(await api.readFile(S.project.name, path)); };
const schematicOf = async (model) => (await import('/core/fsm-schematic.js')).fsmSchematic(model);

export async function openFsmSchematic(path) {
  const id = `fsmsch:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = await fsmModel(path); } catch (e) { logError(`cannot open ${path}: ${e.message}`); return; }
  const [{ mountSchEditor }, first] = await Promise.all([import('./sch-editor.js'), schematicOf(model)]);
  if (first.error) { logInfo(`${path.split('/').pop()}: ${first.error}.`); return; }
  openDoc({
    id, title: `${path.split('/').pop().replace(/\.fsm\.json$/i, '')} (Schematic)`, icon: 'schematic',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      // (not editable, but simulated in place, as the Boolean algebra's schematic, #946)
      const ed = mountSchEditor(host, { doc: first.doc, readOnly: true, simulate: true });
      d.viewer = ed;
      // (where it comes from at the end of its toolbar, as the Boolean algebra's schematic's)
      d.showFsm = ({ doc, error }) => {
        const link = h('a', { onclick: async () => (await import('./drawings.js')).openFsm(path) }, path.split('/').pop());
        ed.setBanner(error ? h('span', { class: 'gen-banner read-only out-of-sync' }, 'Read-only, not in sync with ', link, ` — ${error}`)
          : h('span', { class: 'gen-banner read-only' }, 'Read-only, generated from ', link));
        if (!error) ed.setDoc(doc);
      };
      d.showFsm(first);
      return { destroy: () => ed.destroy?.() };
    },
  });
}

// the diagram changed: its schematic, when open, follows
let timer = null;
export function refreshFsmSchematic(path, model) {
  if (!findDoc(`fsmsch:${path}`)) return;
  clearTimeout(timer);
  timer = setTimeout(async () => { const d = findDoc(`fsmsch:${path}`); if (d?.showFsm) d.showFsm(await schematicOf(model)); }, 150);
}
