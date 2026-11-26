In short:

- **The XADC Wizard:** on a 7-series device, New Source ▸ XADC (analog inputs) makes a module that reads the die
  temperature, the supplies and the analog inputs you choose, each one's last 12-bit code on an output.

In detail:

- **The XADC Wizard (part of #5385, #5387):** core/xadc-wizard.js, the module (the XADC in its continuous sequence,
  CLKDIV for an ADCCLK of 26 MHz at most, INIT_48 / INIT_49 its channels, each end of conversion a DRP read of its
  channel latched into the channel's output, EOS; a VAUX's pins its ports), in VHDL and in Verilog, its settings in its
  header as the Clocking Wizard's; web/js/xadc-wizard.js, its pages (the clock and the channels, the summary), New
  Source's entry on a 7-series device, the Design pane's base and its View/Edit process; Portuguese. MCP: xadc_wizard.
  Tests: xadc-wizard (its plan and refusals; its module in both languages simulated with the XADC's model, each output its
  channel's code), mcp-wizards; the UI's xadc-wizard in both interfaces and Portuguese.
