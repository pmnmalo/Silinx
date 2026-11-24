// The System Emulator opened (#5212): a System project's System emulated in a document of its own, `sysemu:<file>`
// (the Board Emulator's is its one 'emulator'), from the System editor's Emulate (its System as it is there) or the
// System row's Emulate System (as saved). Systems not in a release yet (#5202): said in the console, nothing opened.
import { api } from './api.js';
import { S, activateDoc, findDoc, openDoc } from './app.js';
import { log, logError } from './console.js';
import { readSystem } from '/core/system-doc.js';
import { systemsOn, SYSTEMS_OFF } from '/core/build-channel.js';

/** The System of `path` emulated (`model()`: the System as its editor has it; else as saved). */
export async function openSystemEmulator(path, model = null) {
  if (!systemsOn()) { logError(`cannot emulate ${path}: ${SYSTEMS_OFF}`); return; }
  const id = `sysemu:${path}`;
  if (findDoc(id)) { findDoc(id).emulator?.restart(); return activateDoc(findDoc(id)); }
  const pj = S.project.name;
  let sys = model?.();
  if (!sys) {
    let r;
    try { r = readSystem(await api.readFile(pj, path)); } catch (e) { logError(`cannot emulate ${path}: ${e.message}`); return; }
    if (r.error) { logError(`cannot emulate ${path}: ${r.error}`); return; }
    sys = r.system;
  }
  const [{ mountSystemEmulator }, { prepareHere }] = await Promise.all([import('./system-emu-view.js'), import('./system-open.js')]);
  if (S.project?.name !== pj) return;   // another project opened meanwhile (#1231)
  openDoc({
    id, title: `Emulate (${sys.name})`, icon: 'system',
    create(el, d) {
      const v = mountSystemEmulator(el, { system: () => model?.() || sys, prepare: s => prepareHere(s, { emulate: true }), onMessage: (text, level) => log(text, level) });
      d.emulator = v;
      return { destroy: () => v.destroy() };
    },
  });
}
