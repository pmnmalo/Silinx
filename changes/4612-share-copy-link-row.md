In short:

- Share Project… ▸ A copy looks like Live: the link's buttons sit in one row below a box as wide as the window and only
  as tall as the link. Generate is named for the link it makes: Generate Full Link or Generate Short Link in a copy,
  Generate View-Only or Generate Edit Link live. The window keeps its size when switching between A copy and Live.

In detail:

- **Share Project… ▸ A copy's link in a row layout (#4612):** Generate, Copy, Show and Show QR Code are in one row
  below the link's box (wrapping on a narrow screen), no longer in a column beside a tall box, as Live's links since
  #4576 (`web/js/link-field.js`'s row field). The box spans the window's content and is as tall as the link, hidden (a
  dot for each character) or shown, and before Generate as tall as the link it will make; a full link of thousands of
  characters takes at most 8 lines, scrolled beyond, which keeps the window's Close in view. Manage short links… stays
  below.
- **Share Project… ▸ A copy: Generate Full Link or Generate Short Link (#4615):** Generate is named for the link the
  Link: choice makes (in Portuguese Gerar a Ligação Completa, Gerar a Ligação Curta).
- **Share Project… ▸ Live: Generate Edit Link (#4613):** the editors' link's Generate is named Generate Edit Link (in
  Portuguese Gerar Ligação de Edição).
- **Share Project…'s window keeps its size (#4617):** A copy's and Live's windows are the same size, 720 pixels wide and
  as tall as a copy's with its link made (at most 90% of the screen's height, the content scrolled beyond), so switching
  between them, Start Sharing and Generate no longer resize it.
