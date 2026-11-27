In short:

- A Zynq board's PS UART in a System (+ PS UART: the board's USB serial port, for a serial terminal), and the System
  example uart-zynq: a Zybo Z7's PL and its Cortex-A9's program side by side.

In detail:

- **The PS's UART as a Zynq node's interface (#4687, part 4):** `{ kind: 'uart', ps: true }`, named after its PS's UART
  (`PS_UART1` on the Zybo Z7, `PS_UART0` on the Arty Z7), 115200 baud like the starter. It has no ports: its pins are the
  board's MIO, which reach its USB serial port only. It is added by the System editor's + PS UART or the MCP's
  `edit_system` (`fields.ps`), one per node. It is described by its MIO pins and refused on another board, with tx or rx
  ports, or twice. It links to a serial terminal only, with no wires, and the check says the Cortex-A9 is not simulated,
  so Simulate and Emulate leave the link out.
- **The System example `uart-zynq` (#4687):** a Zybo Z7's PL (LD0–LD2 follow SW0–SW2, LD3 blinks) and its PS's starter
  program, its PS UART linked to a terminal. It is checked, simulated, built by the Silinx toolchain and compiled, each
  with no warning but the check's one about the PS link.
- **A node's PL build took its PS's C as Silinx HLS's (#4687):** building a Zynq node's PL warned on `<id>/ps/main.c` (HLS
  pointer warnings). The node's project now names its PS folder (`psDir`), which the build leaves out.
- The Zybo Z7's and the Arty Z7's notes say their processing system is now set up by Silinx.
- Tests: `test/zynq-ps-uart.test.js`, `test/system-example-zynq.test.js`, `test/ui/zynq-ps.test.js` (both interfaces,
  Portuguese).
