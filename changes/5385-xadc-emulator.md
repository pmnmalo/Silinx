In short:

- **The XADC in the Board Emulator:** a design that reads the XADC gets its analog inputs in the emulator's side panel:
  the die temperature and a knob for an analog input (VP / VN, VAUX0..15), as a potentiometer on the Basys 3's JXADC.

In detail:

- **The Board Emulator's analog inputs (part of #5385, #5387):** core/emulate-xadc.js, a design's XADC instances and
  their values set (the model's temp_mc, vp_mv and vaux<k>_mv forced, in range); web/js/emulator-xadc.js, the side
  panel's "Analog inputs (XADC)" box (the die temperature, an input chosen and its knob, kept through a power cycle);
  Portuguese. The XADC's model has a signal per VAUX input (vaux0_mv..vaux15_mv: forceable, simulate's forces of the MCP
  server set them). Tests: emulate-xadc (a design reading VAUX6, its LEDs the code of each value, the refusals),
  mcp-xadc (simulate's forces), unisim-xc7-xadc; the UI's emu-xadc in both interfaces and Portuguese.
