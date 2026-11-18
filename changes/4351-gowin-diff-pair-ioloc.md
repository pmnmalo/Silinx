In short:

- **Gowin differential pairs:** a pair's IO_LOC names both pins on its P port (`IO_LOC "p" 62,61;`), as Gowin's tools take
  it; its N port needs none of its own.

In detail:

- **A differential pair's IO_LOC with both pins (#4351):** the Gowin's CST keeps an IO_LOC's second pin and Place & Route
  gives it to the pair's N port (silinx-fpga's fragment); a second pin on a port with no differential buffer, or an N port at
  another pin, is an error naming them.
