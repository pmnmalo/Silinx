In short:

- **No HDL in a design and simulation project's wizards and dialogs.** The drawings' wizards ask no language and say
  nothing of HDL; Rename, Source Properties and Remove from Project name a drawn module's drawing, never its HDL file;
  the Command Palette lists the drawings; the device is no longer shown (Open Project, the status bar, the console).

In detail:

- **A design and simulation project without HDL, part 2 (#3891):** in a design project, the Schematic, FSM, ASM and
  Petri Net wizards' first page is "Name", with no Language field, their hints and the port table's without HDL
  (no "its HDL is generated from it", no std_logic / wire), their summaries and the Boolean Wizard's without the
  module's language (web/js/design-only.js `langNote`); New Project's note leaves out the HDL module; Design Properties
  says Top Module and has no Top-Level Source Type of HDL; Rename… of a drawn module asks its name alone (its file
  follows it, the console never names the HDL file, nor counts it); Source Properties… shows its drawing; Remove from
  Project names the drawing alone; the Design pane's badges' tips leave out the HDL; the Command Palette lists a drawn
  module's drawing, never its HDL file; "Project opened", the status bar and Open Project's list show no device (the
  project's kind instead). The MCP server matches: `new_source` refuses a language there, `remove_from_project` and
  `rename_module` name the drawing alone, `list_projects` gives the kind and no device.
