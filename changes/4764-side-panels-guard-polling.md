In short:

- **Side panels without folding sections:** the Schematic editor's, the FPGA view's and I/O Pin Planning's panels show
  their sections as plain headings (the panel itself still folds); nothing selected, the FPGA view's Selection says
  nothing.

In detail:

- **Side panels as the interface's rules say (#4764):** the sections of the Schematic editor's Properties (HDL kept
  with the schematic, LUT function, Pins), the FPGA view's (Device, Modules, Selection, Nets) and I/O Pin Planning's
  Board Resources groups are plain sections with their heading, no longer `<details>` that fold one by one; the FPGA
  view's "Click a site on the chip…" placeholder and the Board Emulator's hint line ("Buttons: press and hold…", which the
  buttons' tips already say) are gone.
- **An exercise or a results file not opened in another project (#4764):** read while another project opened, it is
  no longer opened in that one (#1231).
- **The toolbar's steps without polling (#4764):** they followed the app through a refresh every second that wrote
  their labels again (translated again each time in Portuguese); they now follow a click, a key, the focus, a document
  in front, a project opened or closed and a process's state, and a label is written only when it changes.
