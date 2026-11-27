In short:

- **Systems:** an Embedded / SoC project's System editor offers only the nodes its profile allows (no serial terminal nor
  MQTT broker); a System project's allows the MQTT broker.

In detail:

- **A System's node kinds kept to its project's profile (#5910):** the System profile allows the MQTT broker (a node kind
  since #5500; its profile change's messages name it); a node kind the project's profile does not allow is refused when
  it is added (core/project-profile.js `nodeKindRefusal`, `systemRuleProfile`: an Embedded / SoC or a System project's
  System; a System document of an FPGA project, no rule as before): the System editor does not offer its tool, the
  MCP's `edit_system` refuses it, nothing written.
