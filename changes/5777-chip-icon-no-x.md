In short:

- **The Design pane's chip icon:** the device's row and the primitives' rows show a plain chip, without the "X"
  inside that looked like an error's mark; a missing module keeps its red cross.

In detail:

- **The chip icon without its "X" (#5777):** the `chip` icon (the device's row, a primitive's instance, a System
  project's FPGA node, the FPGA View) is a chip's body and pins only; the error icon (`err`) is unchanged.
