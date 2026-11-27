In detail:

- **The designs corpus's 'ci' run times re-recorded (#5826):** `test/designs-corpus/times.json`'s `ci` baseline and the
  README's table from the nightly of 2026-11-26 (run 45749949014, green, Yosys 0.70), no longer from that of 2026-11-07,
  where the flows of ITC'99 b14, b20, b21 and b22 had failed within seconds (#2818, #2977): their 10–28 s were never a
  routing time, and every nightly since warned that they took 15 to 25 minutes. Their routing on the nextpnr engine is
  #5826's.
