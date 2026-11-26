In short:

- Live sharing between Firefox and another browser of one computer: when the codes find no path, the console says how
  (both browsers' Local Network access on macOS, or a relay).

In detail:

- **Firefox and another browser of one computer (#4497):** measured again on today's main (Trystero 0.27, the page
  cross-origin isolated): Firefox connects to Chrome, WebKit and Firefox on one computer, through the codes and through the
  trackers, wherever the two browsers resolve each other's mDNS (`.local`) names, which on macOS needs their Local
  Network access; neither Trystero 0.27 nor cross-origin isolation changes it (with and without both). Without mDNS
  Firefox still takes no 127.0.0.1 twin (#4494: its ICE sockets are bound to the interface's address), which a page
  cannot change. So a connection of the codes that finds no path, Firefox one of the two (its description's origin
  line, `firefoxSdp` in core/collab-loopback.js), says so after the error: `Firefox and another browser of one computer
  reach each other only by their .local names: on macOS, allow both browsers in System Settings ▸ Privacy & Security ▸
  Local Network, or share through a relay (Share Project…'s Relay)`. The remote description is read as its code gave
  it (Chrome's `remoteDescription` writes an origin line of its own). Tests: collab-loopback; the UI test
  collab-engines now runs Firefox as the tests' browser and as the follower (skipped, saying why, where the two
  browsers resolve no mDNS name of each other) and the new message, in Chrome, Firefox and WebKit, both interfaces.
