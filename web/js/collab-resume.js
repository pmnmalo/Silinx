// A live share or follow resumed after a reload (#4850, core/collab-resume.js's records): at `pagehide` the page's
// share (collab-share.js) or follow (collab-follow.js) is kept in its tab's sessionStorage, or nothing (a share stopped,
// a follow ended: no record left behind); once the page is loaded again by a reload, start-up takes it back (and
// removes it), and the share or the follow resumes with it. A page opened otherwise (a new tab, a tab restored after it
// was closed, a link) resumes nothing: closing the tab ends the share as before.
//   keepOnReload(record): the function that gives the page's record (its JSON text) at pagehide, or null
//   takeRecord() -> the record of the reload that loaded this page (null: none)
//   forgetRecord(): no record (Stop Sharing, Stop Following)
import { prefKey } from './prefs.js';
import { readRecord } from '/core/collab-resume.js';

const KEY = prefKey('silinx.collab.resume');
const records = new Set();
let watching = false;

/** Kept at each pagehide: the first record one of these functions gives (none: the old one removed). */
export function keepOnReload(record) {
  records.add(record);
  if (watching) return;
  watching = true;
  addEventListener('pagehide', () => {
    let text = null;
    for (const r of records) { try { text = r(); } catch { text = null; } if (text) break; }
    try { if (text) sessionStorage.setItem(KEY, text); else sessionStorage.removeItem(KEY); } catch { /* too large, or no storage: not resumed */ }
  });
  // (a page the browser kept and shows again, back or forward: no reload follows that would take the record)
  addEventListener('pageshow', e => { if (e.persisted) forgetRecord(); });
}

/** No record (a share stopped, a follow left). */
export function forgetRecord() { try { sessionStorage.removeItem(KEY); } catch { /* none */ } }

// (this page loaded by a reload: the navigation's type)
const reloaded = () => {
  try { return performance.getEntriesByType('navigation')[0]?.type === 'reload'; } catch { return false; }
};

/** The record the reload that loaded this page kept (null: none, or not a reload); taken: removed. */
export function takeRecord() {
  let raw = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch { return null; }
  return raw && reloaded() ? readRecord(raw) : null;
}
