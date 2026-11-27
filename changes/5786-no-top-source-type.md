In short:

- New Project and Design Properties no longer have a Top-Level Source Type: a new project is empty, of its mode, and its
  top is added as any module, with New Source and Set as Top Module. Projects saved before open as they were.

In detail:

- **The Top-Level Source Type removed (#5786):** `core/top-types.js` and `core/top-source.js` (the top document New
  Project made) are gone, and the field leaves New Project's settings page and summary, Design Properties, the
  project's data (`core/project-kind.js`, `core/mode-change.js`, `core/system-node.js`, `core/processor-board.js`,
  `core/system-top.js`) and the browser edition's imports. A saved `topSourceType` (a System's too: a System project is
  one by its kind or profile) is dropped when a project is read (`core/project-json.js`) and when it is saved
  (`core/project-defaults.js` projectJsonText, both stores').
- **ISE's `.xise`:** the export says the Top-Level Source Type from the top's file (Schematic for a schematic's top, HDL
  otherwise); the import keeps none.
- **MCP:** `new_project` and `set_design_properties` no longer take `top_source_type` (a System project:
  `new_project mode system`; Set as Top Module on a System document: `set_top`); `new_project`'s `language` sets the
  Preferred Language alone. The tools' list is shorter (#4752).
- The docs (Getting started, the System and circuit pages, the features, PROJECT.md, ARCHITECTURE.md, SYSTEMS.md)
  brought up to date.
