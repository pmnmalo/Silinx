In detail:

- **The Zynq's processing system set up by Silinx's own ps7_init (#4686, part 1):** `core/zynq-ps7.js` makes the
  SLCR's register writes (UG585) from a board's processing system as `core/boards-vivado.js` now describes it (the Zybo
  Z7's: a 33.333 MHz PS_CLK, the CPU at 667 MHz, UART1 on MIO 48 / 49, FCLK0 at 50 MHz, LD4, BTN4 and BTN5 on the MIO;
  the Arty Z7's: a 50 MHz PS_CLK, the CPU at 650 MHz, UART0 on MIO 14 / 15, FCLK0 at 100 MHz), with no DDR: the MIO, the
  ARM and IO PLLs (UG585's settings of the FDIVs checked against Vivado's: 26, 30, 32, 40; another refused), the CPU's,
  the UART's and FCLK0's clocks, the UART's and the GPIO's AMBA clocks; then the PS-PL level shifters and the PL's resets.
  Its writes are data, for the JTAG loader (#4687), and a listing. Tests: `test/zynq-ps7.test.js` (the writes against
  the Zybo Z7's ps7_init of Vivado in U-Boot and the PYNQ-Z1's, the Arty Z7's twin; the refusals).
