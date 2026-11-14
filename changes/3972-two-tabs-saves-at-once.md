In detail:

- **The two tabs' saves at once (#3972):** a page's request that changes a project waits, for 2 s at most, until
  another page's request on that project has ended and what it changed has been read; so each tab's changes are told
  to the other, and both show the file as it is on disk (before, two requests at once were told to neither).
