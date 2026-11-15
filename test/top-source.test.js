// core/top-source.js (#4121): New Project's top document for its Top-Level Source Type (#4105), moved from
// web/js/wizards.js's createTopSource as it was, no behaviour changed: for every type in both languages, the files and their
// order the wizard's code wrote (origin/main's, kept here), and an HDL type none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOP_TYPES } from '../core/top-types.js';
import { topSourceFiles } from '../core/top-source.js';

// the wizard's createTopSource as it was before the move (origin/main's web/js/wizards.js), its writes recorded
async function wizardFiles(type, lang) {
  const t = TOP_TYPES.find(x => x.id === type), out = [];
  const writeFile = (_, p, text) => out.push({ path: p, text });
  const hdlPath = `src/top.${lang === 'verilog' ? 'v' : 'vhd'}`;
  let doc, code;
  if (type === 'sch') {
    const { newDoc, generateHdl } = await import('../core/schdoc.js');
    doc = newDoc('top', lang); code = generateHdl(doc, { lang }).code;
  } else if (type === 'fsm') {
    const { newFsm, generateFsm } = await import('../core/fsm.js');
    doc = newFsm('top', lang); code = generateFsm(doc, lang).code;
  } else if (type === 'asm') {
    const { newModel, generate } = await import('../core/asm.js');
    doc = newModel('top', lang); code = generate(doc, lang).code;
  } else if (type === 'tt') {
    const { newTable, generateTableHdl } = await import('../core/logic.js');
    doc = { ...newTable('top', ['a', 'b', 'c'], ['f']), lang }; code = generateTableHdl(doc, lang).code;
  } else if (type === 'petri' || type === 'circuit') {
    const { newPetri } = await import('../core/petri.js');
    const { newCircuit } = await import('../core/circuit.js');
    writeFile('x', t.file, JSON.stringify(type === 'petri' ? newPetri('top', lang) : newCircuit('top', lang), null, 2));
    return { file: t.file, files: out };
  } else if (type === 'c' || type === 'cpp') {
    const { cTemplate, cppTemplate } = await import('../web/js/c-templates.js');
    writeFile('x', t.file, (type === 'c' ? cTemplate : cppTemplate)('top'));
    return { file: t.file, files: out };
  } else return null;
  doc.generatedFile = hdlPath;
  writeFile('x', t.file, JSON.stringify(doc, null, type === 'sch' ? 1 : 2));
  writeFile('x', hdlPath, code);
  return { file: t.file, files: out };
}

test('topSourceFiles: every type in both languages, the files the wizard wrote, in its order', async () => {
  for (const t of TOP_TYPES) for (const lang of ['vhdl', 'verilog']) assert.deepEqual(await topSourceFiles(t.id, lang), await wizardFiles(t.id, lang), `${t.id} ${lang}`);
  assert.equal(await topSourceFiles('hdl', 'vhdl'), null);
  assert.equal(await topSourceFiles('nope', 'vhdl'), null);
  // a diagram's: its document, then its HDL module 'top' in the language
  const fsm = await topSourceFiles('fsm', 'verilog');
  assert.deepEqual(fsm.files.map(f => f.path), ['src/top.fsm.json', 'src/top.v']);
  assert.equal(JSON.parse(fsm.files[0].text).generatedFile, 'src/top.v');
  assert.match(fsm.files[1].text, /^module top/m);
  assert.deepEqual((await topSourceFiles('circuit', 'vhdl')).files.map(f => f.path), ['src/top.circ.json']);
  assert.match((await topSourceFiles('c', 'vhdl')).files[0].text, /\btop\s*\(/);
});


test('topSourceFiles: a drawing\'s top with its HDL module last, a C function alone, an HDL top none', async () => {
  const sch = await topSourceFiles('sch', 'verilog');
  assert.deepEqual(sch.files.map(f => f.path), ['src/top.sch.json', 'src/top.v']);
  assert.equal(JSON.parse(sch.files[0].text).generatedFile, 'src/top.v');
  assert.deepEqual((await topSourceFiles('c', 'vhdl')).files.map(f => f.path), ['src/top.c']);
  assert.equal(await topSourceFiles('hdl', 'vhdl'), null);
});
