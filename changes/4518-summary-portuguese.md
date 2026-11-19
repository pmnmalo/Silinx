In short:

- **The Design Summary in Portuguese:** the product's version, the minimum period, the timing constraints' rows and
  the utilization's rows are translated too.

In detail:

- **The Design Summary's values in Portuguese (#4518):** "Silinx … (toolchain Silinx, sem ISE)" (and the ISE and
  Vivado flows), "… ns (frequência máxima … MHz)", a constraint's row ("PERIOD 20 ns em clk — cumprida, 6.781 ns",
  "… — 2 erros, nenhum caminho entre flip-flops a temporizar"), nextpnr's clocks ("relógio clk"), ISE's "Not met (…
  errors, score …)", the logic analyzer's block RAMs, and the utilization's rows with the resources' names kept as
  the reports' and the words around them translated ("Número de LUTs de 4 entradas", "Número de Slices ocupadas",
  "Número de IOBs ligados a pinos"). The texts are in `web/js/i18n-summary.js`.
