In short:

- **Share Project…: three ways in one row.** *A copy*, *Live via your Cloudflare relay* and *Live peer to peer (no
  relay)* side by side, the live way chosen explained right below; no second row of choices.

In detail:

- **Share Project…'s Share: row, three ways (#4640, after #4634):** in the browser edition the row offers A copy, Live
  via your Cloudflare relay and Live peer to peer (no relay), each with its short note (`web/js/share-how.js`); the
  Connection: row is gone. Live's window explains the way chosen right below the row, then the name and the links
  (`web/js/share-via.js`: with the relay set up, its address and *Change…*; with none, where to set one up, *Set Up a
  Cloudflare Relay…*, *Start Sharing* disabled). Choosing the other live way keeps the window (the name typed kept);
  while shared it is locked; a live way chosen from A copy's window opens Live's with that way. The server edition
  keeps A copy | Live. The window keeps its size (#4617). The user guide's *Cloudflare relay* page says so. Tests:
  `test/ui/collab-live-via.test.js`, `test/ui/collab-relay-site.test.js`, `test/ui/relay-setup.test.js`,
  `test/ui/standalone.test.js`.
