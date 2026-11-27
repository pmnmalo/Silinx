In short:

- **I/O Pin Planning:** its Table, Board and Text views and the constraints file stay the same: what is typed in the
  Text view shows at once in Board Resources, and the file saved in its text editor, or changed outside Silinx, shows
  in all three views.

In detail:

- **I/O Pin Planning's views in sync (#5788):** one model, the assignments, the clocks and the file's other lines, that
  every view follows on every change: the Text view read into it as it is typed (the Board Resources panel and the
  status line follow it); the constraints file saved by its text editor (`silinx:doc-saved`) or changed outside the
  page (the MCP server, another program, a live share's owner: web/js/project-watch.js, the planner's `fileOf` and
  `fileText`, a conflict asked as a text editor's) read into it again; opened, the file's text editor's text not saved
  yet rather than the disk's; an autosave while the Text view is typed in no longer sets the text back to what it
  saved; Undo and Redo in the table undo the file's other lines (a `CONFIG`, an `OFFSET`) with the pins. Tests:
  test/ui/pinplanner-sync.test.js.
