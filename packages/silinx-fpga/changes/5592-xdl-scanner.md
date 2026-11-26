In detail:

- **The XDL reader scans characters, no regexp over the whole text (#5592):** `parseXdl`'s tokenizer and `parseCfg`'s
  words were regexps whose repeated alternatives (`(?:[^"\\]|\\.)*`, `(?:\\.|\S)+`) keep a backtracking entry per
  character; on a long text their stack overflows, which Firefox reports as `InternalError: too much recursion` (from
  10 million characters in a worker, earlier when the stack cannot grow) and Node as `Maximum call stack size exceeded`.
  The browser edition's nextpnr flow reads the routed design's XDL with them right after nextpnr's run, where Firefox
  failed now and then. The same tokens and words as before (the fixtures' XDL and 500,000 random texts compared).
  Tests: xdl (a string of 10 million characters, which overflowed before).
