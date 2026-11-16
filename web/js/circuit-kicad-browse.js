// The circuit editor's Browse KiCad Libraries… (#4285, docs/CIRCUITS.md): the libraries the local server fetches (KiCad's
// own symbol libraries, the KiCad PCM's library packages: server/kicad-libraries.js; a browser alone cannot, they send
// no CORS header), searched, each one's licence, version and size shown before it is fetched; one picked: what its symbol
// libraries hold (their parts that behave as ICs of the library, those drawn only, the symbols that are no part); those
// ticked imported into the project's parts/ as the MCP's import_part with a library does, each one said in the console.
import { h, dialog, confirmDlg } from './ui.js';
import { api } from './api.js';
import { S } from './app.js';
import { log, logError } from './console.js';
import { loadCircuitParts } from './circuit-kicad-import.js';

const mb = (n) => (n ? `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB` : '');
const lineClass = (l) => (/^ERROR: /.test(l) ? 'err' : /^WARNING: /.test(l) ? 'warn' : 'info');
/** Whether this edition can browse KiCad's libraries (the local server's only). */
export const canBrowseKicad = () => typeof api.kicadLibraries === 'function';

/** Browse KiCad Libraries…: the dialog; true once a library was imported into the project, null otherwise. */
export async function browseKicadDialog() {
  if (!S.project || !canBrowseKicad()) return null;
  let list;
  try { list = await api.kicadLibraries(); } catch (e) { logError(`Browse KiCad Libraries: ${e.message}`); return null; }
  if (list.note) log(`WARNING: KiCad's libraries: ${list.note}`, 'warn');
  const search = h('input', { type: 'search', placeholder: 'Search libraries…', spellcheck: 'false', 'data-field': 'kicad-search' });
  const rows = h('table', { class: 'kicad-libraries' }), content = h('div', { class: 'kicad-content' });
  let picked = null, importBtn = null, opening = 0;   // (a library picked: { library, boxes: Map(name → checkbox) })
  const render = () => {
    const q = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const its = list.libraries.filter((l) => q.every((w) => `${l.name} ${l.identifier} ${l.description} ${l.author}`.toLowerCase().includes(w)));
    rows.replaceChildren(h('tr', {}, ...['Library', 'Version', 'Licence', 'Size'].map((x) => h('th', {}, x))),
      ...its.map((l) => h('tr', { class: `kicad-lib${picked?.library.identifier === l.identifier ? ' active' : ''}`, 'data-library': l.identifier, title: l.description || l.identifier, onclick: () => open(l) },
        h('td', { 'data-no-i18n': 'true' }, l.name), h('td', { 'data-no-i18n': 'true' }, l.version), h('td', { 'data-no-i18n': 'true' }, l.licence || '?'), h('td', { 'data-no-i18n': 'true' }, mb(l.size)))));
  };
  async function open(l) {
    const k = ++opening;
    picked = null; importBtn.disabled = true; content.replaceChildren(); render();
    let r;
    try { r = await api.kicadLibrary(l.identifier); } catch (e) { logError(`${l.name}: ${e.message}`); return; }
    if (k !== opening) return;   // (another one picked meanwhile)
    picked = { library: l, boxes: new Map() };
    log(`${l.name} ${l.version} (${l.licence || 'no licence'}): ${r.cached ? 'kept from before' : 'fetched'}, ${r.contents.length} symbol librar${r.contents.length === 1 ? 'y' : 'ies'}, ${r.footprints} footprint(s)`, 'info');
    content.append(h('div', { class: 'hint' }, 'Tick the symbol libraries to import: their parts are the project\'s circuits\' parts, as KiCad wrote them.'));
    for (const c of r.contents) {
      const box = h('input', { type: 'checkbox', checked: c.parts > 0, 'data-lib': c.name });
      box.addEventListener('change', () => { importBtn.disabled = ![...picked.boxes.values()].some((b) => b.checked); });
      picked.boxes.set(c.name, box);
      content.append(h('label', { class: 'kicad-content-lib', 'data-lib': c.name }, box, h('span', { 'data-no-i18n': 'true' },
        `${c.name}: ${c.parts} part(s), ${c.ics.length} as ICs of the library${c.ics.length ? ` (${c.ics.map((x) => x.as).filter((x, i, a) => a.indexOf(x) === i).join(', ')})` : ''}, ${c.drawn} drawn only; ${c.skipped} symbol(s) no part`)));
    }
    importBtn.disabled = ![...picked.boxes.values()].some((b) => b.checked);
    render();
  }
  search.addEventListener('input', render);
  const ok = await dialog({
    title: 'Browse KiCad Libraries', width: 820,
    body: h('div', {}, h('div', { class: 'hint' }, 'KiCad\'s own symbol libraries and the KiCad Plugin and Content Manager\'s library packages, fetched by Silinx\'s server and kept for offline use. Each one has its own licence.'),
      search, h('div', { class: 'kicad-libraries-box' }, rows), content),
    buttons: [{ label: 'Import', primary: true, value: true, disabled: true }, { label: 'Cancel', value: null }],
    onOpen: ({ buttons }) => { importBtn = buttons[0].el; render(); },
  });
  if (!ok || !picked) return null;
  const body = { library: picked.library.identifier, libraries: [...picked.boxes].filter(([, b]) => b.checked).map(([n]) => n) };
  let r;
  try { r = await api.kicadImport(S.project.name, body); }
  catch (e) {
    if (!/the project has it already/.test(e.message) || !await confirmDlg('Browse KiCad Libraries', `${e.message.replace(/ \(replace: true replaces it\)$/, '')}. Replace the files of the library?`)) { if (!/the project has it already/.test(e.message)) logError(e.message); return null; }
    try { r = await api.kicadImport(S.project.name, { ...body, replace: true }); } catch (e2) { logError(e2.message); return null; }
  }
  for (const f of r.written) if (S.fileTree && !S.fileTree.includes(f)) S.fileTree.push(f);
  for (const l of r.lines) log(l, lineClass(l));
  await loadCircuitParts();
  return true;
}
