// Test helper (not a test file): a project's top drawing written as New Source writes a new one (the Top-Level Source
// Type that New Project offered is gone, #5786: a project starts empty, its top added as any module). A schematic or a
// state diagram named 'top', its synchronized HDL module, both registered through the server's API, then the top set.
//   await addTopDrawing(env, 'Drawn', 'sch');   // src/top.sch.json, src/top.vhd; the project's top 'top'
import { newDoc, generateHdl } from '../../core/schdoc.js';
import { newFsm, generateFsm } from '../../core/fsm.js';

/** The top drawing of the type `type` (sch, fsm) written into the project `name` and made its top. */
export async function addTopDrawing(env, name, type, lang = 'vhdl') {
  const hdl = `src/top.${lang === 'verilog' ? 'v' : 'vhd'}`, file = `src/top.${type}.json`;
  const doc = type === 'sch' ? newDoc('top', lang) : newFsm('top', lang);
  const code = type === 'sch' ? generateHdl(doc, { lang }).code : generateFsm(doc, lang).code;
  doc.generatedFile = hdl;
  const api = env.server.api, enc = encodeURIComponent;
  await api('PUT', `/api/projects/${enc(name)}/file?path=${enc(file)}`, JSON.stringify(doc, null, type === 'sch' ? 1 : 2));
  await api('PUT', `/api/projects/${enc(name)}/file?path=${enc(hdl)}`, code);
  const pj = await api('GET', `/api/projects/${enc(name)}`);
  delete pj.fileTree;
  pj.top = 'top';
  if (!pj.files.some(f => f.path === hdl)) pj.files.push({ path: hdl, lang, role: 'design' });
  await api('PUT', `/api/projects/${enc(name)}`, pj);
  return file;
}
