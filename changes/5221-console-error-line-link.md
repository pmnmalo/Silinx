In short:

- A Check Syntax, synthesis or simulation error or warning in the Console that names a project's file and line is a link:
  clicked, the file opens at that line, as its row of the Errors tab does.

In detail:

- **The Console's error lines link to their source (#5221):** an error's or a warning's line of the Console whose
  message has a project's file and line (Check Syntax's, written with its location, or a tool's line that names them)
  is a link (its tooltip "Open the file at this line", in Portuguese too): clicked, the file opens in its editor at that
  line and column. A drawing's Check lines keep going to their item, SSim's lines to their source on a double-click;
  the drawings' tooltips, drawn again when the language changes, no longer overwrite the files' (`web/js/console.js`).
