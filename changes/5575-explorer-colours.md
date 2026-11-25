In detail:

- **The Explorer 16/32's drawing with no colour in its code (#5575):** web/js/emulator-explorer.js wrote its board's
  colours as hex literals, against test/hex-colours.test.js (#4763); they are now the stylesheet's (web/css/system-editor.css,
  `.sys-emu`'s `--exp-*`, the board's own: the same in the light and dark themes), read by the drawing as `var(--exp-*)`.
