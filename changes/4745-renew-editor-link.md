In short:

- Live sharing: a new command in the Sharing menu, Renew Editor Link, for an editor link that reached people it should
  not. Copies of the old link no longer let anyone edit, nor do editors who are not in the project now; the editors in
  it keep editing.

In detail:

- **Renew Editor Link (#4745, third part):** the Sharing menu's new command, in a share whose owner lists its editors,
  renews the editor link's invitation key and takes out of the list the editors whose pages are not in the project now
  (`core/collab-client.js` `renew()`, `web/js/collab-share.js`). The editors in it keep their keys. The console says it
  was renewed, and Show Sharing Link… shows the new link. A page opening the old link is told it follows read only.
  The MCP server's `share_project` does the same with action `renew`, which gives the new link (#2674). The command is
  in Portuguese too, and the user's guide says when to use it and that a Cloudflare relay of one's own must be updated
  when the relay changes.
