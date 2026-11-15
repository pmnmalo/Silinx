In short:

- **Following the owner's runs:** a viewer of a shared project sees the processes the owner runs: the same marks in its
  Processes, the run's lines in its console, the owner's Design Summary, and the reports the owner opens.

In detail:

- **The owner's runs (part 2 of #4002, core/collab-runs.js, web/js/collab-runs.js):** two more channels of the owner's
  activity. `runs` carries each process's mark, the console's lines of the run going on or of the last one (its last
  1000, at most 256 KB, sent at most once a second while it runs) and the Design Summary's data. `reports` carries the
  texts of the build's reports the owner has open (a report over 512 KB is left out, said when the viewer opens it).
  The owner's home folder and the ISE host it reaches over SSH are replaced in what is sent, as the MCP's
  `run_process` already does.
- **A viewer follows them (#4002):** its Processes show the owner's marks, its console the run's lines (each line
  once, from where it was), its Design Summary the owner's, and the report the owner has in front opens there with
  the same text. A follower's page now has the device database (Silinx's own data, not the server's), so the Design
  Summary names the board and shows the device's resources. The follower's own browsing is now told apart only once
  the followed project has opened, so the documents the project's opening opens no longer stop following.
- **MCP (#4002):** a project shared with `share_project` sends the runs `run_process` makes of it (each step's mark,
  the end of the log, the Design Summary), and `follow_project` gives the owner's runs (`ownerActivity.runs`, with
  their marks and the end of the log in its text).
