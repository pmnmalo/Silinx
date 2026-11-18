In short:

- **A relay of one's own on Cloudflare:** live sharing can go through a relay on Cloudflare's free plan
  (`packages/silinx-relay-cloudflare/`, a "Deploy to Cloudflare" button): anyone deploys one with their own account,
  no Silinx server needed.

In detail:

- **The Cloudflare relay (#4541):** a Worker with one Durable Object per room runs the room's logic of Silinx's relay,
  `core/collab-room.js`, copied as it is (`scripts/sync-relay-cloudflare.mjs`; a test checks the copies): the same
  endpoints, roles, limits and checks. It uses the WebSocket Hibernation API (the room made again from its sockets'
  attachments: `collabRooms`' `keep` and `restore`); opening a room needs its key (`RELAY_KEY`), and a page's origin
  must be one of its `ORIGINS`. The wire's constants moved to `core/collab-wire.js` (a module that imports nothing),
  and a follower's join and the owner's resume name their room in the relay's address (`?room=`), which Silinx's relay
  ignores. Tests: the relay's scenarios through the Worker on a shim of the Workers runtime (`test/workers-shim.js`).
