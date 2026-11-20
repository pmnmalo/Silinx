// A project's back-ups (#4971): core/backup.js (the records, when a reminder is due, its line, project_info's last
// back-up) and the browser edition's records (web/js/backup-record.js, in this process's memory without localStorage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_DAYS, backupOf, seen, recordBackup, moveBackup, forgetBackup, backupDue, daysSince, reminderLine, lastBackup } from '../core/backup.js';
import { backupKey, backupRecord, sawProject, recordProjectBackup, moveProjectBackup, forgetProjectBackup } from '../web/js/backup-record.js';

const DAY = 24 * 3600 * 1000, T0 = Date.UTC(2026, 10, 1, 12);

test('the records: first sight kept, a back-up recorded, moved with a rename, removed with a delete', () => {
  const recs = {};
  assert.equal(backupOf(recs, 'a'), null);
  assert.deepEqual(seen(recs, 'a', T0), { since: T0 });
  assert.deepEqual(seen(recs, 'a', T0 + DAY), { since: T0 }, 'its first sight kept');
  assert.deepEqual(recordBackup(recs, 'a', 'export', T0 + 2 * DAY), { since: T0, last: T0 + 2 * DAY, how: 'export' });
  assert.deepEqual(recordBackup(recs, 'b', 'github', T0), { since: T0, last: T0, how: 'github' }, 'a back-up of one never seen: seen then');
  moveBackup(recs, 'a', 'c');
  assert.equal(backupOf(recs, 'a'), null);
  assert.deepEqual(backupOf(recs, 'c'), { since: T0, last: T0 + 2 * DAY, how: 'export' });
  moveBackup(recs, 'none', 'd');
  assert.equal(backupOf(recs, 'd'), null, 'nothing moved: no record made');
  forgetBackup(recs, 'c');
  assert.equal(backupOf(recs, 'c'), null);
  // (a name that is an object's own key: a record like any other)
  seen(recs, '__proto__', T0);
  seen(recs, 'constructor', T0);
  assert.deepEqual(backupOf(recs, '__proto__'), { since: T0 });
  assert.equal(backupOf(recs, 'toString'), null);
  assert.equal(backupOf(null, 'a'), null);
});

test('backupDue: BACKUP_DAYS after the last back-up, or after the first sight when there is none', () => {
  assert.equal(BACKUP_DAYS, 7);
  const never = { since: T0 };
  assert.equal(backupDue(never, T0 + 7 * DAY - 1), false);
  assert.equal(backupDue(never, T0 + 7 * DAY), true);
  const done = { since: T0, last: T0 + 5 * DAY, how: 'export' };
  assert.equal(backupDue(done, T0 + 11 * DAY), false, 'six days after the back-up');
  assert.equal(backupDue(done, T0 + 12 * DAY), true);
  assert.equal(backupDue(done, T0 + 6 * DAY, 1), true, 'days given');
  assert.equal(backupDue(null, T0), false);
  assert.equal(backupDue({}, T0), false);
  assert.equal(daysSince(T0, T0 + 9.5 * DAY), 9);
  assert.equal(daysSince(T0 + DAY, T0), 0, 'a clock put back: never negative');
});

test('the reminder\'s line, and project_info\'s last back-up', () => {
  assert.equal(reminderLine('blinky', { since: T0 }, T0 + 8 * DAY),
    'Project \'blinky\' is kept only in this browser\'s storage and was never backed up (8 day(s)): clearing the browser\'s data loses it. Export it, or keep it in a GitHub repository.');
  assert.equal(reminderLine('blinky', { since: T0, last: T0 + DAY, how: 'github' }, T0 + 10 * DAY),
    'Project \'blinky\' is kept only in this browser\'s storage and was last backed up 9 day(s) ago: clearing the browser\'s data loses it. Export it, or keep it in a GitHub repository.');
  assert.equal(lastBackup({ since: T0 }), null);
  assert.equal(lastBackup(null), null);
  assert.deepEqual(lastBackup({ since: T0, last: T0, how: 'github' }), { at: '2026-11-01T12:00:00.000Z', how: 'github' });
  assert.deepEqual(lastBackup({ since: T0, last: T0, how: 'other' }), { at: '2026-11-01T12:00:00.000Z', how: 'export' });
});

test('the browser edition\'s records: by the storage and the name; seen, backed up, renamed, deleted', () => {
  const browser = { kind: 'browser', label: null }, folder = { kind: 'folder', label: 'Silinx-projects' };
  assert.equal(backupKey(browser, 'p'), 'browser:p');
  assert.equal(backupKey(folder, 'p'), 'folder:Silinx-projects:p');
  const k = backupKey(browser, 'p');
  assert.equal(backupRecord(k), null);
  assert.deepEqual(sawProject(k, T0), { since: T0 });
  assert.deepEqual(sawProject(k, T0 + DAY), { since: T0 });
  assert.deepEqual(recordProjectBackup(k, 'export', T0 + 2 * DAY), { since: T0, last: T0 + 2 * DAY, how: 'export' });
  assert.equal(backupRecord(backupKey(folder, 'p')), null, 'the folder\'s project of that name: another record');
  moveProjectBackup(k, backupKey(browser, 'q'));
  assert.equal(backupRecord(k), null);
  assert.deepEqual(backupRecord(backupKey(browser, 'q')), { since: T0, last: T0 + 2 * DAY, how: 'export' });
  forgetProjectBackup(backupKey(browser, 'q'));
  assert.equal(backupRecord(backupKey(browser, 'q')), null);
});
