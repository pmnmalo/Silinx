In short:

- **The project's lines in Portuguese:** the Console's lines of a project opened, New Source, the wizards' sources (the
  Clocking Wizard's, the Block Memory's, the Module, Schematic, FSM, ASM, Boolean Algebra, Petri Net, circuit and
  constraints wizards', Save as Test Bench), a drawing's HDL made, Remove from Project, Undo / Redo, Rename, Export
  Project and Import Project in the interface's language.

In detail:

- **The project's application lines translated (#5254):** the lines of `web/js/project.js` (a project opened),
  `new-source.js`, the wizards (`clock-wizard.js`, `bram-wizard.js`, `modwizard.js`, `chart-wizards.js`,
  `tt-wizard.js`, `petri-wizard.js`, `circuit-wizard.js`, `ucf-wizard.js`, `viewers.js`'s Save as Test Bench),
  `drawings.js` (a drawing's HDL made), `design.js` (Remove from Project), `app.js` (Undo / Redo, the command's name
  translated), `rename.js` (Rename, `core/rename-module.js`'s line), `menus.js` (Export Project) are application lines
  of the Console (`appLog`), drawn through `t()` and again when the language changes, their messages in English; the
  imports' lines (`project-zip-dialogs.js`) had their Portuguese too. Their patterns in `web/js/i18n-project.js`. The
  MCP server's messages stay in English.
