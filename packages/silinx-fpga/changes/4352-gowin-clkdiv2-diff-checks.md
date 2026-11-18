In short:

- **Gowin: what nextpnr cannot do said by name:** a CLKDIV2 that is not a CLKDIV's only driver and a TLVDS_IOBUF are refused
  before nextpnr runs (it stopped with no message on the first); a differential tristate's enable, which nextpnr drops, is a
  warning.

In detail:

- **The Gowin's design checks before nextpnr (#4352):** gowin-checks.js reads Yosys's netlist: a CLKDIV2 whose CLKOUT drives
  anything but one CLKDIV's HCLKIN (a serialiser's FCLK: nextpnr-himbaechel-gowin 0.11.825's HCLK placer stops with no ERROR:
  line; the fabric's clocks: its router fails, then stops; a CLKDIV with other loads: its packer refuses it) and a TLVDS_IOBUF
  (not in the GW1N-9C's chip database's differential buffers) are errors naming the cells and pins; a TLVDS_TBUF's,
  ELVDS_TBUF's or ELVDS_IOBUF's OEN not tied to 0 a warning (nextpnr's pack_diff_iobs moves it to the P pin's buffer after
  make_iob_nets recorded that buffer's NET_OEN, none or GND, which gowin_pack reads: the pair always drives). A CLKDIV2 before
  a CLKDIV, the CLKDIV's output the fabric's clock, builds. The differential tristates' tests assert the warning; their
  routed designs and .fs are unchanged, Apicula's.
