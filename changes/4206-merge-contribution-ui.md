In short:

- **Merge Contribution… (Project menu):** a copy of the project someone else changed (its folder or its .zip) is
  merged back into it. What only one side changed is taken, a drawing both changed is merged by its objects, and for
  what both changed you choose Mine or Theirs, with Compare. Undo Merge puts the project back.

In detail:

- **Project ▸ Merge Contribution… and Undo Merge (#4206):** the window lists the files that differ, what the merge does
  with each, and each conflict's Mine / Theirs (a drawing's per object, `silinx.json`'s per field). Merge is refused
  until every conflict is chosen. A file's Compare closes the window and opens the comparison, and the console's line
  opens the window again with the choices kept. Every message goes to the console: the warnings, the merge's line with
  Undo Merge's button, and the project's untrusted line with Trust Project's. In the server editions the merge runs
  through `server/merge-routes.js`; in the browser edition, through its back end (`web/js/merge-local.js`, the backup
  in the browser's storage). In Portuguese, Juntar Contribuição… and Desfazer Junção.
