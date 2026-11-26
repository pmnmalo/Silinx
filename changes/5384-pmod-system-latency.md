In short:

- **Pmods through a System:** a circuit node with an SPI part (a Pmod AD1, a DA2) answers the FPGA within a sixteenth
  of the SPI clock, so a converter's bits are read on time; the latency is said in the console, and a faster SCK is
  set in the node's Properties. A new System example, adc-pmod: a Basys 2 reads a potentiometer through a Pmod AD1 and
  shows the code on its displays.

In detail:

- **A circuit node's wires and its SPI parts (#5384):** core/system-circuit.js's circuitLatency: a circuit with a part
  that has an SCK or SCLK pin makes its wires' latency a sixteenth of the SPI clock's period (an SPI link's), 20 ns at
  3.125 MHz by default instead of a wire's 1 µs (which read the AD1's bits about 6 late); the node's `spiHz` (the System
  document, its Properties' "SPI clock (Hz)", edit_system's change_node) sets the clock; Simulate System's console says
  the latency in use; a circuit with no SPI part keeps 1 µs. Portuguese.
- **The adc-pmod System example (#5384):** examples/adc-pmod: fpga/adc_display.vhd (an SPI master at clk / 16, the
  AD7476A's code in hexadecimal on the four displays, its top bits on the LEDs), its UCF, the circuit node's
  bench.circ.json (the Basys 2, the AD1 on JA, a potentiometer on A0); docs/SYSTEMS.md. Tests: system-pmod (the code
  read at two positions, the override, a circuit with no SPI part), system-adc-example (the displays decoded), the
  System editor's UI test (the field, in Portuguese), mcp-system (edit_system's spiHz).
