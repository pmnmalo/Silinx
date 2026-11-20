// The browser edition's first run (#4962, web/js/storage-choice.js): a workspace folder offered only where the browser
// can give one (Chrome, Edge), none in use, remembered or waiting for its permission, the offer not answered; the texts
// of the offer and of the browser's projects copied or moved into the folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFER, KEPT, shouldOffer, copyQuestion, deleteQuestion, keptLine, deletedLine } from '../web/js/storage-choice.js';

const FIRST = { kind: 'browser', folder: null, remembered: null, needsPermission: false, supported: true };

test('shouldOffer: the first run in Chrome / Edge only', () => {
  assert.equal(shouldOffer(FIRST, null), true);
  // answered: kept in the browser, or a folder chosen
  assert.equal(shouldOffer(FIRST, 'browser'), false);
  assert.equal(shouldOffer(FIRST, 'folder'), false);
  // Safari, Firefox: no File System Access API
  assert.equal(shouldOffer({ ...FIRST, supported: false }, null), false);
  // a folder in use, one remembered (Reopen <folder>), one waiting for the browser's permission
  assert.equal(shouldOffer({ ...FIRST, kind: 'folder', folder: 'Silinx-projects' }, null), false);
  assert.equal(shouldOffer({ ...FIRST, remembered: 'Silinx-projects' }, null), false);
  assert.equal(shouldOffer({ ...FIRST, needsPermission: true }, null), false);
  assert.equal(shouldOffer(null, null), false);
});

test('the offer\'s texts', () => {
  assert.equal(OFFER, 'This browser can keep the projects in a folder on the disk, where clearing the browser\'s data does not lose them: choose a workspace folder, or keep them in this browser\'s storage.');
  assert.equal(KEPT, 'Projects stay in this browser\'s storage (File > Open Workspace Folder… keeps them in a folder on the disk).');
  assert.equal(copyQuestion(['a', 'b'], 'Silinx-projects'), 'This browser\'s storage has 2 project(s): a, b. Copy them into the folder \'Silinx-projects\'? Move… copies them, then deletes them from this browser\'s storage once you confirm.');
  assert.equal(deleteQuestion(['a'], 'W'), 'Delete 1 project(s) from this browser\'s storage: a? They are now in the folder \'W\'; this cannot be undone.');
  assert.equal(keptLine(['a', 'b']), 'Kept 2 project(s) in this browser\'s storage too: a, b.');
  assert.equal(deletedLine(['a'], 'W'), 'Deleted 1 project(s) from this browser\'s storage: a (now in the folder \'W\').');
});

test('the dialogs\' texts are translated (their Portuguese patterns)', async () => {
  const { WIZARDS_PT_PATTERNS } = await import('../web/js/i18n-wizards.js');
  const pt = (s) => { for (const [re, to] of WIZARDS_PT_PATTERNS) if (re.test(s)) return s.replace(re, to); return null; };
  assert.equal(pt(copyQuestion(['a', 'b'], 'W')), 'O armazenamento deste navegador tem 2 projeto(s): a, b. Copiá-los para a pasta \'W\'? Mover… copia-os e depois apaga-os do armazenamento deste navegador, depois de confirmar.');
  assert.equal(pt(deleteQuestion(['a'], 'W')), 'Apagar 1 projeto(s) do armazenamento deste navegador: a? Estão agora na pasta \'W\'; não se pode desfazer.');
});
