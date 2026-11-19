// The browser edition's relay (#3227, #4543): a relay of this browser's settings (its address, its key), which Share
// Project… ▸ Live uses by default (its followers met there) and the Collaboration tab's Relay box sets, checks and
// forgets (#4574, web/js/relay-setup.js). Kept in this browser only (localStorage), never in a link.
import { prefKey } from './prefs.js';

const RELAY_KEY = prefKey('silinx.collab.relay');

/** The relay set ({ address, key }; '' when none). */
export const savedRelay = () => { try { const r = JSON.parse(localStorage.getItem(RELAY_KEY) || 'null'); return { address: r?.on === false ? '' : String(r?.address || ''), key: String(r?.key || '') }; } catch { return { address: '', key: '' }; } };
/** The relay set to { address, key }; an empty address forgets it (#4574: and its key). */
export const keepRelay = r => {
  try {
    if (!String(r?.address || '').trim()) localStorage.removeItem(RELAY_KEY);
    else localStorage.setItem(RELAY_KEY, JSON.stringify({ address: String(r.address).trim(), key: String(r.key || '') }));
  } catch { /* this page only */ }
  dispatchEvent(new CustomEvent('silinx:relay-changed'));
};
