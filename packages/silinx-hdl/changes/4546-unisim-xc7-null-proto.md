In detail:

- **The 7-series' block RAM table without a prototype (#4546):** `E1` in `src/unisim-xc7.js` (the RAMB18E1's and the
  RAMB36E1's widths and sizes), read with a computed key, is a null-prototype object, as the front ends' other tables
  (#3560); `test/proto-names.test.js` checks it.
