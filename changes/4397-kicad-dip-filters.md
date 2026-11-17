In short:

- **The KiCad catalogue's 74xx and 4xxx:** 143 more of KiCad's logic ICs (the 74LS245, 74HC573…), 293 in all, on their
  DIPs.

In detail:

- **KiCad's `DIP?16*` footprint filters read (#4397):** a KiCad symbol with no footprint and a DIP filter written
  the way KiCad's 74xx and 4xxx write it (`DIP?16*`, `DIP?20*`, with no width) is a DIP part. It gets as many pins as
  the filter says, its rows 7.62 mm apart up to 20 pins and 15.24 mm from 24 (or as the filter says). Before, only
  `DIP*W7.62mm*` was read, and 143 of KiCad's logic ICs were no part. They are drawn only for now. Their behaviour
  comes with #4397's next changes.
