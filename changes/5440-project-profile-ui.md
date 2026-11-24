In short:

- **New Project and Design Properties:** the project's kind is its profile: Digital Logic, FPGA, **Embedded / SoC**
  (FPGA boards and microcontrollers in one System) or System. In Design Properties a wider one allows more kinds of
  nodes and converts nothing; a narrower one is refused while a node would not be allowed, the note naming it. A System
  project's Design Properties change its profile. Embedded / SoC and System not in a release yet.

In detail:

- The profile in the interface (#5440, roadmap #5416's phase 4, part 2): New Project's first page has the Embedded / SoC
  card (a System project of that profile, its System document made; off in a release as System's is, #5202);
  Design Properties' Project Kind offers the four profiles: a System's profile chosen hides the board and device
  fields, its note says what it allows, OK changes the profile only (core/profile-change.js, the MCP's
  set_design_properties' function and messages); a narrower one refused, the node named, OK disabled. A System
  project's Design Properties: its name and its profile (web/js/project-kind-ui.js systemProperties). The console's
  line and the refusals in Portuguese. The user's guide (EN, PT). Tests: the UI's design-properties-profile (an FPGA
  project widened, a System narrowed refused then done, Portuguese, no warnings), design-properties-kind,
  design-only, project-kind-step, system-release (the four cards), system-new-project (a System project's Design
  Properties), both interfaces; project-kind, mcp-project-kind
  (the cards' names) (Fixes #5440)
