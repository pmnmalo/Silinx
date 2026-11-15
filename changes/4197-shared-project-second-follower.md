In short:

- **Live sharing from the browser:** opening the link finds the owner for every follower, not only the first one. The
  second and later followers (often in Firefox or Safari) used to miss the owner and fall back to exchanging codes.
  The dead tracker `tracker.btorrent.xyz` is no longer contacted.

In detail:

- **A follower at the meeting point answers no offer (#4197):** a project the owner's page hosts is found through
  public WebTorrent trackers (`core/collab-meet.js`, Trystero's torrent strategy), which connect every page that has the
  link to every other one. A tracker gives a new follower's offer to one random peer of the room. A follower already in
  the room answered it as the owner did, and when its answer came first, the owner's answer was lost. Trystero then
  ignored that follower's new offers at the owner's page for 23 s, and after the first two seconds a follower announces
  only every two minutes (the trackers' interval). So the 15 s search ended with the codes. This was reproduced on one
  computer, the owner in Chrome and the followers in Chrome and Firefox: a second follower failed 4 times out of 5 in
  Firefox and 1 out of 4 in Chrome. A follower's connections now come from `offersOnly`, an RTCPeerConnection class
  that refuses an offer (Trystero's `rtcPolyfill`, given by `meetOwner`'s join with `answers: false`). So only the
  owner answers, and a follower's offer that reaches another follower stays outstanding for the next tracker. With
  the fix, four followers in turn (Chrome, Firefox, Chrome, Firefox) each found the owner in under a second. Tests:
  collab-meet (offersOnly: an offer refused, an answer and a rollback taken; the follower's join with it, the owner's
  without it); UI collab-meet (on the browser's own RTCPeerConnection, both interfaces).
- **The dead tracker dropped (#4197):** `tracker.btorrent.xyz`, from Trystero's own list, resolves to 127.0.0.1, so every
  page at the meeting point failed to connect to it and logged an error each time it tried again. `TRACKERS`
  (`core/collab-meet.js`) now lists the four other trackers, and so do the pages' CSP (`server/csp.js`) and the follow
  dialog's line naming the public servers. Tests: collab-meet (the list; Trystero's list without it), static-editions
  (the CSP's sources), UI collab-follow-gate (the dialog's line).
- **What still uses peer-to-peer links:** nothing needed two followers to connect to each other. Only the owner's page
  (`meetAsHost`) and a follower's (`meetOwner`, also used when it reconnects) join the meeting point, and a follower
  already ignored every peer but the one that proves it is the owner. Editors' edits go through the owner's room (a
  star around the owner's page, core/collab-loop.js), and the codes exchanged by hand use a connection of their own
  (web/js/collab-rtc.js), not the meeting point.
