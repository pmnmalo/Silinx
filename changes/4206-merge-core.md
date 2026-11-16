In short:

- **Merging contributions (MCP):** `merge_preview`, `merge_contribution` and `undo_merge` merge another person's copy
  of a project into it: what one side changed is taken, a drawing both changed is merged by its objects, and each
  conflict is chosen. The interface's Merge Contribution… follows.

In detail:

- **The merge of a contribution into a project (#4206, phase 2 of #4204):** a contribution (a Silinx project's zip or
  folder, through the import gate) is compared with the project file by file through their common ancestor (the one
  the copy carries, else the project's snapshot of its origin, #4205), or two-way with none, said. A file one side
  changed, added or removed is taken (or kept). A drawing both changed is merged by its objects (#3197, #4202), and
  its HDL is made again. A text file both changed is a choice of Mine or Theirs, and so is each of a drawing's objects
  both changed. `silinx.json` is merged by its fields (the files' list by path), never taking the contribution's id,
  origin or trust.
- **Undo Merge and trust (#4206):** a merge that takes any of the contribution's files makes the project untrusted
  (`madeBy: "merge"`). Undo Merge puts the project back as it was, unless it changed since (`core/project-merge.js`,
  `core/merge-apply.js`, `server/merge-projects.js`, the MCP's `server/mcp-merge.js`).
