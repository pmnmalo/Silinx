In detail:

- **An arrayed instance's Shared pins, its inputs alone (#4053):** the Shared pins of its Properties list only its
  input pins, an output being driven by every copy; the MCP server's `shared` refuses an output or a bidirectional pin,
  naming it; a mark left on a pin that is not an input (a file written before) is ignored, the pin taking the rule by
  its net's width (core/sch-array.js `isSharedPin`, `sharedList`).
