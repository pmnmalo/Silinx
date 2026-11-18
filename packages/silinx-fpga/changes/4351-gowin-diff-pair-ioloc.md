In short:

- **A Gowin differential pair's IO_LOC on its P port:** `IO_LOC "p" 62,61;` places the pair, Gowin's convention: its N port
  needs no IO_LOC of its own.

In detail:

- **A differential pair's IO_LOC with both pins (#4351):** cst.js reads the second pin of an IO_LOC (`pairLoc`; it dropped it
  before) and writes it back; the Gowin's Place & Route (open-flow-gowin.js, `gowinPairs`) gives it to the N port the
  differential buffer at the P port pairs it with (TLVDS / ELVDS / MIPI's O / OB, I / IB, IO / IOB, through synth_gowin's I/O
  buffers), and nextpnr an IO_LOC on each port (it reads "62,61" as another pin). The Tang Nano 9K's TLVDS_OBUF on 62,61,
  TLVDS_IBUF and ELVDS_IOBUF (80,79): the routed design and the .fs the same as with two IO_LOCs, Apicula's byte for byte. A
  second pin on a port no differential buffer pairs, or an N port with an IO_LOC of another pin, refused by name.
