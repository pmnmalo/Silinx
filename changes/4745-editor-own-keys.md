In short:

- Live sharing: each editor signs their changes with a key of their own. Making one editor a viewer no longer affects
  the others, and that person's copy of the editor link no longer lets anyone edit. **A Cloudflare relay of one's own
  must be deployed again.**

In detail:

- **A key per editor (#4745, second part):** a follower's page makes a key of its own (ECDSA P-256) and never sends its
  private half. An editor's link now carries an invitation key. With it, the page signs a request to be listed: a new
  frame, `KIND.enrol`, which the room gives to the owner only, at an editor's rate and 1 KB at most
  (`core/collab-room.js`). The owner lists the key at once, and the page sends its changes once listed (those made
  before are kept and sent then). A request not signed with the room's invitation key is answered with "this editor
  link is not this shared project's, or its owner renewed it: you follow it read only".
- **Promote and demote:** promoting a viewer lists the key that viewer's page gives in its awareness, and no key is
  sent to it. Demoting an editor takes its key out of the list and renews the invitation key; the other editors keep
  their keys and are told nothing.
- **Limits and reloads:** a room lists 32 editors at most (`MAX_EDITORS`); the 33rd is told it follows read only. A
  page reloaded keeps its key (its record's `own`), as does a promoted viewer's editing.
- **The list on Cloudflare:** the Cloudflare relay keeps the list in the Durable Object's storage, not in the owner's
  socket's attachment (2 KB at most). The room's logic gives it to the platform (`collabRooms`'s `keepList`) and takes
  it back when the object wakes, its events waiting for it (`blockConcurrencyWhile`). The list is removed when the room
  ends. The test runtime of the Workers keeps an object's storage while it sleeps.
- **The Cloudflare relay:** its copy of the room's logic is synced, so a relay deployed before must be deployed again.
