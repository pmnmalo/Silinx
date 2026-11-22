In short:

- **Update Symbol: the wires follow their pins clear of the markers:** a pin that moves along its side (a new pin
  beside it, a symbol edited) keeps its wire square and on it without running it along an I/O marker's body: the wire
  jogs half way to its marker instead, or is routed around what it would run over.

In detail:

- **A wire that follows its pin stays clear of the pins and bodies (#5278):** `core/schdoc-repin.js` `followPins`
  (Update Symbol, a symbol's parameters changing its pins, Rotate and Mirror with Keep connections) bent a wire at its
  far end, which could be on an I/O marker's body ("wire W3: body at (290, 300)"). The corner is still made there when
  nothing new is run over; otherwise a straight wire whose other end is on a pin or an I/O marker jogs half way between
  its ends (it still leaves the pin and reaches its other end as it did), or else the wires that clash are routed again
  between their ends (`untangleWires`, with the module symbols' drawings); a way that would join or part nets (a net
  name the follow left off its wire) is not taken. Tests: schdoc-repin (the issue's case; pins moved across their wires
  on the four sides, the same HDL in VHDL and Verilog; a symbol of the arith test design turned: every pin on its net,
  nothing new run over; no warnings), the usability symbols' Update Symbol along the bottom (its todo a real test).
