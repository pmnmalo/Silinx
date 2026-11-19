In short:

- **Share Project… ▸ Live: two named ways, each explained.** *Live via your Cloudflare relay* (reliable on school
  networks, set up first in the Collaboration tab) or *Live peer to peer (no relay)* (no setup, may fail on networks
  that block direct connections), instead of an optional relay address and key.

In detail:

- **Share Project… ▸ Live's two ways (#4634):** in the browser edition, two radio choices under *Connection:*, each with
  its explanation (`web/js/share-via.js`). Through your Cloudflare relay: the relay set up in the Collaboration tab
  (#4574) shown by its address with *Change…* (its key never shown); with none, the window says so and where to set one
  up, offers *Set Up a Cloudflare Relay…*, and *Start Sharing* is disabled while it is chosen; set up while the window is
  open, shown at once. Peer to peer: the public meeting point or a code (#3227). By default the Cloudflare relay when
  one is set up, peer to peer otherwise; the way chosen last remembered. The relay's address and key fields are gone
  from the window, which keeps its size (#4617). The MCP's `share_project` takes the same choice, `via: cloudflare`
  (the same as `relay: true`) or `server`; peer to peer is a page's only. The user guide's *Cloudflare relay* page says
  so. Tests: `test/ui/collab-live-via.test.js`, `test/ui/collab-relay-site.test.js`, `test/ui/relay-setup.test.js`,
  `test/mcp-relay.test.js`.
