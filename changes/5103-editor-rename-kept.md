In short:

- **Rename… by an editor of a shared project:** the file renamed stays renamed in the owner's project (its old name
  was put back in the project's list of files).

In detail:

- **An editor's unchanged description no longer proposed (#5103):** since #5064 an editor's description went to the
  owner under a key of its own on every save, even when it was the document's already. Rename… at an editor's saves the
  description it read, whose file list still has the old name (the owner renames the entry on its side), so the owner
  applied it after its own rename and put the old name back in silinx.json. `setDescription` now proposes nothing when
  the description is the document's already. Tests: collab-files (the owner's rename kept, nothing sent; a changed
  description still proposed); collab-sources, the UI test that found it, passes again in both interfaces.
