In detail:

- **A KiCad part's pin named by any reserved word of VHDL or Verilog refused (#4770):** a part modelled by a module of
  the project (Silinx.HDL) had its pin names checked against a short list of 21 words, so a pin named `process`, `type`,
  `case`, `buffer`, `library` or `assign` made a circuit HDL that did not compile; they are now checked by `breaksHdl`
  (core/reserved.js) in both languages, the part refused with "its pin's name is not an HDL name: give it one in
  Silinx.Ports".
