// The MCP server's Cloudflare relay (#4574), as the Collaboration tab's Relay box (web/js/relay-setup.js): live_relay
// reads it, makes a key, sets it once checked (core/relay-setup.js, the page's check: it answers, its key opens a
// meeting point; a program has no origin, so ORIGINS is not checked), checks it again, forgets it. Kept in config.json
// (`liveRelay`: { address, key }, the configuration folder 0700, the file 0600); share_project shares through it
// (relay: true) and follow_project follows its links. Only a Cloudflare Worker's address (https://….workers.dev): never
// any host an assistant names (#3363). Deploying it stays the user's (the Deploy to Cloudflare button). The key is
// never in a result but new_key's (which the user gives to Cloudflare).
import { loadConfig, saveConfig } from './toolchain.js';
import { toolError, STR } from './mcp-util.js';
import { checkRelay, newRelayKey, keyProblem, DEPLOY_URL } from '../core/relay-setup.js';
import { relayAddress, workersRelay } from '../core/collab-link.js';

const ACTIONS = ['status', 'new_key', 'set', 'check', 'forget'];
const WebSocketImpl = async () => globalThis.WebSocket || (await import('ws')).WebSocket;

/** The relay set (config.json's liveRelay): { address, key }, or null. */
export async function liveRelay(cfg = null) {
  const r = (cfg || await loadConfig()).liveRelay;
  const address = relayAddress(r?.address);
  return address && workersRelay(address) && !keyProblem(r?.key) ? { address, key: String(r.key) } : null;
}

const checked = async (r, deps) => checkRelay({ address: r.address, key: r.key, origin: null, WebSocket: await WebSocketImpl(), ...deps });

/** live_relay's tool; deps (tests): checkRelay's fetch, WebSocket. */
export function relayTool(deps = {}) {
  return {
    name: 'live_relay', title: 'Cloudflare relay of live sharing',
    description: 'The Cloudflare relay of one\'s own for live sharing, as the Collaboration tab\'s Cloudflare Relay box: status (never its key), new_key (a random RELAY_KEY for the user to deploy with; deploying is the user\'s), set (address and key, checked first: a Silinx relay its key opens; kept in config.json), check, forget. share_project uses it with relay: true.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ACTIONS, description: 'status (default), new_key, set, check or forget.' },
      address: STR('set: the relay\'s address, a Cloudflare Worker\'s (https://silinx-relay.<account>.workers.dev).'),
      key: STR('set: the relay\'s key (its RELAY_KEY secret, 24 characters at least).'),
    }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ action = 'status', address, key }) {
      if (!ACTIONS.includes(action)) throw toolError(`action: ${ACTIONS.join(', ')}`);
      if ((address !== undefined || key !== undefined) && action !== 'set') throw toolError('address, key: with action set only');
      if (action === 'new_key') {
        const k = newRelayKey();
        return { text: `A new relay key (give it to Cloudflare when it asks for RELAY_KEY, then live_relay set with the relay's address and this key; keep it somewhere safe):\n${k}\nDeploy to Cloudflare: ${DEPLOY_URL}`, data: { key: k, deploy: DEPLOY_URL } };
      }
      const cur = await liveRelay();
      if (action === 'status') {
        return cur
          ? { text: `The Cloudflare relay set: ${cur.address} (its key set). share_project relay: true shares through it.`, data: { relay: cur.address, keySet: true, deploy: DEPLOY_URL } }
          : { text: `No Cloudflare relay set. To make one: live_relay new_key, the user deploys it (${DEPLOY_URL}), then live_relay set with its address and key.`, data: { relay: null, keySet: false, deploy: DEPLOY_URL } };
      }
      if (action === 'forget') {
        if (!cur) return { text: 'No Cloudflare relay was set.', data: { relay: null } };
        await saveConfig({ liveRelay: null });
        return { text: `The Cloudflare relay ${cur.address} forgotten: share_project shares through the Silinx server again.`, data: { relay: null } };
      }
      if (action === 'check') {
        if (!cur) throw toolError('no Cloudflare relay is set (live_relay set)');
        const r = await checked(cur, deps);
        if (!r.ok) throw toolError(`ERROR: ${r.error}`);
        return { text: r.lines[0], data: { relay: r.address, ok: true } };
      }
      const at = relayAddress(String(address ?? '').trim());
      if (!at || !workersRelay(at)) throw toolError(`address: '${String(address ?? '').slice(0, 100)}' is not a Cloudflare Worker's address (https://<name>.<account>.workers.dev)`);
      const kp = keyProblem(key);
      if (kp) throw toolError(`key: ${kp}`);
      const r = await checked({ address: at, key }, deps);
      if (!r.ok) throw toolError(`ERROR: ${r.error}: not set`);
      await saveConfig({ liveRelay: { address: at, key: String(key) } });
      return { text: `${r.lines[0]} Set: share_project relay: true shares through it.`, data: { relay: at, ok: true } };
    },
  };
}

export const RELAY_TOOLS = [relayTool()];
