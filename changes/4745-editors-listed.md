In short:

- Live sharing: the owner's page signs the list of who may edit, and the relay and every participant check each edit
  against it. Links are longer: they carry the owner's public key. **A Cloudflare relay of one's own must be deployed
  again** (Deploy to Cloudflare, or `wrangler deploy` in `packages/silinx-relay-cloudflare`); one deployed before refuses
  projects shared from an updated Silinx.

In detail:

- **The editors listed by the owner (#4745, first part):** a project shared with editors gets a key of the owner's
  own (ECDSA P-256), and the owner signs with it a numbered list of the editors' public keys (`core/collab-editors.js`).
  The list goes to the relay or host in a new control message, `{ type: 'editors', list }`, which it takes only past the
  last one and only with the owner's signature (`core/collab-room.js`). It also goes into the project's document
  (`meta.editorsList`), where every participant checks it against the owner's public key from the link. A link now
  carries that key (`&owner=…`, viewers' links too, `core/collab-link.js`). An editor's change names its key by an
  8-byte id, and passes only when that key is the last list's. Demoting an editor publishes a list without the old key
  (it was `rekey`). The protocol's version is 5. The relay still takes the pages of version 4: a room their owner
  opened works as before (one key for every editor), and a follower of version 4 joining a listed room is told to load
  the page again. The Cloudflare relay's copy of the room's logic is synced (`scripts/sync-relay-cloudflare.mjs`, now
  with `collab-editors.js`). The editors still share one key in this part; a key per editor, and removing one editor or
  renewing the editor link without touching the others, follow.
