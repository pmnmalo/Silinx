In short:

- In a project shared live, an editor's Project ▸ Versions… lists the owner's versions, and its Save Version… and
  Restore (a file, or the whole project) are done by the owner, with the editor's name as the version's author: everyone
  sees the restore and its line in the console.

In detail:

- **Versions during live collaboration (#5742, phase 4 of #5743):** the owner keeps the versions, the one store;
  `core/collab-versions.js` shares them through the project's document, a root of its own (`versions`, among
  `DOC_ROOTS` and an editor's `EDIT_ROOTS`): the owner's list (published at once, after each change of the disk, every
  30 s), an editor's request (a save, a restore: a signed edit, so a viewer cannot make one, whatever its awareness says
  of its role), and the owner's answer (its result for the editor who asked, its line for everyone's console). A
  follower takes the list and the answer only when the owner's client wrote them (Yjs keeps who wrote a value): one an
  editor forged is ignored, and the owner writes its list again. The owner's page (`web/js/collab-versions.js`) and
  the MCP's `share_project` (`server/mcp-collab-versions.js`) do the requests with their own versions' functions; the
  restore's writes reach everyone as the owner's change. An editor's Versions… shows what each version changed (its
  files are opened and compared at the owner's), Restore Project and Restore for an editor only; the MCP's
  `follow_project` takes `version` (list, save, restore). An editor's own project commands are still not recorded for
  Undo on its page: #5760. Tests: collab-versions, collab-roots, mcp-collab-versions, the UI's collab-versions (both
  interfaces, Portuguese).
