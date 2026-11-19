In detail:

- **CodeQL's alerts 204–209 resolved (#4515, #4516, #4586, #4587, #4588):** a part's function in Portuguese finds its
  nouns with every character of theirs escaped, not only `/` and `.` (`core/part-function.js`, the nouns a constant
  table; CodeQL's js/incomplete-sanitization); three tests' expressions built from a message or a symbol's name
  escaped completely too (`test/kicad-library.test.js`, `test/collab-meet-relay.test.js`,
  `test/relay-cloudflare.test.js`). The GateMate's CCF reads a clock's comment in linear time (#4587, #4588: its
  blanks either side of an optional `;` were quadratic on a long line, js/polynomial-redos; silinx-fpga's changelog).
