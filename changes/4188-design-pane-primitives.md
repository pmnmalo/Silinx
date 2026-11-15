In short:

- The Design pane no longer marks a device primitive (BUFG, a block RAM, a DCM…) placed in a schematic or instantiated in HDL as "(missing)": its row says "(primitive)".

In detail:

- **A device primitive's row in the Design pane (#4188):** an instance of a UNISIM primitive (a schematic's Device
  Primitives, or an HDL instance of BUFG, DCM_SP, RAMB16_S9…) is a leaf marked "(primitive)", named in upper case with
  the chip's icon, not "(missing)" with the error's: it is the device's, not a module missing from the project
  (core/unisim.js `isUnisimPrimitive`); a module that is not in the project stays "(missing)", and both are translated
  into Portuguese.
