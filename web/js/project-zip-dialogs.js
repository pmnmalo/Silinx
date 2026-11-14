// Import Project (.zip)… and Export Project (.zip)… (#3703): one action each, the software the project comes from or
// goes to chosen in its window, its first row (Software:): Silinx (the whole project: silinx.json and every file) or
// Xilinx ISE (its .xise and its sources); AMD Vivado and Intel Quartus disabled, their reason their tip
// (core/project-software.js). The import preselects the software of the zip or the files picked; the choice last made
// is kept per viewer (Silinx by default). The export itself: menus.js exportProjectZip.
import { api } from './api.js';
import { h, dialog, alertDlg } from './ui.js';
import { S, app } from './app.js';
import { prefKey } from './prefs.js';
import { SOFTWARE, SUPPORTED, projectSoftware } from '/core/project-software.js';
import { projectNameError, projectNameFrom } from '/core/project-name.js';
import { askReplaceProject, field, replaceProjectWith, zipFolderSelection } from './wizards.js';
import { isDesignOnly } from '/core/project-kind.js';

const IMPORT_KEY = prefKey('silinx.import-software'), EXPORT_KEY = prefKey('silinx.export-software');
const saved = key => { try { const v = localStorage.getItem(key); return SUPPORTED.includes(v) ? v : 'silinx'; } catch { return 'silinx'; } };
const keep = (key, id) => { try { localStorage.setItem(key, id); } catch { /* this page only */ } };
const softwareOf = id => SOFTWARE.find(s => s.id === id);

/** The window's Software: row (form-grid's label and radios), `id` checked; onChange(id) when another is chosen.
 *  Returns { el: [label, radios], set(id) }. */
function softwareRow(id, onChange, group) {
  const radios = SOFTWARE.map(s => {
    const r = h('input', { type: 'radio', name: group, value: s.id, 'data-field': `software-${s.id}`, checked: s.id === id, disabled: !!s.reason });
    r.addEventListener('change', () => { if (r.checked) onChange(s.id); });
    return { r, el: h('label', { class: `software-${s.id}`, title: s.reason || '', style: { marginRight: '12px', whiteSpace: 'nowrap' } },
      r, h('span', {}, s.reason ? `${s.label} (not yet)` : s.label)) };
  });
  return {
    el: field('Software:', h('div', { class: 'software-row' }, ...radios.map(x => x.el))),
    set: v => { for (const { r } of radios) r.checked = r.value === v; onChange(v); },
  };
}

// ------------------------------------------------------------------ Export Project (.zip)…
const EXPORT_HINTS = {
  silinx: 'The whole Silinx project: silinx.json and every project file (sources, ASM charts, schematics, constraints, simulation files). It opens in Silinx.',
  xilinx: 'A Xilinx ISE 14.7 project: its .xise and its sources, the schematics as ISE schematics, the other drawings and the C sources as their HDL. It opens in Xilinx ISE.',
};

export async function exportProjectDialog() {
  if (!S.project) return;
  // (a design project's: Silinx's alone, no Xilinx ISE project of its HDL, #3891)
  const design = isDesignOnly(S.project);
  let software = design ? 'silinx' : saved(EXPORT_KEY);
  const hint = h('div', { class: 'hint', style: { marginTop: '10px' } });
  const row = softwareRow(software, id => { software = id; hint.textContent = EXPORT_HINTS[id]; }, 'export-software');
  hint.textContent = EXPORT_HINTS[software];
  const r = await dialog({
    title: 'Export Project', width: 560,
    body: h('div', {}, design ? null : h('div', { class: 'form-grid' }, ...row.el), hint),
    buttons: [{ label: 'Export', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  if (!design) keep(EXPORT_KEY, software);
  await (await import('./menus.js')).exportProjectZip(software);
}

// ------------------------------------------------------------------ Import Project (.zip)…
// Both in the same rows (#3965): the project's folder, or a .zip file, then the project's name.
// Silinx: the project's folder (the folder with its silinx.json: its files but the hidden ones and build/, as its
// export, core/project-folder.js), or a .zip made with Export Project (.zip)… to Silinx (silinx.json + every project
// file); in the browser edition also a project bundle (.silinx.json) of its File ▸ Download Project Bundle before
// #3548, read as such a zip.
// Xilinx ISE: the project's folder (the folder with its .xise), a .zip of that folder, or a .xise with its sources.
const ISE_ACCEPT = '.zip,.xise,.v,.vhd,.vhdl,.ucf,.pcf,.lpf,.cst';
const IMPORT_HINTS = {
  silinx: ['Import a whole Silinx project from its folder (the folder with the silinx.json file), or from a .zip of that folder (e.g. one exported with File ▸ Export Project (.zip)…). ',
    'Its build folder (build) and hidden files are not imported.'],
  xilinx: ['Import an ISE project from its folder (the folder with the .xise file), or from a .zip of that folder (e.g. one exported with File ▸ Export Project (.zip)…). ',
    'ISE output files in the folder (xst, _ngo, netlists, bitstreams, logs) are not imported.'],
};
const NOT_A_PROJECT = 'The zip holds no silinx.json nor .xise: it is not a project Silinx reads.';
const NOT_A_FOLDER = 'The folder holds no silinx.json nor .xise: it is not a project Silinx reads.';
const PROJECT_FILE = { silinx: f => /^silinx\.json$/i.test(f.name), xilinx: f => /\.xise$/i.test(f.name) };
const folderName = files => (files[0]?.webkitRelativePath || '').split('/')[0];

/** The software of the files picked (a .xise, a project bundle, a zip's entries), or null. */
async function pickedSoftware(files) {
  if (files.some(f => /\.xise$/i.test(f.name))) return 'xilinx';
  const zf = files.find(f => /\.zip$/i.test(f.name));
  if (!zf) return files.some(f => /\.json$/i.test(f.name)) && api.standalone ? 'silinx' : null;
  const { readZip } = await import('/core/zip.js');
  const names = [];
  // (the entries' names only: none inflated)
  try { await readZip(new Uint8Array(await zf.arrayBuffer()), null, { onEntry: e => { names.push(e.path); return true; } }); } catch { return null; }
  return projectSoftware(names) || 'none';
}

export async function importProjectDialog() {
  let software = saved(IMPORT_KEY);
  const fileInp = h('input', { type: 'file', 'data-field': 'file' });
  const dirInp = h('input', { type: 'file', webkitdirectory: true, multiple: true, 'data-field': 'folder' });
  const name = h('input', { type: 'text', placeholder: 'new project name' });
  const info = h('div', { class: 'hint', style: { minHeight: '16px' } });
  const hint = h('div', { class: 'hint', style: { marginTop: '10px' } });
  const [dirLabel] = field('Project folder:', dirInp), fileLabel = h('label', {});
  // the folder's line: its files and its project file (the software's), else what is missing
  const folderInfo = () => {
    const files = [...dirInp.files], pf = files.find(PROJECT_FILE[software]);
    info.textContent = files.length ? `Folder '${folderName(files)}': ${files.length} file(s)${pf ? `, project ${pf.name}` : ` — no ${software === 'xilinx' ? '.xise' : 'silinx.json'} found!`}` : '';
  };
  const show = () => {
    const ise = software === 'xilinx';
    hint.replaceChildren(...[IMPORT_HINTS[software]].flat());
    fileLabel.textContent = ise ? 'or .zip / .xise file(s):' : 'or .zip file:';
    fileInp.multiple = ise;
    fileInp.accept = ise ? ISE_ACCEPT : api.standalone ? '.zip,.json' : '.zip';
    if (dirInp.files.length) folderInfo();
  };
  const row = softwareRow(software, id => { software = id; show(); }, 'import-software');
  show();
  const suggest = n => { if (!name.value && n) name.value = projectNameFrom(n); };
  fileInp.addEventListener('change', async () => {
    dirInp.value = '';
    const files = [...fileInp.files];
    const f = files.find(x => /\.(zip|xise|json)$/i.test(x.name)) || files[0];
    if (f) suggest(f.name);
    info.textContent = files.length > 1 ? `${files.length} file(s) selected` : '';
    const found = await pickedSoftware(files);
    if (SUPPORTED.includes(found)) { if (found !== software) row.set(found); }
    else if (found) info.textContent = found === 'none' ? NOT_A_PROJECT : softwareOf(found).reason;
  });
  dirInp.addEventListener('change', () => {
    fileInp.value = '';
    const files = [...dirInp.files];
    const xise = files.find(PROJECT_FILE.xilinx);
    suggest(xise ? xise.name : folderName(files));
    // (the folder's software preselected, as a zip's: its files' paths, core/project-software.js)
    const found = files.length ? projectSoftware(files.map(f => f.webkitRelativePath || f.name)) : null;
    if (SUPPORTED.includes(found) && found !== software) row.set(found);
    else folderInfo();
    if (files.length && !SUPPORTED.includes(found)) info.textContent = found ? softwareOf(found).reason : NOT_A_FOLDER;
  });
  const r = await dialog({
    title: 'Import Project', width: 600,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...row.el),
      hint,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        dirLabel, dirInp, fileLabel, fileInp,
        ...field('Project name:', name)),
      info),
    buttons: [{ label: 'Import', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  keep(IMPORT_KEY, software);
  return software === 'xilinx' ? importIse([...fileInp.files], dirInp.files, name.value.trim()) : importSilinx(fileInp.files[0], dirInp.files, name.value.trim());
}

async function importIse(files, dirFiles, typed) {
  const zf = files.find(f => /\.zip$/i.test(f.name));
  const xf = files.find(f => /\.xise$/i.test(f.name));
  if (!dirFiles.length && !zf && !xf) return alertDlg('Import Project', 'Select the project folder, a .zip, or a .xise with its sources.', 'error');
  const folder = (dirFiles[0]?.webkitRelativePath || '').split('/')[0];
  const pname = typed || projectNameFrom((zf || xf)?.name || folder) || 'imported';
  if (projectNameError(pname)) return alertDlg('Import Project', projectNameError(pname), 'error');
  if (!await askReplaceProject(pname)) return;
  try {
    const res = await replaceProjectWith(pname, async () => {
      if (dirFiles.length) {
        const z = await zipFolderSelection(dirFiles);
        app.log(`Importing folder '${z.rootName}': ${z.count} file(s)${z.skipped ? `, ${z.skipped} ISE output/hidden file(s) skipped` : ''}.`, 'info');
        return api.importZip(pname, z.blob);
      }
      if (zf) return api.importZip(pname, zf);
      const others = {};
      for (const f of files.filter(f => f !== xf)) others[f.name] = await f.text();
      return api.importXise({ name: pname, xise: await xf.text(), files: others });
    });
    await app.openProject(pname);
    app.showLeftPage('design');
    const n = res?.project?.files?.length ?? 0;
    app.log(`Imported Xilinx ISE project '${pname}' (${n} source file(s)${res?.extra?.length ? `, ${res.extra.length} other file(s)` : ''}).`, 'ok');
    if (res?.missing?.length) app.log(`WARNING: files referenced by the .xise but not found: ${res.missing.join(', ')}`, 'warn');
    for (const w of res?.warnings || []) app.log(`WARNING: ${w}`, 'warn');
  } catch (e) { alertDlg('Import Project', e.message, 'error'); }
}

async function importSilinx(zf, dirFiles, typed) {
  if (!dirFiles.length && !zf) return alertDlg('Import Project', 'Select the project folder or the .zip of the Silinx project.', 'error');
  const pname = typed || projectNameFrom(zf?.name || folderName(dirFiles)) || 'imported';
  if (projectNameError(pname)) return alertDlg('Import Project', projectNameError(pname), 'error');
  if (!await askReplaceProject(pname)) return;
  try {
    const res = await replaceProjectWith(pname, async () => {
      if (!dirFiles.length) return api.importZip(pname, zf);
      // the folder as its export's zip (#3965): through the same import, its checks and its messages
      const z = await zipFolderSelection(dirFiles, 'silinx');
      app.log(`Importing folder '${z.rootName}': ${z.count} file(s)${z.skipped ? `, ${z.skipped} build/hidden file(s) skipped` : ''}.`, 'info');
      return api.importZip(pname, z.blob);
    });
    await app.openProject(pname);
    app.showLeftPage('design');
    app.log(`Imported Silinx project '${pname}' (${res?.project?.files?.length ?? 0} source file(s)${res?.extra?.length ? `, ${res.extra.length} other file(s)` : ''}).`, 'ok');
    if (res?.missing?.length) app.log(`WARNING: files listed in silinx.json but not in the ${dirFiles.length ? 'folder' : 'zip'}: ${res.missing.join(', ')}`, 'warn');
    // (what the import dropped: an entry that would leave the project, a broken silinx.json field, #483)
    for (const w of res?.warnings || []) app.log(`WARNING: ${w}`, 'warn');
  } catch (e) { alertDlg('Import Project', e.message, 'error'); }
}
