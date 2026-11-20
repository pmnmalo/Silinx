// One syntax for a project-relative path (#4769): core/import-gate.js normalizePath, with options, behind filePath (a
// file operation's path), the browser store's safePath (a backslash read as '/') and a design link's paths. Each is
// checked against the implementation it replaced, kept here as it was, on paths that try every rule: the same answer,
// but a DEL character, which the syntax now refuses everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { filePath, normalizePath } from '../core/import-gate.js';
import { safePath } from '../web/js/project-store.js';
import { decodeDesign } from '../core/design-link.js';
import { foldsToProjectFile, PROJECT_FILE } from '../core/fold-name.js';

// ---- the implementations before #4769, as they were
function oldFilePath(p) {
  const no = reason => ({ reason, message: reason === 'no name' ? 'missing path' : `'${p}': invalid path: ${reason}` });
  if (typeof p !== 'string' || !p) return no('no name');
  // eslint-disable-next-line no-control-regex
  if (/[\0-\x1f\x7f]/.test(p)) return no('control character in the name');
  if (/^[A-Za-z]:/.test(p)) return no('absolute path (a drive letter)');
  if (p.includes('\\')) return no('backslash in the name');
  if (p.startsWith('/')) return no('absolute path');
  const parts = p.split('/').filter(s => s !== '' && s !== '.');
  if (!parts.length) return no("the project's folder, not a file's path");
  if (parts.includes('..')) return no("path leaves the project ('..')");
  return { path: parts.join('/') };
}
function oldSafePath(p) {
  // eslint-disable-next-line no-control-regex
  if (typeof p !== 'string' || /[\0-\x1f]/.test(p)) return null;
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts[0] === '' || /^[A-Za-z]:$/.test(parts[0]) || parts.includes('..')) return null;
  const out = parts.filter(s => s !== '' && s !== '.');
  return out.length ? out.join('/') : null;
}
function oldLinkPath(p) {
  const parts = p.split('/'), last = parts[parts.length - 1];
  // eslint-disable-next-line no-control-regex
  return p.length > 0 && p.length <= 255 && !/[\\:\0-\x1f]/.test(p) && !foldsToProjectFile(p)
    && !(last !== PROJECT_FILE && foldsToProjectFile(last))
    && parts.every(s => s && s !== '..' && !s.startsWith('.'));
}

const PATHS = ['src/a.vhd', './src//a.vhd', 'a', '.', './', '', '/', '//', '/etc/passwd', '\\\\host\\x', 'C:\\x', 'C:/x', 'c:x', 'C:',
  'src\\a.vhd', 'src\\..\\x', '..', '../x', 'src/../x', 'src/..', 'a/./b', 'a//b', 'a/b/', '.git/config', 'src/.silinx', '.env',
  'silinx.json', 'SILINX.JSON', 'src/silinx.json', 'src/\u017filinx.json', 'a\0b', 'a\nb', 'a\tb', 'a\x7fb', 'a\u202eb.vhd',
  'src/<x>.vhd', 'a:b', 'build/x', 'con.txt', 'GIT~1/x', 'a. ', 'x'.repeat(256), `src/${'x'.repeat(300)}.vhd`, '__proto__', 'ü/ñ.vhd',
  'a\\b\\', 'C:\\', '\\x', 'x\\\\y'];

test('filePath through normalizePath\'s syntax: the same paths and messages as before', () => {
  for (const p of [...PATHS, null, undefined, 5, {}]) assert.deepEqual(filePath(p), oldFilePath(p), JSON.stringify(p));
});

test('the browser store\'s safePath through normalizePath (a backslash read as \'/\'): the same as before, but a DEL refused', () => {
  for (const p of [...PATHS, null, 5]) {
    const want = typeof p === 'string' && p.includes('\x7f') ? null : oldSafePath(p);
    assert.equal(safePath(p), want, JSON.stringify(p));
  }
  assert.equal(oldSafePath('a\x7fb'), 'a\x7fb');
});

// a design link with one file at `p`: accepted, or refused as a file outside the project
const raw = payload => Buffer.from(zlib.deflateRawSync(Buffer.from(JSON.stringify(payload)))).toString('base64url');
const linkTakes = async p => decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { [p]: '' } })).then(() => true,
  e => { if (!/outside the project/.test(e.message)) throw e; return false; });

test('a design link\'s paths through normalizePath\'s syntax and its own rules: the same as before, but a DEL refused', async () => {
  for (const p of PATHS.filter(Boolean)) assert.equal(await linkTakes(p), oldLinkPath(p) && !p.includes('\x7f'), JSON.stringify(p));
});

test('normalizePath: names false, the syntax alone; backslashes true, read as \'/\'; a name\'s rules with names', () => {
  assert.deepEqual(normalizePath('build/.x/con.txt', { names: false }), { path: 'build/.x/con.txt' });
  assert.deepEqual(normalizePath('build/.x/con.txt'), { reason: "hidden file or folder ('.x')" });
  assert.deepEqual(normalizePath('src\\a.vhd'), { reason: 'backslash in the name' });
  assert.deepEqual(normalizePath('src\\a.vhd', { backslashes: true }), { path: 'src/a.vhd' });
  assert.deepEqual(normalizePath('C:\\a', { backslashes: true }), { reason: 'absolute path (a drive letter)' });
  assert.deepEqual(normalizePath('\\\\host\\a', { backslashes: true }), { reason: 'absolute path' });
  assert.deepEqual(normalizePath('a\\..\\b', { backslashes: true, names: false }), { reason: "path leaves the project ('..')" });
  assert.deepEqual(normalizePath('a\u202eb', { names: false }), { path: 'a\u202eb' });
  assert.match(normalizePath('a\u202eb').reason, /U\+202E/);
  assert.deepEqual(normalizePath('x'.repeat(5000), { names: false }), { path: 'x'.repeat(5000) });
  assert.match(normalizePath('x'.repeat(5000)).reason, /^path longer than/);
  // (with names, a name's rule before a later '..', as before)
  assert.deepEqual(normalizePath('a<b/../x'), { reason: 'character not allowed in a name (< > : " | ? *): \'a<b\'' });
});
