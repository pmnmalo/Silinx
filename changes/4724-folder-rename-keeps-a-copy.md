In short:

- **Rename Project in a workspace folder never loses the project:** when a step fails (a file held open by another
  program, a full disk), the complete copy is kept and the console says what is left to clean up.

In detail:

- **A workspace folder's Rename Project keeps a complete copy whichever step fails (#4724):** the old folder's
  silinx.json is removed first, so that the old project stays whole until it is gone; when the rest of the old folder
  is not removed, the new, complete copy is kept and the error names what is left (it used to remove the new copy,
  leaving a half-deleted old one). A change of case alone removes its hidden copy only once the project is whole
  again under one of its names, and keeps and names it otherwise. Renaming a folder of a project removes a partial
  copy when the copy fails, and keeps the complete copy when the old folder is not removed.
