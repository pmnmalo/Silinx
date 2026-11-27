In short:

- Update Constraints puts a port named after a button, an LED, a switch or a digit by its number (`btn3`, `led_0`,
  `sw7`, `an2`) on that pin: `btn3` on the Basys2's BTN3, no longer on the next free button.

In detail:

- **A port named after a resource by its number (#5765):** `boardAutoAssign` (the toolchain's `ucf.js`) matches a
  one-bit port named after a resource of several pins and an index (`btn3`, `btn_3`, `led0`, `buttons_1`) to that pin
  of the resource, as `btn(3)` of a bus would have it, in Update Constraints, the MCP's `set_top` with
  `update_constraints` and a new project's constraints; an index the resource has not (`btn4` on the Basys2) and a name
  of no resource stay unmatched, placed by direction as before.
