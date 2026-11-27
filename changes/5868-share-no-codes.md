In short:

- **Live sharing, peer to peer: opening the link is enough.** No more codes to exchange by hand with the owner, and
  no *Add a User…* in the Sharing menu (*Show Sharing Link…* gives each role's link): the follower's page finds the
  owner's at the meeting point, or says in the console that it did not.

In detail:

- **No codes exchanged by hand, no Add a User… (#5868):** a room the owner's page hosts is joined only through its
  meeting point (the public one, or the relay's): *Connect to the Owner* has no *Exchange Codes Instead*, and the
  owner not found in 15 s is an error in the console; *Add a User…* and its *Take a Code…* are gone, with
  `core/collab-codes.js` and the codes' WebRTC of `web/js/collab-rtc.js` (its STUN servers stay, the meeting
  point's). A hosted link of before the owner's key (`…host` with nothing after it) is refused, with an error. The
  codes guarded nothing the link's key does not (they were sealed with it): the viewers' and editors' links, the
  owner's proof at the meeting point and the owner's checks of edits are as they were (SECURITY.md says so).
