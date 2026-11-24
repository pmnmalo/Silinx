In detail:

- A project's profile replaces its kind (#5440, roadmap #5416's phase 4; core and the MCP server, the interface next):
  `core/project-profile.js` names the profiles, each the node kinds its System allows and each containing the one
  before: Digital Logic (design and circuit nodes) ⊂ FPGA ⊂ Embedded / SoC (and microcontrollers) ⊂ System (and
  terminals). A project's profile is read from today's silinx.json (no kind: FPGA; `design`: Digital Logic; `system`:
  System); it is written only when changed, and only Embedded / SoC and System as `profile`, so that an FPGA or a
  design project untouched keeps its bytes. `core/profile-change.js` `changeProfile`: widening converts nothing;
  narrowing is refused while a node of the project's System would not be allowed, the node named; a System as the top
  is replaced by a module first; a design project's own rule kept (its own HDL or C refused). The System document is a
  System project's System only while it is its top (a module as its top: its System implicit). The conversions
  (asDesignProject, asFpgaProject, asSystemProject, toModuleTop) write the profile. A System node may be a design
  node (a design and simulation project's drawings). The old kind id `codesign` is no longer read (Pedro: the System
  projects were the developers' tests only). The MCP server: `new_project` and `set_design_properties` take `profile`
  (logic, fpga, embedded, system), `kind` and `design_only` its deprecated names; `set_design_properties` widens or
  narrows a System's profile with the interface's messages; `set_top`'s result says the profile. Systems' profiles off
  in a release (#5202). Docs: docs/PROJECT.md. Tests: project-profile (every widening and narrowing, the refusals and
  their messages, the bytes, a release), project-system (the corpus again, nothing written), mcp-project-kind,
  mcp-protocol (the aliases), mcp-system-top, mcp-design-only, system-top, system-example, system-project-file,
  system-check, system-edit, project-store (Part of #5440)
