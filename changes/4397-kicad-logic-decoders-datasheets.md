In short:

- **More decoders and display drivers:** the 4028, 74246, 74247, 74248, 4543 and 74348, their function tables read
  from their datasheets, in the Parts panel's MSI group and as KiCad's parts.

In detail:

- **Decoders checked against their datasheets (#4397, group F):** `core/circuit-model-decoders.js` adds the 4028 (BCD
  to decimal, active high, all low for 10–15), the 74246, 74247 and 74248 (BCD to 7 segments with tails on 6 and 9,
  their BI̅/RBO̅ their RBO̅ output: an open collector low while a zero is blanked), the 4543 (latched, BI blanking, PH
  inverting its segments for an LCD; no tails, blank above 9) and the 74348 (the 74148, its A̅ off while GS̅ is high).
  An IC's three-state outputs may now be enabled by one of its own outputs (the 74348's GS̅). The catalogue's KiCad
  logic ICs that behave go from 243 to 249. The 74LS249 stays drawn only until its datasheet is read.
