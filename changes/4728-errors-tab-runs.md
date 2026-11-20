In short:

- **The Errors tab no longer keeps fixed errors nor lists one failure several times:** a check run again (a
  schematic's Check, Try it, a C simulation, Run Tests) replaces its own errors and warnings, so a fixed error goes away
  and an unchanged one is listed once; a failed implementation lists its errors once, not with its "Process … failed"
  line or the scripts' "SILINX FAILED" marker; stopping a process is information, not a warning.

In detail:

- **The Errors / Warnings tabs' entries by run (#4728):** each entry the console collects carries the run that wrote
  it (the process's header, `Started : "…" of …`), and the run's header, written again, first drops that run's
  entries; an entry of no run said again replaces the same one (a refusal said twice: listed once). A run's result
  (`Process "…" failed / stopped`) and `=== SILINX FAILED step` are no entries; Implement's job error is said once
  (`jobLog`, its "Process failed: <error>" the entry); the elaboration errors given to the Errors tab are not listed again
  from their console lines; the constraints' quiet check no longer lists an open drawing's problems twice; Stop,
  "Stopping…" and Rename Project's refusal are information; "Schematic … generated with errors" is no entry.
