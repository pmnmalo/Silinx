In short:

- **Circuits, power on both sides:** a new circuit's breadboard has its bottom rails powered too, joined to the top
  ones by a red and a black jumper, as on the bench.
- **Circuits, red and black wires:** a new wire to VCC (or VDD, +, a + rail) is red, to GND (or VSS, −, a − rail)
  black; any other blue. Its colour can still be changed.

In detail:

- **A new circuit's bottom rails powered (#4929):** `newCircuit` (New Source, the editor's empty model, the MCP's
  new_source) joins the top rails to the bottom ones on the right, + to + red and − to − black, as the Breadboards
  template does.
- **A wire's colour by default (#4932, #4933):** a wire added with no colour (the Wire tool, edit_circuit's wire) takes
  its net's: red when it joins an IC's VCC or VDD pin, the supply's + or a + rail, black when it joins GND, VSS, − or a −
  rail, blue otherwise or when it joins both (`wireColorOf`, core/circuit-edit.js).
