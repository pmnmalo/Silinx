In short:

- **Viewers and editors:** the toolbar's Sharing menu shows each participant as a viewer or an editor (no more
  "follower"), and makes a viewer an editor or an editor a viewer; *Add a User…* gives the link of the role you choose.

In detail:

- **A participant's role changed by the owner (#3997):** *Make <name> an Editor* sends the room's signing key to that
  participant alone (a new sealed message, `KIND.role`, in a frame for one participant); *Make <name> a Viewer* renews
  the room's signing key: the document's and the room's public key the new one (the owner's `rekey`, core/collab-room.js),
  the other editors given it (and what of their changes the owner may lack sent again, signed with it), the demoted
  one a viewer again; the old key's edits are refused by the room and every participant, so the old editors' link only
  follows; Share Project… shows the new one. The participant's page says it in the console and opens its documents
  again, editable or read only. A follower is a *viewer* in the menu, the console and the MCP (`peers()`' role
  `viewer`). The MCP's `share_project` has `promote` and `demote` (`user`: the participant's name; a demotion answers
  the renewed editors' link), and `follow_project` follows a renewed editors' link as a participant of its own.
