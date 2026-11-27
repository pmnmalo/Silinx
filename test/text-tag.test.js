// A file's revision as a writer read it (#5915, core/text-tag.js): its text's tag, the same for the same text and
// another for another; a write with that tag as its precondition (If-Match) written over the text read only, else
// refused (412) with the text now's tag, in the exact words, by the local server (writeFile and its route) and the
// browser edition's stores; no precondition, written as before; the MCP's edit_system still writes its System.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { textTag, changedMeanwhile } from '../core/text-tag.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';
import { fakeDirectory } from './fixtures/fs-access-fake.js';
import { memStorage } from './fixtures/mem-storage.js';
import { scratchEnv, startApp } from './server-helpers.js';

const SAID = "'s.sys.json' was changed meanwhile (by another window, tab or tool): not written over; reopen it to see that change, or save again to keep yours";

test('textTag: the same text the same tag, another text another; none for no text', () => {
  assert.match(textTag(''), /^t-[0-9a-f]{16}$/);
  assert.equal(textTag('{"a":1}\n'), textTag('{"a":1}\n'));
  const seen = new Set(['', 'a', 'b', 'ab', 'ba', '{"a":1}', '{"a":2}', '{"a":1} ', 'é', 'é', 'x'.repeat(1e5), `${'x'.repeat(1e5)}y`].map(textTag));
  assert.equal(seen.size, 12, 'each its own');
  assert.equal(textTag(null), null);
  assert.equal(textTag(undefined), null);
});

test('changedMeanwhile: no precondition or the same text, none; another text, or none now, said', () => {
  assert.equal(changedMeanwhile('s.sys.json', 'a', null), null);
  assert.equal(changedMeanwhile('s.sys.json', 'a', textTag('a')), null);
  assert.equal(changedMeanwhile('s.sys.json', 'b', textTag('a')), SAID);
  assert.equal(changedMeanwhile('s.sys.json', null, textTag('a')), SAID, 'removed meanwhile');
});

let tmp, P;
before(async () => { tmp = await scratchEnv('silinx-text-tag-'); P = await import('../server/projects.js'); });
after(() => fs.rm(tmp, { recursive: true, force: true }));

test('#5915 the local server: written over the text read only; else 412, the file kept, the tag now given; its route\'s If-Match', async () => {
  await P.createProject({ name: 'Tag' });
  await P.writeFile('Tag', 's.sys.json', 'one');
  await P.writeFile('Tag', 's.sys.json', 'two', { ifMatch: textTag('one') });
  await assert.rejects(P.writeFile('Tag', 's.sys.json', 'three', { ifMatch: textTag('one') }), e => e.status === 412 && e.message === SAID && e.tag === textTag('two'));
  assert.equal(await P.readFile('Tag', 's.sys.json'), 'two', 'kept');
  await P.writeFile('Tag', 's.sys.json', 'four');   // (no precondition: as before)
  const app = await startApp();
  try {
    const url = `/projects/Tag/file?path=${encodeURIComponent('s.sys.json')}`;
    let r = await app.call('PUT', url, 'five', { 'If-Match': textTag('four') });
    assert.deepEqual([r.status, r.body], [200, { ok: true, tag: textTag('five') }]);
    r = await app.call('PUT', url, 'six', { 'If-Match': textTag('four') });
    assert.deepEqual([r.status, r.body], [412, { error: SAID, tag: textTag('five') }]);
    assert.equal(await fs.readFile(path.join(P.projectDir('Tag'), 's.sys.json'), 'utf8'), 'five');
  } finally { await app.close(); }
});

test('#5915 the browser edition\'s stores: the same precondition, refusal and tag', async () => {
  for (const store of [browserStore(memStorage()), folderStore(fakeDirectory('Silinx-projects'))]) {
    const ops = projectOps(() => store, {});
    await ops.create({ name: 'Tag', template: 'empty' });
    await ops.writeFile('Tag', 's.sys.json', 'one');
    assert.deepEqual(await ops.writeFile('Tag', 's.sys.json', 'two', { ifMatch: textTag('one') }), { ok: true, tag: textTag('two') });
    await assert.rejects(ops.writeFile('Tag', 's.sys.json', 'three', { ifMatch: textTag('one') }), e => e.status === 412 && e.message === SAID && e.tag === textTag('two'));
    assert.equal(await ops.readFile('Tag', 's.sys.json'), 'two', `${store.kind}: kept`);
  }
});
