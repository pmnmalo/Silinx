// A relay of one's own on Cloudflare (#4574), from the Collaboration tab's Relay box (the browser edition's: its page
// hosts the room and meets its followers at the relay, #4543): Set Up a Cloudflare Relay… makes a key in the page
// (WebCrypto), copies it, opens the Deploy to Cloudflare button in a new tab, then takes the relay's address, checks the
// relay (core/relay-setup.js: it answers, it lets this site in, its key opens a meeting point) and keeps it in this
// browser's settings (web/js/relay-setting.js), which Share Project… ▸ Live uses by default. Check Relay checks it
// again; Forget Relay forgets it. Every result in the console; the key in no link, address or message.
import { h, dialog } from './ui.js';
import { app } from './app.js';
import { writeClip } from './clipboard.js';
import { savedRelay, keepRelay } from './relay-setting.js';
import { checkRelay, newRelayKey, DEPLOY_URL } from '/core/relay-setup.js';
import { relayAddress } from '/core/collab-link.js';

const hostOf = a => { try { return new URL(a).host; } catch { return a; } };

/** The relay checked from this page (its CSP's relays first: web/js/collab-share.js relayOk): { ok, address, error }. */
async function checkHere({ address, key }) {
  const at = relayAddress(String(address || '').trim());
  if (at) {
    const { relayOk, notHere } = await import('./collab-share.js');
    if (!await relayOk(at)) return { ok: false, address: at, error: notHere(at) };
  }
  return checkRelay({ address, key, origin: location.origin });
}

// the check's result said in the console (and returned)
function said(r) {
  if (r.ok) app.log(`Relay: ${r.lines[0]} Share Project… ▸ Live meets your followers there.`, 'ok');
  else app.log(`ERROR: Relay: ${r.error}.`, 'err');
  return r;
}

/** Check Relay: the relay set, checked again. */
async function checkSavedRelay() {
  const r = savedRelay();
  if (!r.address) { app.log('ERROR: Relay: no relay is set (Set Up a Cloudflare Relay…).', 'err'); return null; }
  return said(await checkHere(r));
}

/** Forget Relay: none set; Share Project… ▸ Live meets the followers at the public meeting point again. */
function forgetRelay() {
  if (!savedRelay().address) return;
  keepRelay({ address: '', key: '' });
  app.log('Relay forgotten: Share Project… ▸ Live meets your followers at the public meeting point.', 'info');
}

/** Set Up a Cloudflare Relay…: its key (this browser's relay's, or a new one), Deploy to Cloudflare, its address;
 *  Check and Save keeps it once checked. Resolves to the relay kept ({ address, key }), or null. */
export async function relaySetupDialog() {
  const r0 = savedRelay();
  const key = h('input', { type: 'password', 'data-field': 'relay-key', value: r0.key || newRelayKey(), autocomplete: 'off', spellcheck: 'false', style: { flex: '1' } });
  const show = h('button', { class: 'btn', 'data-action': 'show-key', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; show.textContent = key.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
  const copy = h('button', { class: 'btn', 'data-action': 'copy-key', onclick: () => { writeClip('text', key.value); app.log('Relay key copied: give it to Cloudflare when it asks for RELAY_KEY, and keep it somewhere safe.', 'ok'); } }, 'Copy');
  const fresh = h('button', { class: 'btn', 'data-action': 'new-key', onclick: () => { key.value = newRelayKey(); } }, 'New Key');
  const address = h('input', { type: 'text', 'data-field': 'relay', 'data-no-i18n': '', value: r0.address, placeholder: 'https://silinx-relay.<you>.workers.dev', autocomplete: 'off', spellcheck: 'false', style: { width: '100%' } });
  const err = h('div', { class: 'wiz-error relay-setup-error', 'data-no-i18n': '' });   // (the console's message, as it is)
  let kept = null;
  const save = async () => {
    err.textContent = '';
    const r = said(await checkHere({ address: address.value, key: key.value }));
    if (!r.ok) { err.textContent = r.error; return false; }
    kept = { address: r.address, key: key.value };
    keepRelay(kept);
    return true;
  };
  await dialog({
    title: 'Set Up a Cloudflare Relay', width: 600, className: 'relay-setup',
    onOpen: () => setTimeout(() => (r0.address ? address : copy).focus(), 0),
    body: h('div', { class: 'relay-setup-body' },
      h('p', {}, 'A relay of your own, on Cloudflare\'s free plan: your followers find you there, and connect through it when they cannot connect to you directly.'),
      h('p', {}, '1. Its key, made here: copy it and keep it somewhere safe.'),
      h('div', { class: 'relay-key-row', style: { display: 'flex', gap: '6px' } }, key, show, copy, fresh),
      h('p', {}, '2. Deploy it: sign in to Cloudflare (or sign up, free) and give the key when it asks for RELAY_KEY.'),
      h('p', {}, h('a', { class: 'relay-deploy', href: DEPLOY_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Deploy to Cloudflare')),
      h('p', {}, '3. Its address, which Cloudflare shows at the end:'), address, err),
    buttons: [{ label: 'Check and Save', primary: true, validate: save, value: () => kept }, { label: 'Cancel', value: null }],
  });
  return kept;
}

/** The Collaboration tab's Relay box's entries ({ entry, hint, command } its helpers): the relay set and its commands. */
export function relayEntries({ entry, hint, command }) {
  const r = savedRelay();
  if (!r.address) {
    return [hint('No Cloudflare relay: your followers find you at the public meeting point.'),
      command({ label: 'Set Up a Cloudflare Relay…', action: () => relaySetupDialog() }, 'add')];
  }
  return [entry('share', 'Cloudflare relay:', h('span', { class: 'collab-relay-at', 'data-no-i18n': '', title: r.address }, hostOf(r.address))),
    command({ label: 'Check Cloudflare Relay', action: () => checkSavedRelay() }, 'run'),
    command({ label: 'Change Cloudflare Relay…', action: () => relaySetupDialog() }, 'open'),
    command({ label: 'Forget Cloudflare Relay', action: () => forgetRelay() }, 'file')];
}
