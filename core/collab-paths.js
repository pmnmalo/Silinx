// How a live share reaches each follower (#4643): the share's mode, the way its owner chose (Share Project… ▸ Live's,
// #4634: through the Cloudflare relay, peer to peer with no relay; a server edition's or the MCP's: a Silinx server's
// relay), and each participant's path, 'p2p' (a WebRTC data channel, directly between the browsers) or 'relay' (its
// messages through the relay). A room the owner's page hosts (core/collab-loop.js hostedRooms) met at a relay
// (core/collab-meet-relay.js) has a path per follower, which changes as the meeting says (`onVia`): through the relay
// at first, direct once the channel is open, through the relay again when it closes. One met at the public meeting
// point, is peer to peer; one on a relay's room (a server's, the Cloudflare relay's) is through the relay.
//   shareMode({ hosted, relay, cloudflare }) -> 'cloudflare' | 'p2p' | 'server' (MODE_WORDS: in words)
//   hostedPaths(rooms, ends, via) -> Map<client, 'p2p' | 'relay'>      withPaths(peers, paths) -> peers, each with path

/** The modes of a live share. */
export const MODES = Object.freeze(['cloudflare', 'p2p', 'server']);
/** A mode in words (the MCP's results: server/mcp-collab.js). */
export const MODE_WORDS = Object.freeze({ cloudflare: 'via your Cloudflare relay', p2p: 'peer to peer', server: 'via the Silinx server\'s relay' });
/** A participant's paths. */
export const PATHS = Object.freeze(['p2p', 'relay']);

/** A share's mode: hosted by the owner's page (its followers met at `relay`, an address, or peer to peer with none), or
 *  on a relay's room; `cloudflare`: that relay is the Cloudflare relay (else a Silinx server's). */
export function shareMode({ hosted = false, relay = null, cloudflare = false } = {}) {
  if (hosted && !relay) return 'p2p';
  return relay && cloudflare ? 'cloudflare' : 'server';
}

/** The paths of a hosted room's followers (`rooms`: hostedRooms().rooms, room -> { followers: Map<socket, client> }):
 *  peer to peer, but those whose socket is a meeting's end (`ends`: meetAsHost's, id -> socket) through the relay while
 *  the meeting's `via(id)` says so. */
export function hostedPaths(rooms, ends = null, via = null) {
  const out = new Map(), clientOf = new Map();
  for (const r of rooms?.values?.() ?? []) for (const [end, client] of r.followers) { out.set(client, 'p2p'); clientOf.set(end, client); }
  if (ends && via) for (const [id, end] of ends) { const c = clientOf.get(end); if (c !== undefined && via(id) !== 'direct') out.set(c, 'relay'); }
  return out;
}

/** The participants (core/collab-client.js peers()), each but the owner with its path: `paths`' (hostedPaths), else
 *  through the relay (a relay's room: every follower's messages pass through it). */
export const withPaths = (peers, paths = null) => peers.map(p => (p.role === 'owner' ? p : { ...p, path: paths?.get(p.client) ?? 'relay' }));
