// The browser edition's relay (#3227, #4543): a relay of this browser's settings (its address, its key), which Share
// Project… ▸ Live uses by default (its followers met there) and the Collaboration tab's Relay box sets, checks and
// forgets (#4574, web/js/relay-setup.js). Never in a link. Kept as the GitHub sign-in is (#4737, web/js/git-browser.js):
// in this browser (localStorage: Remember, the default), or in this tab only (sessionStorage: forgotten when it closes)
// when the user unticks it; the single file opened from the disk (file:, #3530) keeps it in its tab only, never in
// localStorage, whose one origin every page opened from the disk reads: a relay left there by an older Silinx is moved
// to the tab when it is read.
import { prefKey } from './prefs.js';

const RELAY_KEY = prefKey('silinx.collab.relay');
const area = kind => { try { return globalThis[kind] ?? null; } catch { return null; } };
const get = kind => { try { return area(kind)?.getItem(RELAY_KEY) ?? null; } catch { return null; } };
const put = (kind, v) => { try { if (v === null) area(kind)?.removeItem(RELAY_KEY); else area(kind)?.setItem(RELAY_KEY, v); } catch { /* not kept */ } };
/** Whether the relay may be remembered in this browser: not at file: (#3530, #4737), whose storage every local page reads. */
export const canRememberRelay = () => { try { return globalThis.location?.protocol !== 'file:'; } catch { return true; } };

// the relay's record as kept: this tab's first; at file:, one left in localStorage moved to this tab
const record = () => {
  const tab = get('sessionStorage');
  if (tab !== null) return tab;
  const kept = get('localStorage');
  if (kept !== null && !canRememberRelay()) { put('sessionStorage', kept); put('localStorage', null); }
  return kept;
};

/** The relay set ({ address, key, remembered }; '' when none; remembered: kept in this browser, not this tab only). */
export const savedRelay = () => {
  try {
    const raw = record(), r = JSON.parse(raw || 'null');
    return { address: r?.on === false ? '' : String(r?.address || ''), key: String(r?.key || ''), remembered: raw !== null && get('localStorage') === raw };
  } catch { return { address: '', key: '', remembered: false }; }
};
/** The relay set to { address, key }, remembered in this browser unless remember is false (at file:, never); an empty
 *  address forgets it (#4574: and its key), wherever it was kept. */
export const keepRelay = r => {
  put('sessionStorage', null);
  put('localStorage', null);
  if (String(r?.address || '').trim()) {
    put(r.remember !== false && canRememberRelay() ? 'localStorage' : 'sessionStorage', JSON.stringify({ address: String(r.address).trim(), key: String(r.key || '') }));
  }
  globalThis.dispatchEvent?.(new CustomEvent('silinx:relay-changed'));
};
