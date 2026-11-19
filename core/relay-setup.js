// A relay of one's own on Cloudflare (#4574, packages/silinx-relay-cloudflare): its key made, and a relay checked
// before it is used, by the Collaboration tab's Set Up a Cloudflare Relay… (web/js/relay-setup.js) and the MCP's
// live_relay (server/mcp-relay.js), with the same messages. The check, in this order:
// - its address, an http(s) origin;
// - its root answers "A relay of Silinx's shared projects" (the Worker's ABOUT; it answers any page, CORS);
// - it lets the page's site in: its root's `Silinx-Origins` header lists its ORIGINS (a program has no origin: not
//   checked); if not, the exact wrangler.toml line that lets it in;
// - its key opens a meeting point (core/collab-meeting.js: a host's `hello` answered `welcome`; nothing kept: the
//   socket closed at once). The key travels in the WebSocket's subprotocols, as a share's: never in an address, and
//   no message names it.
import { b64url } from './collab-crypto.js';
import { SUBPROTOCOL } from './collab-wire.js';
import { MEET_PROTOCOL } from './collab-meeting.js';
import { meetUrl } from './collab-meet-relay.js';
import { relayAddress } from './collab-link.js';

/** What a relay's root answers (packages/silinx-relay-cloudflare/src/worker.js ABOUT, its beginning). */
export const RELAY_ABOUT = 'A relay of Silinx\'s shared projects';
/** The Deploy to Cloudflare button's address (the package's README's). */
export const DEPLOY_URL = 'https://deploy.workers.cloudflare.com/?url=https://github.com/pmnmalo/Silinx/tree/main/packages/silinx-relay-cloudflare';
/** A relay's key's shortest length (the Worker's KEY_MIN, a Silinx server's relay.key's). */
export const KEY_MIN = 24;
const ANSWER_MS = 10_000;

/** A new key: 32 random bytes (WebCrypto), base64url, 43 characters. */
export const newRelayKey = (c = globalThis.crypto) => b64url(c.getRandomValues(new Uint8Array(32)));

/** Why a key cannot be a relay's (null: it can). */
export function keyProblem(key) {
  const k = String(key ?? '');
  if (!k) return 'no key: give the relay\'s key (its RELAY_KEY)';
  if (k.length < KEY_MIN) return `the key is too short: a relay's key has ${KEY_MIN} characters at least`;
  if (!/^[\x21-\x7e]+$/.test(k)) return 'the key has spaces or characters other than ASCII letters, digits and signs';
  return null;
}

/** The wrangler.toml line that lets `origin` in, besides the relay's `origins`. */
export const originsLine = (origins, origin) => `ORIGINS = "${[...new Set([...origins, origin])].join(' ')}"`;

const hostOf = a => new URL(a).host;

/** A relay checked (see above): { ok, address (its origin), lines (what to say: an ok's), error (why not: the first
 *  problem; with `line`, the wrangler.toml line to set) }. origin: the page's (null: a program's). */
export async function checkRelay({ address, key, origin = null, fetch: get = globalThis.fetch, WebSocket: WS = globalThis.WebSocket, timeout = ANSWER_MS }) {
  const at = relayAddress(String(address ?? '').trim());
  if (!at) return { ok: false, address: null, error: `the relay's address is not an http(s) address: '${String(address ?? '').slice(0, 100)}'` };
  const kp = keyProblem(key);
  if (kp) return { ok: false, address: at, error: kp };
  let res, text;
  try {
    res = await get(`${at}/`, { cache: 'no-store', credentials: 'omit' });
    text = await res.text();
  } catch (e) { return { ok: false, address: at, error: `the relay at ${hostOf(at)} does not answer (${e.message || e}): is the address right, is it deployed? (a relay deployed before November 2026 answers no page: deploy it again)` }; }
  if (!res.ok || !String(text).startsWith(RELAY_ABOUT)) return { ok: false, address: at, error: `${hostOf(at)} is not a relay of Silinx's shared projects (its address answers ${res.status}${text ? `: "${String(text).trim().slice(0, 60)}"` : ''})` };
  const listed = res.headers.get('Silinx-Origins');
  if (origin && listed !== null) {
    const origins = listed.split(/\s+/).filter(Boolean);
    if (!origins.includes(origin)) {
      const line = originsLine(origins, origin);
      return { ok: false, address: at, line, error: `the relay at ${hostOf(at)} does not let this site in (${origin}): add it to its ORIGINS (in Cloudflare: the Worker's Settings ▸ Variables and Secrets, or wrangler.toml, then deploy it again): ${line}` };
    }
  }
  const keyError = await meetWith(at, key, WS, timeout);
  if (keyError) return { ok: false, address: at, error: `the relay at ${hostOf(at)} refused its key: ${keyError}` };
  return { ok: true, address: at, lines: [`The relay at ${hostOf(at)} answers${origin ? ', lets this site in' : ''} and takes its key.`] };
}

// its key tried at a meeting point of a topic of its own (a host's hello, welcome or an error), the socket closed
// at once: null (taken) or why not
function meetWith(at, key, WS, timeout) {
  return new Promise(resolve => {
    let ws, done = false;
    const end = why => { if (done) return; done = true; clearTimeout(t); try { ws?.close(); } catch { /* closed */ } resolve(why); };
    const t = setTimeout(() => end('it does not answer'), timeout);
    try { ws = new WS(meetUrl(at, 'host', b64url(crypto.getRandomValues(new Uint8Array(24)))), [SUBPROTOCOL, `token.${key}`]); } catch (e) { end(e.message); return; }
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', v: MEET_PROTOCOL })));
    ws.addEventListener('message', ev => {
      let msg = null;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg?.type === 'welcome') end(null);
      else if (msg?.type === 'error') end(String(msg.message || 'refused'));
    });
    ws.addEventListener('close', () => end('it closed the connection (does it let this site in?)'));
    ws.addEventListener('error', () => {});
  });
}
