In detail:

- **Live sharing's relay against floods and replays (#4736):** an editor's edits are limited (50 a second after a burst
  of 200, 64 waiting for their signature's check, 8 bad signatures; past any of them the connection is closed); a
  follower's frames in a room without editors are dropped at once, the follower told once; each editor's session seals
  its edits with IVs of its own (random, then a counter) and the relay or host forwards each once, so a frame replayed
  by whoever saw it goes no further (older pages' frames still pass); the server's relay takes at most 256 connections
  waiting for their first message; the Cloudflare relay opens a meeting point's object only for its host and peers.
  The Cloudflare relay's copies of `core/` follow (`scripts/sync-relay-cloudflare.mjs`). SECURITY.md says so.
