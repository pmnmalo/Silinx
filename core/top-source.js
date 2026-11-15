// The top document New Project makes for its Top-Level Source Type (core/top-types.js, #4105), moved from
// web/js/wizards.js (#4121: the MCP server's new_project makes it too). Isomorphic module (browser + Node).
import { TOP_TYPES } from './top-types.js';

/** The files of a new project's top of type `type` in the language `lang`, in the order they are written: { file (the
 *  top document), files: [{ path, text }] }, or null (HDL: none). Type sch / fsm / asm / tt: the document and its
 *  synchronized HDL module 'top'; petri / circuit: the drawing alone, its HDL made when the project is loaded; c / cpp:
 *  the function 'top', Silinx HLS's. */
export async function topSourceFiles(type, lang) {
  const t = TOP_TYPES.find(x => x.id === type);
  const hdlPath = `src/top.${lang === 'verilog' ? 'v' : 'vhd'}`;
  let doc, code;
  if (type === 'sch') {
    const { newDoc, generateHdl } = await import('./schdoc.js');
    doc = newDoc('top', lang); code = generateHdl(doc, { lang }).code;
  } else if (type === 'fsm') {
    const { newFsm, generateFsm } = await import('./fsm.js');
    doc = newFsm('top', lang); code = generateFsm(doc, lang).code;
  } else if (type === 'asm') {
    const { newModel, generate } = await import('./asm.js');
    doc = newModel('top', lang); code = generate(doc, lang).code;
  } else if (type === 'tt') {
    const { newTable, generateTableHdl } = await import('./logic.js');
    doc = { ...newTable('top', ['a', 'b', 'c'], ['f']), lang }; code = generateTableHdl(doc, lang).code;
  } else if (type === 'petri' || type === 'circuit') {
    const { newPetri } = await import('./petri.js');
    const { newCircuit } = await import('./circuit.js');
    return { file: t.file, files: [{ path: t.file, text: JSON.stringify(type === 'petri' ? newPetri('top', lang) : newCircuit('top', lang), null, 2) }] };
  } else if (type === 'c' || type === 'cpp') {
    const { cTemplate, cppTemplate } = await import('./c-templates.js');
    return { file: t.file, files: [{ path: t.file, text: (type === 'c' ? cTemplate : cppTemplate)('top') }] };
  } else return null;
  doc.generatedFile = hdlPath;
  return { file: t.file, files: [{ path: t.file, text: JSON.stringify(doc, null, type === 'sch' ? 1 : 2) }, { path: hdlPath, text: code }] };
}
