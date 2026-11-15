In short:

- New Source's *Circuit* is now **Digital Electronic Circuit**, second in the list, with a wizard of typical assemblies
  (breadboards and their supply, switches and LEDs); the Top-Level Source Type's Circuit is named so too.

In detail:

- **The Digital Electronic Circuit Wizard (#4061):** New Source ▸ Digital Electronic Circuit (renamed, after Boolean
  Algebra) ▸ Wizard >: an assembly (`core/circuit-templates.js`, the template page's): N breadboards (half or full) and a
  supply, every board's rails joined to the next one's; a half breadboard with N switches `sw[k]` and M LEDs `led[k]`;
  the circuit made and opened (`web/js/circuit-wizard.js`). The MCP's `new_source` takes the same (`template`,
  `template_params`). The Top-Level Source Type's Circuit (#4105) is named Digital Electronic Circuit too. Tests: `circuit-templates` (every board powered,
  checked by the circuit's nets and checks), `mcp-new-source`, UI `circuit-wizard` (new), `new-source`,
  `new-source-paths`, `design-only`, `projects`, `circuit`, `design-properties-top-type`, in both interfaces and Portuguese.
