In short:

- **More of the interface in Portuguese:** the messages with a name or a number in them (a file that cannot be
  opened, "Project … created", the KiCad parts' errors, a programming job's failure, Undo and Redo with their action, a
  drawing's tab title), a schematic's title block (FOLHA, LINGUAGEM), the simulator's wave window's header (Nome,
  Valor) and its New Group and divider prompts.

In detail:

- **The texts the i18n scan could not see (#4748):** `test/i18n-templates.test.js` reads the template literals of the
  label forms (a label, a title, a toast, a console line, a dialog's message, an element's text) and the texts of an
  element's `innerHTML`, each translated with sample values in its `${…}` (a conditional's own strings) or its real
  text listed; about 60 of them were English in Portuguese, now patterns of `web/js/i18n-messages.js`, a message's own
  part (an error's text) translated with it. `t()` before a canvas's `fillText` (SSim's Name / Value), in a schematic's
  SVG title block, and around the browser's prompt of SSim's New Group and dividers.
