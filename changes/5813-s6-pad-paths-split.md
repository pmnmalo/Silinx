In detail:

- The Spartan-6 pads' flow test is now one test file per part: the Nexys3's XC6SLX16 in `test/s6-pad-paths.test.js` (with the pads' paths) and the Atlys's XC6SLX45 in `test/s6-pad-paths-atlys.test.js`. They share `test/s6-pad-paths-lib.mjs`, and the tests are unchanged. The two parts together took about 17 minutes, past a test file's 15. The XC6SLX45's Verilog case took 550–563 s of its 600 s, and timed out on a loaded runner (#5813).
