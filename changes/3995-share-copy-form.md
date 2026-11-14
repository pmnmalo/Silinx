In short:

- **Share Project…, a copy, reworked:** a wider window, *A copy* and *Live* side by side, its explanation first; no Board
  row nor Lab selector; the link hidden until *Show*, with *Copy* and *Show QR Code* beside it (no small QR code); a short
  link made by *Generate*, the window saying which GitHub account is signed in and which repository the project is in
  (private or public); one button, *Close*.

In detail:

- **Share Project…'s copy form (#3995):** the window 720 pixels wide; its explanation ("A link that opens …") at its top;
  the Share: row's two ways side by side, each one's explanation on the line below its button (web/js/share-how.js);
  the Board row and the Lab selector gone (a link that opens a lab is the MCP's `project_link lab`'s); the current
  view's check box labelled *View:*; a space between *Expires:* and the link. The link is a masked field
  (web/js/link-field.js, for the live links too): *Show* / *Hide*, *Copy* (said in the console, as Copy Link was), *Show
  QR Code* (the large one, disabled when the link is too long, its reason its tip); a short link is made by *Generate*,
  above *Show QR Code*, which stays disabled until then. A short link chosen, the window says the account signed in and
  the project's repository, its origin, private, public or not seen with this sign-in (core/gist-link.js gistAccount,
  `/api/gist/account`, the browser edition's sign-in); the MCP's `project_link short` says it too (`data.account`). The
  buttons Copy Link and Cancel give way to *Close*; the window resolves to the link last copied.
