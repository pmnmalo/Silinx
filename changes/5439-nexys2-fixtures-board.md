In detail:

- **The open flow's test fixtures name the Nexys2 by its board id (#5439):** seven projects of
  `test/fixtures/open-flow/` (and two of the ISE tests' copies) said `"board": "nexys2-500"` or `"nexys2-1200"`, ids no
  board list has, so their implicit System said `fpga: no FPGA board`; they say `"board": "nexys2"`, the device giving
  the variant. The corpus test of `test/project-system.test.js` checks that every project's board is one of the lists'.
