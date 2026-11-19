In short:

- **See how a live share reaches each follower:** while you share, the Collaboration tab's Sharing section says the
  share's mode at the top (Live via your Cloudflare relay, Live peer to peer, or Live via the Silinx server's relay) and
  tags each follower **P2P** (directly between your browsers) or **Relay** (through the relay), changing live.

In detail:

- **Each follower's path and the share's mode in the Collaboration tab (#4643):** the Sharing box, while sharing, shows
  the mode first, then each follower with a P2P or Relay tag and a tip explaining it (through the Cloudflare relay: no
  direct path, counting against its free plan). A follower met at the Cloudflare relay starts through it and turns P2P
  once its WebRTC channel opens, or goes back to Relay when that path is lost: the tab follows it, with no console line
  (many followers would flood the console). A long list of participants is folded: its first ten, then "N more…" and
  "Show fewer" (core/list-fold.js again). The relay's meeting tells the page when a follower's path changes
  (core/collab-meet-relay.js `onVia`; core/collab-paths.js), with no change to the protocol.
- **share_project and project_info report them (#4643):** share_project's start and status give the share's `mode`
  (cloudflare or server: the MCP server shares through a relay's room) and each follower's `path` (`p2p` or `relay`),
  its text saying it; project_info gives a shared project's `sharing`: its mode and its followers with their paths.
