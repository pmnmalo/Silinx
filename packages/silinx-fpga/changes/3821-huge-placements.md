In short:

- **Optimization Speed on a very large design:** over 2000 slices, Place & Route makes two placements, not four: each
  takes 20 to 35 minutes on such a design, and four took 1.5 to 2.5 hours.

In detail:

- **Two placements over 2000 slices at High (#3821):** `NEXTPNR_TRIES.hugeSlices` (2000) and `highHuge` (2): a design
  over 2000 slices gets two placements at Optimization Effort High (Speed), four up to 2000 as before (#3095).
  ITC'99's b17 (3787 slices) took 34 minutes at Area (one placement) and was stopped at the Quality comparison's 2-hour
  limit at Speed (four) every run. Test: `test/nextpnr-engine.test.js` (the counts at the limits).
