In detail:

- **Firefox: the browser edition's nextpnr engine no longer fails now and then with "too much recursion" (#5592):** the
  routed design's XDL is read by a scanner of characters, not by regexps whose backtracking stack overflowed (Firefox's
  `InternalError: too much recursion`). Tests: xdl.
