In short:

- **Live sharing between two browsers of one computer:** in the browser edition, a follower who opens the link in
  another browser of the owner's computer (Firefox or Safari while the owner shares from Chrome) now finds the owner. They
  used to wait at the meeting point, then exchange codes that did not connect either.

In detail:

- **WebRTC between two browsers of one computer (#4494):** each browser hides its host address behind an mDNS name
  (`<uuid>.local`) that another browser does not resolve, the public address from STUN needs the router to loop it back,
  and on macOS a browser without the Local Network permission cannot reach the computer's own address. Every remote host
  candidate (UDP, an IPv4 address or a name) now gets a twin at 127.0.0.1 on the same port, beside it and never instead
  of it, eight at most (core/collab-loopback.js). This applies at the meeting point and to the codes' connections. Peers
  on two computers connect as before. A peer could already name 127.0.0.1 itself, so the link's key, the owner's proof
  and the import gate are unchanged.
