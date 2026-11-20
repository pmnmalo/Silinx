// A palette symbol's composition (#4808, core/symlib.js): how it is built, a read-only tab of its drawings, pushed into
// level by level down to the gates and back up (⬆ Up, ⬇ Push into: the RTL Schematic's, #2667). A view: the HDL of the
// symbol is its own, proved equivalent to it. Its Try it simulates the level shown; opened from a schematic's Try it, its
// values are the symbol's there (core/symlib-live.js: the levels above simulated with them) and follow them.
import { closeDoc, findDoc, openDoc } from './app.js';
import { h } from './ui.js';
import { debounce } from './debounce.js';

const tabs = new Set();   // the open compositions, each { from, refresh }

/** A schematic editor's Try it changed (a step, a value, its end): the compositions opened from it follow. */
export function liveUpdated(editor) {
  for (const t of tabs) if (t.from?.editor === editor) t.later();
}

/**
 * Open the composition of a palette symbol { type, params } in a tab of its own; `from`: { editor, symId, instance,
 * docName } the symbol in a schematic whose Try it gives it its values; `at`: the level shown first, by the instances
 * pushed into from the top (['U1', 'U2'], the Design pane's row, #4984). Resolves to the tab, or null (no composition).
 */
export async function openComposition(sym, from = null, at = []) {
  const [L, LV, { mountSchEditor }] = await Promise.all([import('/core/symlib.js'), import('/core/symlib-live.js'), import('./sch-editor.js')]);
  const comp = L.composition(sym.type, sym.params);
  if (!comp) return null;
  const D = LV.derivedValues(comp);
  const id = `comp:${comp.top}`;
  const existing = findDoc(id);
  if (existing) await closeDoc(existing);
  if (from && !from.editor?.liveSim) from = null;
  return openDoc({
    id, title: `${comp.symbol} (composition)`, icon: 'schematic',
    create(el, docRef) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const levelOf = name => comp.modules.find(m => m.name === name);
      let path = [{ module: comp.top, instance: null }];
      const cur = () => levelOf(path[path.length - 1].module);
      const navBtn = (nav, title, text, onclick) => h('button', { type: 'button', class: 'se-btn wide rtl-nav', 'data-nav': nav, title, onclick }, text);
      const upBtn = navBtn('up', 'Up to the level above (Backspace)', '⬆ Up', () => up());
      const intoBtn = navBtn('into', 'Push into the selected instance (Enter, or double-click it)', '⬇ Push into', () => ed.openSelected());
      // (pushed into during its Try it: the instance's inputs there, the level below simulated with them)
      const into = (name, instance) => {
        if (!levelOf(name)) return;
        let values = null;
        const L0 = ed.liveSim, s = cur().doc.symbols.find(x => x.name === instance);
        if (!tab.from && L0 && s) values = Object.fromEntries(levelOf(name).ports.filter(q => q.dir === 'in').map(q => [q.name, LV.knownValue(L0.pinValue(s.id, q.name))]));
        go([...path, { module: name, instance }], values);
      };
      const ed = mountSchEditor(host, {
        doc: cur().doc, modules: D.modules, readOnly: true, simulate: true, simSources: () => D.sources, simLang: 'vhdl',
        onSelect: s => { intoBtn.disabled = !(s && levelOf(s.params.module)); },
        onUp: () => up(),
        onOpenModule: (name, { instance } = {}) => into(name, instance),
        onOpenModuleLive: (name, { instance } = {}) => into(name, instance),
      });
      docRef.viewer = ed;
      host.querySelector('.se-toolbar')?.prepend(upBtn, intoBtn, h('span', { class: 'se-sep' }));
      const banner = () => ed.setBanner(h('span', { class: 'gen-banner read-only' },
        h('span', {}, `Read-only, how ${comp.symbol} is built`),
        h('span', { class: 'comp-path', 'data-no-i18n': '' }, `: ${path.map(p => (p.instance ? `${p.instance} (${p.module})` : p.module)).join(' › ')}`),
        tab.from ? h('span', { class: 'comp-from' }, `, its values ${tab.from.instance}'s in the Try it of ${tab.from.docName}`) : null));
      const drawBar = () => { upBtn.disabled = path.length < 2; intoBtn.disabled = true; };
      // the values of the level shown: from the symbol's pins in its schematic's Try it, through the levels above
      const refresh = async () => {
        if (!tab.from) return;
        const L0 = tab.from.editor.liveSim;
        if (!L0) { tab.from = null; banner(); return; }   // (that Try it ended: this one's own from now on)
        const top = Object.fromEntries(comp.modules[0].ports.filter(q => q.dir === 'in').map(q => [q.name, LV.knownValue(L0.pinValue(tab.from.symId, q.name))]));
        // (its outputs too: a counter's count, its state, which the composition's own simulation does not have, #4811)
        const outs = Object.fromEntries(comp.modules[0].ports.filter(q => q.dir === 'out').map(q => [q.name, LV.knownValue(L0.pinValue(tab.from.symId, q.name))]));
        const r = D.levelValues(path, top, outs);
        if (!r.error) await ed.tryWith(LV.savedInputs(cur(), r.values), path.length === 1 ? L => LV.forceOutputs(L, cur(), outs) : null);
      };
      const tab = { from, refresh, later: debounce(() => refresh(), 30) };
      tabs.add(tab);
      const go = async (p, values = null) => {
        const was = ed.simulating;
        path = p;
        ed.setDoc(cur().doc);
        drawBar(); banner();
        docRef.composition = { symbol: comp.symbol, path: path.map(x => x.module) };
        if (tab.from) await refresh();
        else if (was && values) await ed.tryWith(LV.savedInputs(cur(), values));
      };
      const up = () => { if (path.length > 1) go(path.slice(0, -1)); };
      drawBar(); banner();
      docRef.composition = { symbol: comp.symbol, path: path.map(x => x.module) };
      // (a level below the top asked for: the instances pushed into, as far as they are found)
      const steps = [...path];
      for (const inst of at) {
        const s = levelOf(steps[steps.length - 1].module).doc.symbols.find(x => x.type === 'module' && x.name === inst);
        if (!s) break;
        steps.push({ module: s.params.module, instance: s.name });
      }
      if (steps.length > 1) go(steps);
      if (tab.from) refresh();
      return { destroy: () => { tab.later.cancel(); tabs.delete(tab); ed.destroy?.(); } };
    },
  });
}
