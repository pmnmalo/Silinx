// Share Project… ▸ Live's two ways, in the browser edition (#4634; its page hosts the room, collab-host.js), chosen in
// the window's Share: row (web/js/share-how.js) and explained below it: through
// your Cloudflare relay (#4543: its followers meet the page there and connect to it directly when they can, through
// the relay otherwise), set up first in the Collaboration tab (web/js/relay-setup.js, kept in web/js/relay-setting.js:
// its address shown, Change… opens the guide, its key never shown), or peer to peer, no relay (#3227: the public
// meeting point, or codes exchanged by hand, Add a User…). The way chosen kept per viewer: by default the Cloudflare
// relay when one is set up, peer to peer otherwise.
import { h } from './ui.js';
import { prefKey } from './prefs.js';
import { savedRelay } from './relay-setting.js';

const VIA_KEY = prefKey('silinx.collab.via');
const VIAS = Object.freeze(['relay', 'peer']);

const hostOf = a => { try { return new URL(a).host; } catch { return a; } };
const keptVia = () => { try { const v = localStorage.getItem(VIA_KEY); return VIAS.includes(v) ? v : null; } catch { return null; } };
const keepVia = v => { try { localStorage.setItem(VIA_KEY, v); } catch { /* this page only */ } };

/** The way Live shares by default: the one last chosen (the relay only while one is set up), else the Cloudflare relay
 *  when one is set up, else peer to peer. */
function defaultVia() {
  const has = !!savedRelay().address, v = keptVia();
  if (v === 'peer' || (v === 'relay' && has)) return v;
  return has ? 'relay' : 'peer';
}

/** Live's way explained, below the window's Share: row (whose radios choose it, web/js/share-how.js): { el, via()
 *  ('relay' | 'peer'), setVia(v), relay() (the relay set, or null), ready() (Start Sharing possible: peer to peer, or a
 *  relay set), kept() (the way kept as the viewer's), off() (its listener removed) }; `changed` called when the relay
 *  set changes. */
export function viaPart({ via = defaultVia(), changed = () => {} } = {}) {
  // (the relay set: its address and Change…; none: said, and Set Up a Cloudflare Relay… here)
  const status = h('div', { class: 'share-via-status' });
  const setUp = async () => { await (await import('./relay-setup.js')).relaySetupDialog(); };
  const drawRelay = () => {
    const r = savedRelay();
    status.replaceChildren(...(r.address
      ? [h('span', {}, 'Your relay:'), h('span', { class: 'share-via-at', 'data-no-i18n': '', title: r.address }, hostOf(r.address)),
        h('button', { class: 'btn', 'data-action': 'relay-change', onclick: setUp }, 'Change…')]
      : [h('span', { class: 'share-via-none' }, 'No Cloudflare relay is set up yet: set one up first, here or in the Collaboration tab ▸ Cloudflare Relay.'),
        h('button', { class: 'btn', 'data-action': 'relay-setup', onclick: setUp }, 'Set Up a Cloudflare Relay…')]));
  };
  const relayAbout = h('div', { class: 'share-via-relay' },
    h('p', {}, 'Your followers meet you at a relay of your own on Cloudflare, then connect to you directly when they can, through the relay otherwise. It works on school and other locked-down networks, and counts against your free Cloudflare plan.'),
    status);
  const peerAbout = h('div', { class: 'share-via-peer' },
    h('p', {}, 'No setup: your followers find you at the public meeting point and connect browser to browser (WebRTC), or send you a code, which Add a User… takes. It may fail on networks that block direct connections.'));
  const el = h('div', { class: 'share-via' }, peerAbout, relayAbout);   // (the Share row's order, #4670)
  const show = () => { relayAbout.hidden = via !== 'relay'; peerAbout.hidden = via !== 'peer'; };
  drawRelay(); show();
  const onRelay = () => { drawRelay(); changed(); };
  addEventListener('silinx:relay-changed', onRelay);
  const relay = () => { const r = savedRelay(); return r.address ? r : null; };
  return {
    el,
    via: () => via,
    setVia: v => { via = v; show(); },
    relay,
    ready: () => via === 'peer' || !!relay(),
    kept: () => keepVia(via),
    off: () => removeEventListener('silinx:relay-changed', onRelay),
  };
}
