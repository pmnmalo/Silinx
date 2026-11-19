In detail:

- **A relay as the meeting point of a room the owner's page hosts, peer to peer when a direct path works (#4542):**
  Silinx's relay and the Cloudflare relay get meeting points (`core/collab-meeting.js`, `/api/collab/meet/host` with
  the relay's token or key, `/api/collab/meet/peer`), and `core/collab-meet-relay.js` is a meeting point of
  `core/collab-meet.js` next to the public trackers' and the codes, which stay. The relay carries the WebRTC
  signalling, and the messages of a follower whose direct path does not connect or is lost; each message is sealed
  with the link's key (the relay sees no address and no content), and their order is kept at the switch to the direct
  path. The room's checks are the owner's page's, as for every hosted room (read only, a follower's awareness for
  itself only, its rate, an editor's signature); the owner's proof is unchanged. For a scripted session of three
  (20 edits, 60 moves), the relay carried 240 frames through its room, and none peer to peer (30 to meet and connect).
