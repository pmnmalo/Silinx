// The MCP server's export_part (#4282, server/mcp-kicad.js): the library's ICs as a .kicad_sym in the exchange folder
// (read back as those ICs), a project's KiCad parts as a PCM package (read back the same); what it refuses
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { scratchEnv } from './server-helpers.js';
import { kicadPartsOf } from '../core/circuit-kicad.js';
import { readPcmPackage } from '../core/kicad-pcm.js';
import { EXPORTED_ICS } from '../core/kicad-export.js';

let tmp, ex;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-mcp-kicad-export-')); ex = path.join(tmp, 'exchange'); fs.mkdirSync(ex); process.env.SILINX_MCP_FOLDER = ex; });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, text) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${text}`); return r; };
const CODEC = { inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) };

test('export_part: ICs as a .kicad_sym, a project\'s parts as a PCM package; read back; its refusals', async () => {
  const r = await ok('export_part', { file: 'silinx.kicad_sym', ics: ['7400', '7404'] });
  assert.equal(r.text, 'silinx.kicad_sym written: 2 IC(s) of the library as KiCad symbols (7400, 7404)');
  assert.deepEqual(kicadPartsOf({ 'parts/s.kicad_sym': fs.readFileSync(path.join(ex, 'silinx.kicad_sym'), 'utf8') }).defs.map((d) => d.behaves), ['7400', '7404']);
  await fails('export_part', { file: 'silinx.kicad_sym' }, 'file: \'silinx.kicad_sym\' is in the exchange folder already (replace: true replaces it)');
  assert.match((await ok('export_part', { file: 'silinx.kicad_sym', replace: true })).text, /^silinx\.kicad_sym written: 48 IC\(s\) of the library as KiCad symbols \(7400, 7401, /);
  await fails('export_part', { file: 'x.kicad_sym', ics: ['led'] }, `'led' is not an IC of the library (its ICs: ${EXPORTED_ICS.join(', ')})`);
  await fails('export_part', { file: 'x.txt' }, 'file: \'x.txt\' is neither a .kicad_sym nor a .zip');
  await fails('export_part', { file: 'x.kicad_sym', project: 'P' }, 'project: a .zip\'s only (a .kicad_sym holds the library\'s ICs)');
  // a project's parts as a package
  await ok('new_project', { name: 'P' });
  fs.mkdirSync(path.join(tmp, 'ws', 'P', 'parts'), { recursive: true });
  const LIB = fs.readFileSync(new URL('./fixtures/kicad/project/parts/ttl.kicad_sym', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(tmp, 'ws', 'P', 'parts', 'ttl.kicad_sym'), LIB);
  const meta = { identifier: 'org.example.p', name: 'P parts', description: 'A test', author: 'Me', licence: 'CC0-1.0', version: '1.0' };
  const z = await ok('export_part', { file: 'p.zip', project: 'P', ics: ['74161'], ...meta });
  assert.equal(z.text, 'p.zip written: the KiCad package org.example.p 1.0 of 1 file(s) of P\'s parts/ and 1 IC(s) of the library');
  const pkg = await readPcmPackage(new Uint8Array(fs.readFileSync(path.join(ex, 'p.zip'))), CODEC);
  assert.deepEqual(pkg.symbols.map((s) => s.name).sort(), ['Silinx.kicad_sym', 'ttl.kicad_sym']);
  assert.equal(pkg.symbols.find((s) => s.name === 'ttl.kicad_sym').text, LIB);
  assert.equal(pkg.metadata.identifier, 'org.example.p');
  // and imported again into another project (import_part with the .zip)
  await ok('new_project', { name: 'Q' });
  assert.match((await ok('import_part', { project: 'Q', file: 'p.zip' })).text, /^parts\/Silinx\.kicad_sym written: 1 part\(s\), 1 of them as ICs of the library \(74161\)/m);
  await fails('export_part', { file: 'q.zip' }, 'project: the project whose KiCad parts are packaged');
  await fails('export_part', { file: 'q.zip', project: 'P', ...meta, identifier: 'bad' }, 'identifier: \'bad\' is not a reverse domain name of 2 to 50 letters, digits and - each (org.example.parts)');
  assert.equal(fs.existsSync(path.join(ex, 'q.zip')), false, 'nothing written by a refusal');
});
