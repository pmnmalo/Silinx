In short:

- Duplicate… copies a source or a file: a module's or a drawing's menu in the Design pane, a selection of several
  sources, a file's menu in the Files view and the Project menu; the copy is named name_copy (or as typed), its module
  renamed inside, added to the project, and Undo takes it away (#5862).

In detail:

- Duplicate (`core/duplicate-source.js`): a copy under a new, unique name (`name_copy`, `name_copy2`…, or the one given),
  in the project with the original's role and never its top. An HDL file's modules are renamed in the copy (their
  instances in it too), so that the project never has two modules of the same name; a drawing (schematic, ASM chart,
  state diagram, truth table, Petri net, circuit) is copied as a drawing, from its row or its HDL file's, its module
  named after the copy and its HDL made again for it; its symbol file, its own language and its stimuli go with it. A
  test bench's copy still tests its unit; a constraints or data file is copied as it is. Refused, with the reason in the
  console: a name taken, a name that is not one or a reserved word, a path taken, build/'s files, a file that is not
  text, a file declaring a VHDL package. A command of the project history (Edit ▸ Undo Duplicate), in a project shared
  live too (#5862).
- The MCP server: `rename_file`'s `copy`, Duplicate instead of a move (`to` optional: name_copy) (#5862).
