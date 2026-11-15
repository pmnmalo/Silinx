In short:

- **Shared pins of an arrayed instance:** its Properties list its pins under Width, a tick box each: a ticked pin (a
  clock, an enable) is shared by every copy whatever its net, drawn as a single pin even before it is wired.

In detail:

- **An arrayed instance's pins marked shared (#3966):** the Shared pins of an arrayed instance's Properties, a tick
  box a pin, stored in its `params.shared` (matched whatever the case; undone with Undo). A ticked pin is never sliced
  over the copies: drawn as a single pin, each copy given the whole net in the generated VHDL and Verilog; on a net of
  another width an error of its own (no width mismatch), and a ticked output an error, each copy driving the net
  (core/sch-array.js `sharedPins`, `sliceArrayed`, `arrayedError`). An unticked pin keeps the rule by its net's width.
  The MCP server's `place_instance` and `set_instance_width` take a `shared` list of pins (`sharedList`).
