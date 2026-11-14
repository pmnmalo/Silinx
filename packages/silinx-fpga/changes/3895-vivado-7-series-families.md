In detail:

- **The Spartan-7, the Kintex-7 and the Zynq-7000 AMD Vivado's (Part of #3895):** FAMILY_INFO's `spartan7` (no ISE
  14.7 name; `familyOfPart` of `xc7s…`), and `kintex7` and `zynq` with `backEnd: 'vivado'`, all three experimental with
  XDC constraints and `openFlow: false`; `openFlowDevice` (a family with a flow of the Silinx toolchain) and
  `noOpenFlowMessage` from src/parts.js; `openOnlyDevice` not true of a Vivado family that ISE does not have.
