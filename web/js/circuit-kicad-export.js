// The circuit editor's ⋮ Export (#4282, core/kicad-export.js), as the MCP's export_part: the library's ICs as a KiCad
// symbol library (all of them, or this circuit's), downloaded as a .kicad_sym; the project's KiCad parts (its parts/
// folder) and, ticked, the library's ICs as a KiCad Plugin and Content Manager package, downloaded as a .zip, its
// metadata given (an identifier, a name, a description, its author, licence and version). Its messages in the console.
import { h, dialog, downloadText } from './ui.js';
import { api } from './api.js';
import { S } from './app.js';
import { log, logError } from './console.js';
import { icLibrary, partsPackage, EXPORTED_ICS } from '/core/kicad-export.js';
import { isKicadPartFile } from '/core/circuit-kicad.js';
import { browserCodec } from '/core/zip.js';
import { PARTS, partDef } from '/core/circuit-parts.js';

// the library's ICs a circuit uses (its KiCad parts: the ICs they behave as)
const icsOf = (m) => [...new Set(m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic').map((d) => d.behaves ?? d.type))].filter((t) => PARTS[t]);
const field = (label, input) => [h('label', {}, label), input];

/** Export ICs as KiCad Symbols…: `m` the circuit (its ICs offered); downloaded, or null (cancelled). */
export async function exportIcsDialog(m) {
  const used = icsOf(m);
  const all = h('input', { type: 'radio', name: 'kicad-ics', value: 'all', checked: true, 'data-field': 'ics-all' });
  const mine = h('input', { type: 'radio', name: 'kicad-ics', value: 'circuit', disabled: !used.length, 'data-field': 'ics-circuit' });
  const ok = await dialog({
    title: 'Export ICs as KiCad Symbols', width: 520,
    body: h('div', {}, h('div', { class: 'hint' }, 'The library\'s ICs as a KiCad symbol library: each one a unit per gate and its supply\'s, its footprint a DIP, its behaviour in its properties (Silinx reads it back as that IC).'),
      h('label', { class: 'kicad-ics-choice' }, all, h('span', {}, `All the library's ICs (${EXPORTED_ICS.length})`)), h('label', { class: 'kicad-ics-choice' }, mine, h('span', {}, `This circuit's ICs (${used.length})`))),
    buttons: [{ label: 'Export', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!ok) return null;
  const types = mine.checked ? used : EXPORTED_ICS;
  downloadText('silinx-ics.kicad_sym', icLibrary(types));
  log(`silinx-ics.kicad_sym written: ${types.length} IC(s) of the library as KiCad symbols (${types.join(', ')})`, 'info');
  return true;
}

/** Export Parts as KiCad Package…: the project's KiCad parts (and the library's ICs, ticked) downloaded as a PCM zip. */
export async function exportPackageDialog() {
  if (!S.project) return null;
  const name = S.project.name, slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'parts';
  const inp = (k, v = '') => h('input', { type: 'text', spellcheck: 'false', value: v, 'data-field': k });
  const f = { identifier: inp('identifier', `org.example.${slug}`), name: inp('name', `${name} parts`), description: inp('description', `The KiCad parts of ${name}`),
    author: inp('author'), licence: inp('licence', 'CC-BY-SA-4.0'), version: inp('version', '1.0.0') };
  const withIcs = h('input', { type: 'checkbox', 'data-field': 'with-ics' });
  const files = (S.fileTree || []).filter(isKicadPartFile);
  let bytes = null;
  const make = async () => {
    try {
      const texts = {};
      for (const p of files) texts[p] = await api.readFile(name, p);
      bytes = await partsPackage(texts, Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.value.trim()])), browserCodec(), { ics: withIcs.checked ? EXPORTED_ICS : null });
      return true;
    } catch (e) { logError(`Export Parts as KiCad Package: ${e.message}`); return false; }
  };
  const ok = await dialog({
    title: 'Export Parts as KiCad Package', width: 560,
    body: h('div', {}, h('div', { class: 'hint' }, `The project's KiCad parts (its parts/ folder: ${files.length} file(s)) as a KiCad Plugin and Content Manager package, to install in KiCad or to import in Silinx.`),
      h('div', { class: 'form-grid' }, ...field('Identifier:', f.identifier), ...field('Name:', f.name), ...field('Description:', f.description), ...field('Author:', f.author),
        ...field('Licence:', f.licence), ...field('Version:', f.version)),
      h('label', { class: 'kicad-with-ics' }, withIcs, h('span', {}, 'With the library\'s ICs'))),
    buttons: [{ label: 'Export', primary: true, value: true, validate: make }, { label: 'Cancel', value: null }],
  });
  if (!ok || !bytes) return null;
  const file = `${slug}-kicad.zip`;
  downloadText(file, bytes, 'application/zip');
  log(`${file} written: the KiCad package ${f.identifier.value.trim()} ${f.version.value.trim()} of ${files.length} file(s) of ${name}'s parts/${withIcs.checked ? ` and ${EXPORTED_ICS.length} IC(s) of the library` : ''}`, 'info');
  return true;
}
