In short:

- **Gowin: the I/O logic, the differential I/O and the DSPs in the bitstream:** the GW1N's .fs is written for designs
  with ODDR / IDDR, the serialisers and deserialisers, IODELAY, LVDS (true and emulated), MIPI and I3C buffers, the user
  flash, CLKDIV, DHCEN, DCS, DQCE and every DSP of the GW1N, byte for byte as Apicula 0.32's `gowin_pack` writes it.

In detail:

- **gowin_pack's remaining GW1N primitives ported (#4333):** `src/fpga/gowin/iologic.js` (IOLOGIC, ODDR / ODDRC, IDDR /
  IDDRC, OSER4 / 8 / 10, OVIDEO, IDES4 / 8 / 10, IVIDEO, their dummies and empty halves, the IODELAY: set_iologic_attrs),
  `hclk.js` (CLKDIV and CLKDIV2: set_hclk_attrs; DHCEN, DCS, DQCE), `dsp.js` and `dsp-multalu.js` (MULTALU18X18,
  MULTALU36X18, MULTADDALU18X18, MULT36X36, ALU54D, PADD9, PADD18 beside MULT9X9 and MULT18X18, moved there from
  `bsram-dsp.js`, which still exports `dspAttrs`), and `place.js`'s I/O buffers: the true and emulated LVDS outputs,
  tristates, inputs and bidirectional buffers on their P pin, their bank's voltage and their B pin's fuses, MIPI's output
  and input (its aux cell's), I3C's buffer, the user flash and PINCFG (no fuses), a differential cell kept to the end
  when nextpnr marks it. `attrids.js` gains Apicula's IOLOGIC, DCS and DLLDLY tables. Still refused by name: what the
  GW1N-9C has not (PLLVR, PLLA, DLLDLY, BANDGAP, EMCU, BUFS, BUFG, ADC, the GW1NZ-1's oscillator, the GW5A's DSPs), and an
  ALU54D without its B_ADD_SUB / C_ADD_SUB (Apicula fails on it). Tests: `test/gowin-iologic.test.js`,
  `test/gowin-diff-io.test.js`, `test/gowin-dsp.test.js` (44 designs on the Tang Nano 9K, `test/fixtures/gowin-pack/
  designs.mjs`, each .fs against the SHA-256 of Apicula's, `apicula-0.32.json`'s `primitives`; CLKDIV2, which nextpnr does
  not route alone, against Apicula's set_hclk_attrs; Apicula's messages for a pair on the wrong pins), and
  `test/gowin-pll-osc.test.js` refuses a PLLVR now that CLKDIV is ported.
