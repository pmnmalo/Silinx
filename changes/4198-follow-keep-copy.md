In short:

- **Live sharing: a follower's work is never lost silently:** once following ends (Stop Following, the owner stops
  sharing, the connection is lost for good), the project left open is read only, and the console's Keep a Copy saves
  it as a project of your own (untrusted, as any project from someone else); closing it or the tab with changes not
  kept asks first.

In detail:

- **A followed project once following ends (#4198):** an editor's page stayed editable and its changes went into a
  room nobody read, lost when the page closed. Its documents are now opened again read only (the notice in their
  toolbar); the console's line (and the presence's menu) offers Keep a Copy, which saves the project as the room has
  it (its text files, its drawings as merged, `core/collab-keep.js`) into the page's own workspace under a free name,
  through the zip import (untrusted), and opens it (`web/js/collab-leave.js`). A page that changed the project and
  kept no copy warns before its tab closes and asks before the project closes (Keep a Copy, Close Without Keeping).
  The MCP's `follow_project` says that following ended and keeps the same copy with `keep` (with `stop`, or once it
  ended).
