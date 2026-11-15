In short:

- **Live sharing from the browser:** opening the link finds the owner for every follower, not only the first one. The
  second and later followers (often in Firefox or Safari) used to miss the owner and fall back to exchanging codes.

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
