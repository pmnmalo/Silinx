In detail:

- **The Digital Electronic Circuit Wizard without Empty (#4161):** its assemblies are Breadboards and a supply, and
  Switches and LEDs (`core/circuit-templates.js`); `circuitTemplate` refuses an unknown one, naming the valid ones. The
  MCP's `new_source` refuses `template: 'empty'` the same way ("template: one of boards, io"), writing nothing. New
  Source ▸ Digital Electronic Circuit without the wizard still makes a half breadboard and its supply. Tests:
  `circuit-templates`, `mcp-new-source`, UI `circuit-wizard` (both interfaces, Portuguese).
