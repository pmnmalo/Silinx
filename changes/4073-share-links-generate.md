In short:

- **Every sharing link made by Generate:** Share Project…'s full link and its live viewers' and editors' links are made
  by a *Generate* button, as the short link is; each link's buttons are *Generate, Copy, Show, Show QR Code*, its box
  as tall as them; *Full link:* and *Short link:*; live, the name is shown once you share; a viewer's link says
  `#view=`; *Add a User…* is the toolbar's Sharing menu's, and its *Copy Link* is *Copy View Link*.

In detail:

- **The sharing windows' links (#4073):** web/js/link-field.js makes a link only when its *Generate* is clicked
  (the full link, the short link: the same gist for the same expiry; the live viewers' and editors' links, each by its
  own, kept for the share's later windows; Add a User…'s); a choice changed clears it. The buttons in the order
  Generate, Copy, Show, Show QR Code; the masked box stretched to their height. The live window shows the sharer's name
  once shared (not a field) and has no Add a User… button (the Sharing menu's, whose Copy Link is Copy View Link). A
  viewer's link is `…#view=<room>.<key>` (core/collab-link.js; `#follow=`, the links made before, still opens), for
  the MCP's `share_project` and `follow_project` too.
