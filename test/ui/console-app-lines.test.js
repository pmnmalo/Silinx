// UI: the application's lines under every filter and task (#4729). An imported project (untrusted): its Trust Project
// notice, said when it opens; then a simulation's header and line, and after it the application's own information and
// error (logInfo, logError: "No quick fix here.", a busy refusal), which took the simulation's source before. Under each
// task (the Tasks interface's, or none) and each filter picked: the notice with its button, the information and the
// error shown, the simulation's line only where Simulation is. The console's warnings and errors asserted exactly.
// Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest } from './harness.js';
import { FILE, openImport } from './zip-helpers.js';
import { createZip } from '../../core/zip.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const NAME = 'Outside';
const SIM_LINE = 'Building simulation model for top \'tb\'...';

async function importZip(page) {
  const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, l) => zlib.inflateRawSync(d, { maxOutputLength: l }) };
  const top = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is port (a : in std_logic; y : out std_logic); end;\narchitecture rtl of top is begin y <= a; end;\n';
  const pj = { name: 'O', top: 'top', board: 'basys2-250', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }], device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } };
  const file = path.join(env.tmp, 'outside.zip');
  await fs.writeFile(file, await createZip([{ path: 'silinx.json', data: JSON.stringify(pj) }, { path: 'src/top.vhd', data: top }], codec));
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [file]);
  await page.fill('.dlg-overlay input[type=text]', NAME);
  await page.dialogButton('Import');
  await page.waitFor((n) => window.Silinx.project?.name === n, [NAME], { timeout: 30000, what: 'the project imported' });
}

// the lines asked about: [what, source, shown]
const lines = (page) => page.eval((simLine) => {
  const all = [...document.getElementById('console-log').children];
  const find = (what, test) => { const l = all.findLast(test); return l ? [what, l.dataset.src, !l.classList.contains('mc-off')] : [what, null, false]; };
  return [
    find('trust', (l) => !!l.querySelector('.ln-trust')),
    find('sim', (l) => l.textContent === simLine),
    find('info', (l) => l.textContent === 'INFO: No quick fix here.'),
    find('error', (l) => l.textContent === 'ERROR: Another operation is running'),
  ];
}, SIM_LINE);

uiTest('#4729 the application\'s lines (the Trust Project notice, its information and errors) shown under every task and filter', E, async (page) => {
  await importZip(page);
  await page.waitConsole(/came from outside \(imported\): it is edited/);
  await page.eval(async (simLine) => {
    const c = await import('/js/console.js');
    c.log('\nStarted : "Simulate Behavioral Model".\n', 'hdr');
    c.log(simLine);
    c.logInfo('No quick fix here.');
    c.logError('Another operation is running');
  }, SIM_LINE);
  for (const task of [null, 'edit', 'sim', 'emu', 'impl', 'prog']) {
    for (const filter of [null, 'all', 'check', 'sim', 'emu', 'impl']) {
      await page.eval(async (t) => (await import('/js/messages.js')).messagesTask(t), task);
      if (filter) await page.click(`#mc-filters .filt[data-src=${filter}]`);
      const simShown = filter === 'sim' || filter === 'all' || (!filter && (task === null || task === 'sim'));
      assert.deepEqual(await lines(page), [['trust', 'app', true], ['sim', 'sim', simShown], ['info', 'app', true], ['error', 'app', true]], `task ${task}, filter ${filter}`);
    }
  }
  await page.eval(async () => (await import('/js/messages.js')).messagesTask(null));
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l)), ['ERROR: Another operation is running']);
});
