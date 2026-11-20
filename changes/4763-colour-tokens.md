In short:

- **SSim's signal names readable in the dark theme:** their rows' lines, dividers, twisties, counts and the forced
  signals' F follow the theme.

In detail:

- **SSim's names drawn with the theme's colours (#4763):** their rows' lines, a divider's text, a twisty, a group's
  count, a forced signal's F and a dragged row's line were colours written in the code (`#ececec`, `#15428b`, `#555`,
  `#888`, `#c06000`, `#000`), light on the dark themes' dark background; they are now the theme's variables
  (`--wave-row-line`, `--wave-divider-fg`, `--wave-twisty`, `--wave-count`, `--wave-forced`: web/css/theme.css, the ISE
  style's dark theme, the Silinx interface's), with their paper colours in a print.
- **The hex colours in web/js only go down (#4763):** `test/hex-colours.test.js` counts the quoted hex colour literals
  of each file of web/js: no file may have more than its limit, a file not listed none, and a file with fewer has its
  limit lowered (the ratchet kept tight).
