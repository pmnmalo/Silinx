In short:

- Check Syntax of a file with a syntax error, from the editor's toolbar, no longer says its modules were elaborated:
  its lines are those of Process ▸ Check Syntax.

In detail:

- **Check Syntax's lines the same from the Process menu and from the editor's toolbar (#5332):** both end through one
  function (web/js/processes.js checkedLines): the diagnostics, then, with no error only, the elaboration's lines
  ("Elaborating module <…>", after the warnings) and the result. A file with a syntax error is not elaborated, as
  XST's Check Syntax; the toolbar's printed its "Elaborating module" line before the error. The MCP's check_syntax
  already said the design's size only when it passed.
