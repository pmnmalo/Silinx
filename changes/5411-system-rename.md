In short:

- **Systems:** what was called co-design (FPGA boards, microcontrollers and circuits wired together in a System) is now
  a **System project**: New Project's third kind is **System**, its top type **System**; the user's guide's page and
  the design are "Systems". Co-design is now the Zynq-7000's hardware/software co-design (#5412).

In detail:

- The multi-board work renamed System (#5411): the project kind (its id `system`; a project saved with the old id
  `codesign` read as a System project, `core/project-kind.js` `withKind`), its labels and their Portuguese (Sistema), the
  MCP's `new_project` kind `system` and the tools' descriptions, the release switch (`SYSTEMS_IN_RELEASE`, `systemsOn`),
  the names in `core/`, `server/` and `web/js/`, `docs/SYSTEMS.md` (was `docs/CODESIGN.md`, now with the nodes a System
  holds), the user's guide's `systems.md` (EN, PT). No behaviour changed. The New Project wizard's test of the Top-Level
  Source Types lists System (#5402's option). Tests: system-project-file (the old id read, written as the new),
  project-kind, mcp-project-kind, system-example, system-release, system-top, mcp-system-top; the UI's project-kind-step,
  projects, system-top, design-properties-kind, system-new-project, system-release and the System editor's, both
  interfaces and Portuguese (Fixes #5411)
