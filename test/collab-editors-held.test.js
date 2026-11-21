// An editor's changes made before the owner listed its key (#4745): kept in their order and sent once it is, one frame
// each (30 rounds of a large block, whose merge would pass a follower's frame), the last text at the owner's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedRooms, socketPair } from '../core/collab-loop.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { projectDoc, publishProject, docFile, editFile } from '../core/collab-doc.js';
test('#4745 an editor\'s changes before it is listed: sent once it is, in their order, one frame each', async () => {
  const until = async (fn, what, ms = 5000) => { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 5)); } };
  const h = hostedRooms();
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'p', files: [{ path: 'a.vhd', lang: 'vhdl' }], fileTree: ['a.vhd'] }, files: { 'a.vhd': '-- a\n' }, owner: 'Ana' });
  const owner = await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, editors: true, WebSocket: h.owner, reconnect: false, onEvent: e => { if (e.type === 'error') console.error('OWNERERR', e.message); } });
  const S = function S() { const { client, room } = socketPair(); h.follower(room); return client; };
  const ed = await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, sign: owner.editKey, user: { name: 'R' }, WebSocket: S, reconnect: false });
  await ed.ready;
  const errs = []; 
  const yt = ed.doc.getMap('files').get('a.vhd');
  const block = '-- a large block of comments\n'.repeat(1500);
  for (let i = 0; i < 30; i++) {
    const head = yt.toString().length - 5;
    ed.doc.transact(() => { yt.delete(0, head); yt.insert(0, block); });
    ed.doc.transact(() => { yt.delete(0, block.length); yt.insert(0, `-- edit ${i}\n`); });
  }
  await ed.flush();
  await until(() => docFile(doc, 'a.vhd') === '-- edit 29\n-- a\n', 'held edits arrive').catch(e => { console.error('OWNER', JSON.stringify(docFile(doc, 'a.vhd').slice(0, 40)), 'listed', ed.listed); throw e; });
  await ed.close(); await owner.close();
});
