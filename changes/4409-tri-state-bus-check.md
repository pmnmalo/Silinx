In short:

- **Bus transceivers and three-state buses:** the 74242, 74243 and 74245 transceivers, A to B or B to A. Check no
  longer calls two three-state outputs on one bus a short circuit.

In detail:

- **The bus transceivers (#4397, group B):** `core/circuit-ics.js` adds the 74242 (inverting), 74243 and 74245, their
  A and B pins inputs and three-state outputs at once. Each bit is a buffer each way, enabled by GAB̅ and GBA, or by
  DIR and OE̅. These pins are `inout` in the ICs' HDL and read as a net's readers in the circuit's HDL. A transceiver's
  two ways never conduct at once, so their loop through its pins is marked as no loop for the lint. KiCad's
  74LS242, 74LS243, 74LS245 and 74HC245 behave as them, whatever pin type their symbols give A. The catalogue's
  KiCad logic ICs that behave go from 132 to 136.
- **Three-state outputs on one net are a bus (#4409):** Check Circuit reported two 74125 outputs on one net as `Short
  circuit`. A three-state output (`tri` on its pin) is now counted apart. Several on a net are a bus. With a plain
  output or a supply rail on the net, Check gives a warning, a short whenever one is enabled.
