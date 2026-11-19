In detail:

- **A CCF's clock comment in linear time (#4587, #4588):** `# create_clock … [get_ports …]` is matched on its line
  trimmed with its `;` cut, no longer by a pattern with blanks on both sides of an optional `;` (quadratic on a long
  line of blanks: 100000 of them some 3 s; CodeQL's js/polynomial-redos, alerts 206 and 207). The clocks read are
  the same.
