// Unit tests (#4772): web/js/debounce.js (a call a moment after the last of a burst: the ink dialogs' reading, the
// composition tab's refresh, the schematic view's refit) and web/js/download.js (a file given to the browser: the menus',
// the print dialog's, the waveform's, iMPACT's and Implement's), on node's mock timers and a document stub.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { debounce } from '../web/js/debounce.js';
import { downloadUrl, downloadBlob } from '../web/js/download.js';

test('debounce: one call ms after the last of a burst, with its arguments; cancel, flush, pending', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const calls = [];
    const later = debounce((...a) => calls.push(a), 100);
    later(1); mock.timers.tick(60); later(2); mock.timers.tick(60);
    assert.deepEqual(calls, [], 'a call again restarts the wait');
    assert.equal(later.pending(), true);
    mock.timers.tick(40);
    assert.deepEqual(calls, [[2]]);
    assert.equal(later.pending(), false);
    // cancel: nothing called
    later(3); later.cancel(); mock.timers.tick(200);
    assert.deepEqual(calls, [[2]]);
    // flush: the call pending made at once (no arguments: the ink dialogs' recognize), and not again later
    later(4); later.flush();
    assert.deepEqual(calls, [[2], []]);
    mock.timers.tick(200);
    assert.deepEqual(calls, [[2], []]);
    // flush with nothing pending: nothing
    later.flush();
    assert.equal(calls.length, 2);
    // the pending flag cleared before fn runs (fn may call later again)
    const again = debounce(() => { seen.push(again.pending()); if (seen.length < 2) again(); }, 10), seen = [];
    again(); mock.timers.tick(10); mock.timers.tick(10);
    assert.deepEqual(seen, [false, false]);
  } finally { mock.timers.reset(); }
});

test('downloadUrl and downloadBlob: a link with download clicked and removed; the blob\'s URL revoked after 5 s', () => {
  const made = [], body = [];
  const link = () => { const a = { clicked: 0, click() { this.clicked++; }, remove() { body.splice(body.indexOf(this), 1); } }; made.push(a); return a; };
  globalThis.document = { createElement: tag => (assert.equal(tag, 'a'), link()), body: { append: a => body.push(a) } };
  const revoked = [];
  const urls = { createObjectURL: () => 'blob:x1', revokeObjectURL: u => revoked.push(u) };
  const saved = globalThis.URL;
  globalThis.URL = urls;
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    downloadUrl('blob:job', 'top.bit');
    assert.deepEqual(made.map(a => [a.href, a.download, a.clicked]), [['blob:job', 'top.bit', 1]]);
    assert.deepEqual(body, [], 'the link removed');
    downloadBlob('wave.vcd', { size: 3 });
    assert.deepEqual(made.slice(1).map(a => [a.href, a.download, a.clicked]), [['blob:x1', 'wave.vcd', 1]]);
    mock.timers.tick(4999);
    assert.deepEqual(revoked, []);
    mock.timers.tick(1);
    assert.deepEqual(revoked, ['blob:x1']);
  } finally {
    mock.timers.reset();
    globalThis.URL = saved;
    delete globalThis.document;
  }
});
