In short:

- **A live share survives a reload:** reloading the page that shares a project live (Share Project…, through a relay or
  peer to peer) resumes the share by itself, with the same links; reloading a follower's page follows it again with no
  dialog, an editor still editing. While the owner's page reloads, its followers see "Reconnecting to <owner>…" and
  one line in the console; past 2 minutes they are told the share ended. Stop Sharing, Stop Following and closing the
  tab end it as before.

In detail:

- **A live share and a follow that survive their page reloaded (#4850):** at `pagehide` the owner's page keeps its
  share in the tab's sessionStorage (core/collab-resume.js: the document's state and client id, the room, the links'
  keys, the relay's resume secret or the hosted room's meeting key, the followers it has said), a follower's page its
  follow (the link, its name, the document's state and client id, an editor's own changes); a reload takes it back and
  resumes (web/js/collab-resume.js), nothing otherwise (a new tab, a tab restored, Stop Sharing, Stop Following).
  core/collab-client.js: shareRoom's and followRoom's `resumed` and `snapshot()`, their awareness's clock past the old
  one (who is in seen again at once), an editor's change that never left sent once, nothing twice; the hosted room
  opened again with its id (core/collab-loop.js), its followers back through the meeting point. The relay
  (core/collab-room.js, the Cloudflare relay's copy too) tells the followers the owner is away (`{ type: 'away',
  grace }`, a follower joining meanwhile too) and back; the follower's toolbar says "Reconnecting to <owner>…", its
  console one line, then that the owner is back. MCP: share_project's status gives `resumed` (its room resumed, times),
  follow_project `ownerAway` and `ownerResumed`, each said in its text.
