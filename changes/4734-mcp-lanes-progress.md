In short:

- **The MCP server answers while a process runs:** an assistant's ping, its list of tools and its calls on another
  project are answered while a synthesis or a simulation runs, and `run_process` reports its progress.

In detail:

- **The MCP server: its requests in order by project, its progress (#4734):** `ping`, `initialize` and `tools/list` were
  answered only after the calls before them, a `run_process` taking minutes; they are answered at once. The tools' calls
  wait for the calls before them on the same project (a process and the read of its report never overlap), a call on no
  project (`list_projects`, `new_project`…) and a batch for every call before them, and two projects' calls run together.
  `run_process` sends `notifications/progress` (its log's lines: their count, the last one) when the request gives a
  `_meta.progressToken`.
