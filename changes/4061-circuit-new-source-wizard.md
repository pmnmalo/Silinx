In short:

- New Source's *Circuit* is now **Digital Electronic Circuit**, second in the list, with a wizard of typical assemblies
  (breadboards and their supply, switches and LEDs); a new project's top can be one, the types in New Source's order.

In detail:

- **The Digital Electronic Circuit Wizard (#4061):** New Source ▸ Digital Electronic Circuit (renamed, after Boolean
  Algebra) ▸ Wizard >: an assembly (`core/circuit-templates.js`, the template page's): N breadboards (half or full) and a
  supply, every board's rails joined to the next one's; a half breadboard with N switches `sw[k]` and M LEDs `led[k]`;
  empty; the circuit made and opened (`web/js/circuit-wizard.js`). The MCP's `new_source` takes the same (`template`,
  `template_params`). The New Project Wizard's Top-Level Source Type offers a Digital Electronic Circuit too
  (`src/top.circ.json` and its HDL), the types in New Source's order. Tests: `circuit-templates` (every board powered,
  checked by the circuit's nets and checks), `mcp-new-source`, UI `circuit-wizard` (new), `new-source`,
  `new-source-paths`, `design-only`, `projects`, `circuit`, in both interfaces and Portuguese.
