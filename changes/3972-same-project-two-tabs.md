In short:

- **The same project in two tabs:** a save in one tab is shown in the other, which reloads the file or, when it has
  changes of its own, asks which version to keep. Before, the other tab's next save replaced it, unasked.

In detail:

- **A page's writes told to the project's other pages (#3972):** each page names itself in its requests
  (`X-Silinx-Client`), and the local server tells what a page's request changed to the pages that have the project
  open, but not to that page itself. A request that names no page, and a run, are told to none, as before. The
  messages say "in another tab" rather than "outside Silinx".
