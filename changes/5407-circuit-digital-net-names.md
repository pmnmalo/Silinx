In detail:

- **A circuit's synthesis model names its nets away from its ports (#5407):** `core/circuit-digital.js` named the
  digital architecture's nets n1, n2… whatever the circuit's ports were. A switch labelled `n1` gave a signal `n1`
  beside the port `n1`, which Check Syntax refuses since eecb97b6f (an architecture's declaration with its entity's port's
  name, as XST's). A net's name is now none of the module's ports', its own or its ICs' entities' (`n1_2`), as the
  simulation model's already was. Test: circuit-hdl (the label n1: the digital model's nets in VHDL and in Verilog; it
  failed on main).
