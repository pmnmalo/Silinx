In short:

- **An assistant's drawing whose HDL file is in the way:** written with no link to its HDL file over a module
  that already has one, it now says why it has no HDL file and how to give it one, as the Design pane does,
  instead of leaving the old HDL as the design without a word.

In detail:

- **MCP `write_file`, `new_source`, `import_source`: a drawing with no `generatedFile` whose HDL file is in the way
  says why (#4693):** when its HDL file exists already (its module's, by hand, or holding something else), another
  file defines its module or another drawing's HDL file is its module's, the drawing is written and its HDL left as
  it was, as before, now with the interface's warning (#230) and, for a module defined elsewhere, its way out: the
  drawing written with that file as its `generatedFile` replaces it; `write_file`'s `hdl` says the clash (its kind,
  the file).
