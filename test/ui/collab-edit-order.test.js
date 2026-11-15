// UI: an editor's quick edits of a text file written to the owner's disk in their order (#4110, web/js/collab-share.js
// onEdits through core/collab-doc.js watchDoc inOrder), in both interfaces: the owner's page shares; an editor (a
// participant of the test's own, core/collab-client.js followRoom with the editors' link) makes, round after round, a
// large block of the file's first lines then a line in its place: the file on the disk ends as the shared text, the
// last line's, and stays so (no earlier, slower write after it). No warnings but the project untrusted by the editor's
// first change (#3355).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { followRoom } from '../../core/collab-client.js';
import { parseFollowLink, relayUrl } from '../../core/collab-link.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

uiTest('#4110 an editor\'s quick edits written to the owner\'s disk in their order: the file ends as the shared text, never an earlier one', E, async (page) => {
  await makeProject(env, { name: 'Order', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Order');
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const l = parseFollowLink(edit);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  try {
    await ed.ready;
    await page.waitConsole(/^Rui edits your project "Order" with you\.$/m);
    // (each round two changes of the owner's document: a large block first, then a line in its place: the block's
    // write, the slower, finishing after the line's when nothing orders them)
    const yt = ed.doc.getMap('files').get('src/top.vhd');
    const block = '-- a large block of comments\n'.repeat(1500);
    for (let i = 0; i < 30; i++) {
      const head = yt.toString().length - TOP.length;
      ed.doc.transact(() => { yt.delete(0, head); yt.insert(0, block); });
      ed.doc.transact(() => { yt.delete(0, block.length); yt.insert(0, `-- edit ${i}\n`); });
    }
    await ed.flush();
    const last = `-- edit 29\n${TOP}`;
    for (let t = Date.now(); Date.now() - t < 15000 && await readWs(env, 'Order', 'src/top.vhd') !== last;) await sleep(100);
    assert.equal(await readWs(env, 'Order', 'src/top.vhd'), last);
    await sleep(1000);
    assert.equal(await readWs(env, 'Order', 'src/top.vhd'), last, 'no earlier text written after it');
  } finally { await ed.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  // (the project untrusted by the editor's first change, #3355: the owner's one warning)
  assert.deepEqual(await warnings(page), ['WARNING: Project "Order" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project']);
}, { timeout: 120000 });
