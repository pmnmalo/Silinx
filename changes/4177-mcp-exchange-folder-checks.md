In detail:

- **The MCP server's exchange folder, checked as a project's files are (#4177):** a path of it is never a hidden file or
  folder (by its name or through a link), nor one in the workspace or Silinx's configuration folder; a new file written
  there (`grade`'s student's copy, a CSV) has its kind's extension (`.json`, `.csv`).
- **The Classroom template (#4177):** its project, when the MCP's `grade template` makes it, is marked as made through
  the MCP server (untrusted until the user trusts it), as `new_project`'s; a visible test's file that is one of the
  starter project's (its top, its `silinx.json`), a hidden one or `build/`'s makes no template, its error in the console
  (Classroom Template…) or the tool's result.
- **`find_in_project`'s time bounded (#4177):** a regular expression that backtracks without end stops after 5 s,
  nothing replaced, and the MCP server answers again.
