In detail:

- **The Nexys A7 (xc7a100t) in the browser edition, tested, and nextpnr's memory there measured (#3669):** the browser
  edition's UI test of the 7-series (standalone-xc7) runs blinky and vga on the Nexys A7 too, to the .bit, with no
  warnings, its configuration data byte for byte the local server's flow's; the xc7a100t's bit database and chip
  database fetched once, the xc7a50t's not. nextpnr's router2 there takes 2043 MB of WebAssembly memory for blinky and
  2095 MB for vga (the same in Chrome, in WebKit and in Node: the same WebAssembly), about half of the 4 GB a page may
  have in Chrome and Safari, and a flow takes about 5 s in Chrome, 6 s in WebKit; router1, the browser's fallback when
  router2 runs out of memory, 90 MB and 164 MB (9 and 20 s). A new unit test, nextpnr-xc7-memory, guards these peaks
  (router2 within 2.5 GB, router1 within 256 MB, both routing the two examples with no warning).
