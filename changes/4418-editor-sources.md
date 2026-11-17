In short:

- **Live sharing, editors change the sources too:** whoever has the editors' link of a shared project adds sources
  (New Source…, Add Source…), removes them from the project, renames and deletes them, and changes the project's
  settings (its top module, its properties), as its owner does; the owner's page writes each change, and every other
  participant sees it. A viewer still only follows.

In detail:

- **An editor's files and project description (#4418):** an editor's page creates, deletes and renames files in the
  shared document and saves the project's description into it (`core/collab-files.js`; the description is now a part
  of the document an editor changes, `EDIT_ROOTS`). The owner's page and `share_project` write each change to the disk
  through the same function (`applyEdits`): a new or changed file through the import gate, the project untrusted
  before the first write (#3355); a deleted file into the workspace's .trash; a rename whose new file the gate refuses
  keeps the old one; a new file over a file of the project folder that is not shared (too large) undone; the
  description taken as Merge Contribution takes one, its id, name, origin, trust and version the owner's, its paths
  only the project's files'. `follow_project` with an editor's link: `source` (add, remove, delete, rename) and
  `settings` (silinx.json's fields), as the interface's commands.
