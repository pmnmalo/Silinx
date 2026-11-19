In short:

- **Implement and Emulate ▸ Files:** only the files of their flow, the constraints file (and a memory image when the
  design reads one); the sources are the Design page's.

In detail:

- **Implement's and Emulate's Files page: the flow's files only (#4622):** the project's constraints, then the `.mem`,
  `.hex` and `.coe` memory images (`core/flow-files.js` `flowFiles`, as the ISE style's Implementation view lists them
  under the top); no longer the design's sources (#4609); `flowPageFiles` removed.
