// The circuit editor's KiCad parts (#4281, docs/CIRCUITS.md): the project's parts/ folder read when a circuit opens
// (core/circuit-kicad.js useProjectParts), and the Parts panel's Import KiCad Part…: a .kicad_sym or a .kicad_mod picked,
// a library's symbols listed with what each one is (as which IC of the library, drawn only, or no part and why) as its
// Model, Family and Footprint are set, its source, author and licence given; then imported as the MCP's import_part does
// (core/kicad-import.js: the file kept as KiCad wrote it, these written in its symbols' properties), each of its symbols
// said in the console.
import { h, dialog, confirmDlg } from './ui.js';
import { api } from './api.js';
import { S } from './app.js';
import { log, logError } from './console.js';
import { useProjectParts, kicadPartsOf, isKicadPartFile } from '/core/circuit-kicad.js';
import { importKicadPart, importKicadPackage, packageContents, libraryWithProperties, isKicadImportName, kicadImportPath } from '/core/kicad-import.js';
import { readPcmPackage, symdirPackage, packageOrigin } from '/core/kicad-pcm.js';
import { browserCodec } from '/core/zip.js';
import { readKicadSymLib } from '/core/kicad-sym.js';
import { SEXPR_LIMITS } from '/core/sexpr.js';
import { PARTS, PART_ORDER } from '/core/circuit-parts.js';

// the project's files through the page's store, as core/drawing-sync.js reads a project (kicadStore: the catalogue's too)
export const kicadStore = () => store();
const store = () => ({
  fileTree: async () => S.fileTree || [],
  readFile: (name, path) => api.readFile(name, path),
  writeFile: async (name, path, text) => { await api.writeFile(name, path, text); if (S.fileTree && !S.fileTree.includes(path)) S.fileTree.push(path); },
});

/** The project's KiCad parts read and set (before a circuit is opened); its files not read said in the console. */
export async function loadCircuitParts() {
  if (!S.project) return null;
  const r = await useProjectParts(store(), S.project.name);
  for (const e of r.errors) log(`WARNING: ${e}`, 'warn');
  return r;
}

const ICS = PART_ORDER.filter((t) => PARTS[t].kind === 'ic');
const lineClass = (l) => (/^ERROR: /.test(l) ? 'err' : /^WARNING: /.test(l) ? 'warn' : 'info');

/** What each symbol of a library is, its properties as set: Map(symbol → { text, why }). */
function statusOf(rel, text, footprints) {
  const r = kicadPartsOf({ [rel]: text, ...footprints });
  const out = new Map();
  for (const d of r.defs) out.set(d.kicad.symbol, { text: d.behaves ? `As the ${d.behaves} (by its ${d.how})` : 'Drawn only (not simulated)', why: '' });
  for (const x of r.skipped) out.set(x.type.slice(rel.length + 1), { text: 'Not a part', why: x.reason });
  return out;
}

/**
 * Import KiCad Part…: the dialog; the file imported into the project (true), or nothing (null: cancelled, refused).
 */
export async function importKicadDialog() {
  if (!S.project) return null;
  const name = S.project.name;
  // (the project's footprints: a symbol's places may come from them)
  const footprints = {};
  for (const f of (S.fileTree || []).filter((x) => isKicadPartFile(x) && x.endsWith('.kicad_mod'))) { try { footprints[f] = await api.readFile(name, f); } catch { /* unreadable */ } }
  const file = h('input', { type: 'file', accept: '.kicad_sym,.kicad_mod,.zip', 'data-field': 'kicad-file' });
  const folder = h('input', { type: 'file', webkitdirectory: true, multiple: true, 'data-field': 'kicad-folder' });   // (a .kicad_symdir, #4285)
  const table = h('table', { class: 'kicad-symbols' });
  const what = h('div', { class: 'hint', 'data-field': 'kicad-what' }, 'Pick a KiCad symbol library (.kicad_sym, KiCad 6 to 10), a footprint (.kicad_mod), a KiCad PCM package (.zip) or a .kicad_symdir folder: it is copied into the project\'s parts/ folder as KiCad wrote it.');
  const origin = Object.fromEntries(['source', 'author', 'licence'].map((k) => [k, h('input', { type: 'text', spellcheck: 'false', 'data-field': k })]));
  let picked = null;   // { base, text, footprint, rows: Map(symbol → { model, family, fp }) }, or a package's { pkg, boxes: Map(library → checkbox) }
  let importBtn = null, picks = 0;   // (a file picked again while the last one is read: the last one's only)

  const edits = () => Object.fromEntries([...picked.rows].map(([s, r]) => [s, { model: r.model.value || undefined, family: r.family.value || undefined, footprint: r.fp.value.trim() || undefined }])
    .filter(([, o]) => o.model || o.family || o.footprint));
  function refresh() {
    if (!picked || picked.footprint) return;
    let text;
    try { text = libraryWithProperties(picked.text, edits()); } catch (e) { logError(`${picked.base}: ${e.message}`); return; }
    const st = statusOf(kicadImportPath(picked.base), text, footprints);
    for (const [s, r] of picked.rows) { const x = st.get(s); r.status.textContent = x?.text ?? ''; r.status.title = x?.why ?? ''; r.status.dataset.why = x?.why ?? ''; }
  }
  // a package (a .zip, a .kicad_symdir folder): its symbol libraries ticked, what each one holds
  function showPackage(pkg, label) {
    picked = { pkg, boxes: new Map() };
    const contents = packageContents(pkg);
    what.textContent = `${label}: ${contents.length} symbol librar${contents.length === 1 ? 'y' : 'ies'}, ${pkg.footprints.length} footprint(s)`;
    for (const c of contents) {
      const box = h('input', { type: 'checkbox', checked: c.parts > 0, 'data-lib': c.name });
      box.addEventListener('change', () => { importBtn.disabled = ![...picked.boxes.values()].some((b) => b.checked); });
      picked.boxes.set(c.name, box);
      table.append(h('tr', { class: 'kicad-content-lib', 'data-lib': c.name }, h('td', {}, box), h('td', { 'data-no-i18n': 'true' },
        `${c.name}: ${c.parts} part(s), ${c.ics.length} as ICs of the library${c.ics.length ? ` (${[...new Set(c.ics.map((x) => x.as))].join(', ')})` : ''}, ${c.drawn} drawn only; ${c.skipped} symbol(s) no part`)));
    }
    importBtn.disabled = ![...picked.boxes.values()].some((b) => b.checked);
  }
  folder.addEventListener('change', async () => {
    picked = null; table.replaceChildren(); importBtn.disabled = true; file.value = '';
    const fs = [...folder.files].filter((f) => /\.kicad_sym$/i.test(f.name) && f.size <= SEXPR_LIMITS.maxBytes);
    const dir = (folder.files[0]?.webkitRelativePath || '').split('/')[0];
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*\.kicad_symdir$/.test(dir)) { if (folder.files.length) logError(`'${dir}' is not a .kicad_symdir folder`); return; }
    const pick = ++picks, files = await Promise.all(fs.map(async (f) => ({ name: f.name, text: await f.text() })));
    if (pick !== picks) return;
    table.replaceChildren();
    try { showPackage(symdirPackage(dir, files), dir); } catch (e) { logError(`${dir}: ${e.message}`); picked = null; }
  });
  file.addEventListener('change', async () => {
    picked = null; table.replaceChildren(); importBtn.disabled = true; folder.value = '';
    const f = file.files[0];
    if (!f) return;
    if (/\.zip$/i.test(f.name)) {
      const pick = ++picks, bytes = new Uint8Array(await f.arrayBuffer());
      if (pick !== picks) return;
      let pkg;
      try { pkg = await readPcmPackage(bytes, browserCodec()); } catch (e) { logError(`${f.name}: ${e.message}`); picked = null; return; }
      if (pick !== picks) return;
      table.replaceChildren();
      try { showPackage(pkg, f.name); } catch (e) { logError(`${f.name}: ${e.message}`); picked = null; }
      return;
    }
    if (!isKicadImportName(f.name)) { logError(`'${f.name}' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)`); return; }
    if (f.size > SEXPR_LIMITS.maxBytes) { logError(`${f.name} is too large: ${f.size} bytes (at most ${SEXPR_LIMITS.maxBytes})`); return; }
    const pick = ++picks, text = await f.text(), footprint = f.name.endsWith('.kicad_mod');
    if (pick !== picks) return;
    table.replaceChildren();
    picked = { base: f.name, text, footprint, rows: new Map() };
    if (footprint) { what.textContent = `A footprint: ${kicadImportPath(f.name)}`; importBtn.disabled = false; return; }
    let lib;
    try { lib = readKicadSymLib(text); } catch (e) { logError(`${f.name}: ${e.message}`); picked = null; return; }
    what.textContent = `${lib.symbols.filter((s) => !s.power).length} symbol(s): ${kicadImportPath(f.name)}`;
    const sel = (opts) => h('select', {}, ...opts.map(([v, label, raw]) => h('option', { value: v, ...(raw ? { 'data-no-i18n': 'true' } : {}) }, label)));
    table.append(h('tr', {}, ...['Symbol', 'Part number', 'Model', 'Family', 'Footprint', 'It is'].map((x) => h('th', {}, x))));
    for (const s of lib.symbols.filter((x) => !x.power)) {
      const r = { model: sel([['', 'By its part number'], ...ICS.map((t) => [t, t, true])]), family: sel([['', 'Its model\'s'], ['ttl', 'TTL'], ['cmos', 'CMOS']]),
        fp: h('input', { type: 'text', spellcheck: 'false', placeholder: s.properties.Footprint || '' }), status: h('span', { class: 'kicad-status' }) };
      for (const x of [r.model, r.family, r.fp]) x.addEventListener('change', refresh);
      picked.rows.set(s.name, r);
      table.append(h('tr', { 'data-symbol': s.name }, h('td', { 'data-no-i18n': 'true' }, s.name), h('td', { 'data-no-i18n': 'true' }, s.properties.Value || ''),
        h('td', {}, r.model), h('td', {}, r.family), h('td', {}, r.fp), h('td', {}, r.status)));
    }
    importBtn.disabled = false;
    refresh();
  });

  const ok = await dialog({
    title: 'Import KiCad Part', width: 760,
    body: h('div', {}, h('div', { class: 'form-grid' }, h('label', {}, 'File:'), file, h('label', {}, 'or a folder:'), folder), what, table,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } }, h('label', {}, 'Source:'), origin.source, h('label', {}, 'Author:'), origin.author, h('label', {}, 'Licence:'), origin.licence)),
    buttons: [{ label: 'Import', primary: true, value: true, disabled: true }, { label: 'Cancel', value: null }],
    onOpen: ({ buttons }) => { importBtn = buttons[0].el; },
  });
  if (!ok || !picked) return null;
  const given = Object.fromEntries(Object.entries(origin).map(([k, x]) => [k, x.value.trim()]).filter(([, v]) => v));
  if (picked.pkg) return importPackage(name, picked, given);
  const rel = kicadImportPath(picked.base);
  let replace = false;
  if ((S.fileTree || []).includes(rel)) {
    if (!await confirmDlg('Import KiCad Part', `${rel} is in the project already. Replace it?`)) return null;
    replace = true;
  }
  let r;
  try {
    r = await importKicadPart(store(), name, { base: picked.base, text: picked.text, symbols: picked.footprint ? undefined : edits(),
      origin: Object.fromEntries(Object.entries(origin).map(([k, x]) => [k, x.value.trim()])), replace });
  } catch (e) { logError(`Import KiCad Part: ${e.message}`); return null; }
  for (const l of r.lines) log(l, lineClass(l));
  return true;
}

// a package's libraries ticked imported (core/kicad-import.js importKicadPackage, the MCP's import_part's with a .zip or
// a folder); a file of the project replaced once confirmed
async function importPackage(name, picked, given) {
  const libraries = [...picked.boxes].filter(([, b]) => b.checked).map(([n]) => n);
  const opts = { libraries, origin: { ...packageOrigin(picked.pkg.metadata), ...given } };
  let r;
  try { r = await importKicadPackage(store(), name, picked.pkg, opts); }
  catch (e) {
    if (!/the project has it already/.test(e.message)) { logError(`Import KiCad Part: ${e.message}`); return null; }
    if (!await confirmDlg('Import KiCad Part', `${e.message.replace(/ \(replace: true replaces it\)$/, '')}. Replace the files of the library?`)) return null;
    try { r = await importKicadPackage(store(), name, picked.pkg, { ...opts, replace: true }); } catch (e2) { logError(`Import KiCad Part: ${e2.message}`); return null; }
  }
  for (const l of r.lines) log(l, lineClass(l));
  return true;
}
