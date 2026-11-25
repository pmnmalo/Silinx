In short:

- **The PIC24 in a System:** the System editor's **Explorer 16/32** places a PIC24FJ1024GB610 board; its `.hex` runs
  on Silinx's own PIC24 emulator in Try it, linked by its UART or its pins to the FPGA, an Arduino or a terminal.

In detail:

- **A PIC24 node of the System, the Explorer 16/32 (#5484, part 1):** the board `explorer-1632` among the
  microcontrollers' boards (`core/system-doc.js`: the PIC24FJ1024GB610, its 84 port pins at 3.3 V, its UART the
  USB-UART's pins TX RF5 and RX RF4, any UART module the program maps there through PPS, its firmware a `.hex`); its
  engine `core/system-sim-pic24.js`, silinx-pic24's `Pic24Node` with the Explorer 16/32 around it, behind the node
  contract with its fidelity notes, built for Try it and the MCP's `simulate`; the check: a PIC24's firmware not a
  `.hex`, a 5 V output on its 3.3 V input warned as on an FPGA's; an Uno changed into an Explorer 16/32, its `Serial`
  its `UART`, its links following; a drawing in its folder said not made yet (#5552); the System editor's tool and
  side panel (its `.hex` files, no SPI or I²C yet); the server serving the package's code to the page. Its board's
  drawing, SPI and I²C links and an example System are the next parts.
