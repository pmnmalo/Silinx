In short:

- **Live sharing between two browsers of one computer:** in the browser edition, a follower who opens the link in
  another browser of the owner's computer (Safari, or another Chrome profile, while the owner shares from Chrome) now
  finds the owner. They used to wait at the meeting point, then exchange codes that did not connect either. Firefox
  still doesn't connect this way (#4497): share through a relay for it.

In detail:

- **WebRTC between two browsers of one computer (#4494):** each browser hides its host address behind an mDNS name
  (`<uuid>.local`) that another browser does not resolve, the public address from STUN needs the router to loop it back,
  and on macOS a browser without the Local Network permission cannot reach the computer's own address. A remote host
  candidate at an mDNS name now gets a twin at 127.0.0.1 on the same port, beside it and never instead of it
  (core/collab-loopback.js). This applies at the meeting point and to the codes' connections, and peers on two computers
  connect as before. A twin makes the browser send STUN checks to a port of its own computer that the peer named, so it
  is kept narrow: UDP only, mDNS names only, ports of 1024 or more, eight at most. The reasoning is in SECURITY.md.
  Firefox takes no loopback candidate, so its pairs are still unconnected (#4497).
