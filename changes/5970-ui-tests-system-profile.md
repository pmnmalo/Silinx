In detail:

- **The UI tests make their System projects by profile (#5970):** since silinx.json's version 2 (#5907) a project's
  `profile` is what it is, its old `kind` read only for a project with none. The UI tests that turned a template's project
  into a System by writing `kind: 'system'` over its silinx.json (profile `fpga`) kept an FPGA project, and those waiting
  for the Design pane's System row timed out on main (the Zynq UI tests too, #5969). They now write
  `profile: 'system'`; test/ui-project-profile.test.js guards it.
