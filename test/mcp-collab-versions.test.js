// A shared project's versions through the MCP (#5742, server/mcp-collab-versions.js): share_project publishes the
// owner's versions; follow_project's version lists them (a viewer too), and with an editor's link asks the owner to keep
// one (its name; the editor's name its author) or to restore one (a file, the whole project: done by the owner, written
// to its disk, the project before it kept as a version, seen by a follower), its answer's line; a viewer refused; a
// request of no version answered with its error. Through a running Silinx server's relay, as test/mcp-collab.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { closable } from './server-close.js';
import { followRoom } from '../core/collab-client.js';
import { docFile } from '../core/collab-doc.js';
import { parseFollowLink, relayUrl } from '../core/collab-link.js';
import { docVersions } from '../core/collab-versions.js';
import { unlabelled } from './mcp-label.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(25); } };

let tmp, srv, base, closeSrv;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-collab-versions-'));
  const { createApp, tokenFile } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'tok-mcp' });
  srv = app.listen(0, '127.0.0.1');
  closeSrv = closable(srv);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  fs.mkdirSync(path.dirname(tokenFile(srv.address().port)), { recursive: true });
  fs.writeFileSync(tokenFile(srv.address().port), 'tok-mcp');
});
after(async () => {
  await (await import('../server/mcp-collab.js')).endCollab();
  await closeSrv();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const { serverVersions } = await import('../server/versions.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
// (a tool's text with its untrusted label and its versions' times taken out)
const plain = t => t.replace(/^\[Untrusted[^\n]*\]\n/, '').replace(/\n\[End of untrusted content[^\n]*\]$/, '').replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, 'TIME');
const T = 'src/timer.vhd';

test('#5742 follow_project version: the owner\'s versions listed; an editor\'s save and restore done by the owner, its name the author; a viewer refused', async () => {
  await ok('new_project_from_example', { name: 'vlive', example: 'traffic' });
  await ok('save_version', { project: 'vlive', name: 'as made' });
  const orig = await P.readFile('vlive', T);
  const { data: { link, editLink } } = await ok('share_project', { project: 'vlive', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(link);
  const page = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, owner: l.owner ?? null, user: { name: 'Eva' } });
  await page.ready;
  // the owner's versions, at a follower's (the owner's own only)
  await until(() => docVersions(page.doc, { owner: page.owner()?.client ?? null }).length === 1, 'the versions at the follower\'s');
  const ls = await ok('follow_project', { link: editLink, name: 'Rui', version: { action: 'list' } });
  assert.equal(plain(ls.text), "1 version(s) of the owner's, newest first:\n  1  TIME  MCP  saved by hand: as made  (+9)");
  // the editor's change, then a version of it kept, its name the author
  const w = await ok('follow_project', { link: editLink, write: { path: T, text: `-- by Rui\n${orig}` } });
  assert.ok(w.text.includes('Wrote src/timer.vhd'), w.text);
  await until(async () => (await P.readFile('vlive', T)) === `-- by Rui\n${orig}`, 'the edit on the disk');
  const s = await ok('follow_project', { link: editLink, version: { action: 'save', name: 'Rui\'s line' } });
  assert.equal(plain(s.text), "Rui saved version 2: Rui's line.");
  const [v2] = await serverVersions(P).list('vlive');
  assert.deepEqual([v2.id, v2.author, v2.label, v2.reason], ['2', 'Rui', 'Rui\'s line', 'manual']);
  // a restore of one file: done by the owner, on its disk, at the follower's; the project before it kept
  const r = await ok('follow_project', { link: editLink, version: { action: 'restore', id: '1', path: T } });
  assert.equal(plain(r.text), 'Rui restored src/timer.vhd as version 1 had it: 1 file(s) written, 0 removed; the project before it kept as version 2.');
  assert.equal(await P.readFile('vlive', T), orig);
  await until(() => docFile(page.doc, T) === orig, 'the restore at the follower\'s');
  assert.deepEqual((await serverVersions(P).list('vlive')).slice(0, 1).map(v => [v.id, v.reason, v.of, v.author]), [['3', 'restore', '1', 'Rui']]);
  // the answer's line among the share's warnings (the owner's console)
  assert.match((await ok('share_project', { project: 'vlive', action: 'status' })).text, /Rui restored src\/timer\.vhd as version 1 had it/);
  // a version that is not there: its error, the answer's line
  const no = await call('follow_project', { link: editLink, version: { action: 'restore', id: '99' } });
  assert.deepEqual([no.isError, no.text], [true, "follow_project: version: Rui: Restore Version: no version 99 of 'vlive' (list_versions: the versions kept)"]);
  // a viewer: listed, never saved nor restored
  assert.equal(plain((await ok('follow_project', { link, name: 'Eva2', version: { action: 'list' } })).text).split('\n')[0], "3 version(s) of the owner's, newest first:");
  const v = await call('follow_project', { link, version: { action: 'restore', id: '1' } });
  assert.deepEqual([v.isError, v.text], [true, "follow_project: version: save and restore with an editor's link only (this one follows read only)"]);
  page.close();
  await ok('follow_project', { link, stop: true });
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'vlive', action: 'stop' });
});
