In short:

- **A failed programming says its error once:** Program FPGA, the PROM's operations, Initialize Chain and an open
  family's Program say why they failed in one line ("… failed: …"), in the Console and in the Errors tab.

In detail:

- **A job's error said once (#4597):** a failed job's last line, its error ("ERROR: …", the server's and the browser
  edition's jobs), is no longer shown before the operation's "… failed: <error>" line that says it again
  (`web/js/job-log.js`, in iMPACT's operations and an open family's Program); its other lines are shown as before.
