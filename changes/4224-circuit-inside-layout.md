In short:

- The circuit editor's Show inside draws a gate IC as its datasheet's connection diagram: each gate beside its pins,
  wired with horizontal and vertical lines from its pins into its inputs and from its output to its pin; VCC and GND
  named.

In detail:

- **Show inside as the datasheet's connection diagram (#4224):** the gates were drawn mid-package with straight
  diagonal lines from their pins, inputs and output alike, which did not tell which pin each input came from. Each gate
  now lies beside its pins, in the half of its output's row (in the middle when its inputs come from both rows: the
  7410's first gate, the 7430), facing its output pin (left for the 7402's and the 4000s' output-first pinouts); its
  inputs nest into its input side and its output leaves from its tip, with horizontal and vertical lines that cross
  neither each other nor another gate; a pin under its gate goes round it. The same layout in IEEE shapes and IEC boxes
  (`core/circuit-inside.js`). The pins no gate uses are named (VCC, GND); the MSI and sequential ICs keep their pins'
  names inside. Tests: `circuit-inside` (new: every gate IC's geometry, both standards), `symbol-standard`, UI
  `circuit-inside-symbols` (the lines as drawn), `circuit-look`, in both interfaces.
