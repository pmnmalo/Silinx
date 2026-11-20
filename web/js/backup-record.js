// The browser edition's back-up records (#4971, core/backup.js), as the server's (server/backup-store.js): in this
// browser's localStorage, outside the projects, by the storage and the project's name (a project of the browser's
// storage by its name; one of a workspace folder by the folder's name, then its own). Written by web/js/api-local.js
// (an export, a commit pushed to GitHub, a rename, a delete), read by the reminder (web/js/backup-reminder.js).
import { prefKey } from './prefs.js';
import { backupOf, seen, recordBackup, moveBackup, forgetBackup } from '../../core/backup.js';

const KEY = prefKey('silinx.backups');
// (localStorage; where there is none, as in Node's tests, this page's memory)
let mem = null;
const area = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
function load() {
  try { const a = area(); const j = JSON.parse((a ? a.getItem(KEY) : mem) || 'null'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
function save(j) { const t = JSON.stringify(j); try { const a = area(); if (a) a.setItem(KEY, t); else mem = t; } catch { mem = t; } }
const change = fn => { const j = load(); const r = fn(j); save(j); return r; };

/** A record's key: the storage's ('browser', or the folder's name) and the project's name. */
export const backupKey = (store, name) => (store.kind === 'folder' ? `folder:${store.label}:${name}` : `browser:${name}`);

/** A project's record ({ since, last?, how? }) or null. */
export const backupRecord = key => backupOf(load(), key);
/** A project seen (opened): its first sight kept; its record. */
export const sawProject = (key, now = Date.now()) => change(j => ({ ...seen(j, key, now) }));
/** A project backed up now ('export' | 'github'). */
export const recordProjectBackup = (key, how, now = Date.now()) => change(j => ({ ...recordBackup(j, key, how, now) }));
/** A project renamed, deleted: its record moved, removed. */
export const moveProjectBackup = (from, to) => change(j => { moveBackup(j, from, to); });
export const forgetProjectBackup = key => change(j => { forgetBackup(j, key); });
