In short:

- **Documents in an older format:** a drawing saved by an older Silinx is said in the console when it opens, and a
  version of the project is kept before its first save in the new format, so that the old one can be had back.

In detail:

- **One envelope for Silinx's documents (#5906, the architecture audit #5902):** `core/doc-envelope.js`, a registry of
  every kind of document (silinx.json, the drawings, `.sym`, `.sys` and `.stim` `.json`, the versions' index) with its
  format, its version and its chain of migrations, from which `core/doc-format.js` is built; a document checked as
  current, older, newer, too old, with no version or damaged, each said in its words. The symbols, Systems and stimuli
  a newer Silinx saved are now refused written back in the older format as the drawings are. A document in an older
  format is said in the console's information when it opens, written in the new format on its next save (never on
  open), and a version of the project (`before-migrate`, "before a document's new format") is kept before that save,
  by the local server and the browser edition. The MCP's `project_info` says the documents' formats (`documents`).
