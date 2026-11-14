In short:

- **Share Project…, live, reworked:** your name on the window (the cursor in it), *Start Sharing*, then the viewers' and
  the editors' links in the same window, each hidden with *Show*, *Copy* and *Show QR Code* (the editors' link has a QR
  code too); the buttons *Start Sharing*, *Stop Sharing*, *Add a User…* (Viewer or Editor, that role's link) and *Close*.

In detail:

- **Share Project…'s live form (#3996):** one window (web/js/collab-share.js): the name field focused (it was the
  Share: row's radio button), an empty name said beside it; *Start Sharing* keeps the window open and shows the two
  links there, each a masked field (web/js/link-field.js) with *Show*, *Copy* and *Show QR Code*, no small QR code;
  *Stop Sharing* keeps it too, to share again; *Close*. The form's Copy Link and Copy Editor Link buttons are gone (the
  toolbar's Sharing menu keeps them). **Add a User…** (web/js/collab-users.js) replaces Add a Follower…: Viewer or
  Editor chosen, that role's link given, hidden the same way; a share the page hosts (#3227) takes the user's code by
  *Take a Code…*. The viewers' and editors' links are different: the editors' carries the room's signing key, which the
  viewers' has not (a test of the MCP's share asserts it). The MCP's `share_project` with `qr` gives the editors'
  link's QR code too (`editQr`).
