In short:

- A schematic's Try it keeps running when the project is compiled again with the same sources (a project setting
  changed, Silinx's or another program's); it stops only when a module it uses changes.

In detail:

- **Schematic editor: Try it no longer left at every compile of the project (#4601):** the schematic editor's
  `setModules`, called after every compile, left a running Try it even when the modules and the sources were those it
  was built from. So any project reload ended it, such as silinx.json written by another process. One example: a
  design link's Try it, which the project watch read again just after it started (about one run in two of the #2876
  test of `test/ui/design-link.test.js`). Try it now remembers the sources it was built from (`web/js/sch-try.js`
  `sourcesChanged`) and is left only when they or the modules changed.
