In short:

- **The Design Summary of an iCE40, ECP5, Gowin or GateMate board lists that family's resources only:** no Spartan
  rows at 0 after nextpnr's own (ICESTORM_LC, SB_IO; the Gowin's LUT4, DFF, IOB…).

In detail:

- **The Device Utilization Summary's rows the family's own (#4512):** the part's resources a report leaves out are
  added at 0 only when the report names its rows as the part's resources (ISE's MAP, the Silinx toolchain's
  Spartan-3E, Spartan-6 and 7-series); nextpnr's reports of the iCE40, the ECP5, the Gowin and the GateMate keep
  their own rows alone. The rows are worked out in `core/summary-utilization.js`, read by the Design Summary and by the
  MCP's `get_report` summary (its `designSummary.utilization`: the caption and rows the interface shows).
