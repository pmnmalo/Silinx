In detail:

- **Live sharing on Trystero 0.27 (#5651):** @trystero-p2p/torrent is 0.27 again (`^0.27.0`, #5137, the third-party
  notices regenerated), its new API adopted by the public meeting point (`core/collab-meet.js` `trysteroMeeting`): the
  room's own id is its peer id (`room.getSelf()`, 0.27 dropped `selfId`), each join's identity `'none'` (a key made for
  the join and stored nowhere, not one user for every page of the browser in IndexedDB), the action's and the room's
  handlers subscribed (`onMessage`, `onReceive`, `onPeerJoin`, `onPeerLeave`), a peer's connection read from its
  `PeerInfo` for the fingerprints. The trackers, the password, the size limit and the WebRTC settings are as they were.
  Tests: collab-meet (the adapter on a 0.27-shaped room; 0.27's own joinRoom with no tracker), the UI's collab-meet
  (the join on the page's Trystero, in both interfaces).
