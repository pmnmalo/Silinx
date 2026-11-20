// UI: a share resumed after the owner's page reloaded (#4850) says nothing of a follower it knew that comes back late
// (#4759, a regression: the owner's own view changed first, the follower's presence not yet back, the follower was said
// gone, then said to join again), in both interfaces: the editor's page holds back its presence while the owner's page
// reloads and the owner opens a file; once the editor's presence comes, neither "no longer follows" nor "edits your
// project" is said again. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const exactly = (line) => new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');
const count = async (page, line) => ((await page.consoleText()).match(new RegExp(exactly(line).source, 'gm')) || []).length;
const problems = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

async function open(link, name) {
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await fp.waitDialog('Follow a Shared Project');
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton('Follow');
  await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 30000 });
  return fp;
}

uiTest('#4759 a share resumed: a follower it knew, its presence late, said neither gone nor joining again', E, async (page) => {
  await makeProject(env, { name: 'Settle', top: 'top', files: { 'src/top.vhd': TOP, 'src/top.ucf': 'NET "a" LOC = "P1";\n' } });
  await page.openProject('Settle');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await open(edit, 'Rui');
  try {
    await page.waitConsole(/^Rui edits your project "Settle" with you\.$/m);
    // the editor's page: its presence (its awareness frames, kind 2) held back from now
    await ep.eval(() => {
      window.__hold = true;
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (d) { const b = typeof d === 'string' ? null : d instanceof Uint8Array ? d : new Uint8Array(d.buffer ?? d); if (window.__hold && b?.[0] === 2) return; return send.call(this, d); };
    });
    await page.reload();
    await page.waitConsole(/^Sharing project "Settle" again after the page was reloaded: the same links; its followers reconnect by themselves\.$/m, 30000);
    // the owner's own view changed before the editor's presence came
    await page.eval(() => window.SilinxApp.openFile('src/top.ucf'));
    await page.waitFor(() => window.Silinx.active?.path === 'src/top.ucf', [], { what: 'the owner\'s view changed' });
    await new Promise((r) => setTimeout(r, 1500));
    // the editor's presence comes
    await ep.eval(() => { window.__hold = false; const ed = window.Silinx.active?.editor; ed?.setCursor?.({ line: 1, ch: 0 }); });
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1) again', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));
    assert.deepEqual([await count(page, 'Rui no longer follows your project.'), await count(page, 'Rui edits your project "Settle" with you.')], [0, 0]);
    assert.deepEqual(await problems(page), []);
  } finally { await ep.close(); }
}, { timeout: 180000 });
