In detail:

- **A new error of a source the console's filter hides (#5074):** since the Errors / Warnings tabs follow the filter
  (#4749), an error of another source (the Board Emulator's while editing) brought no tab forward; now it turns the
  filter to its source, as a process started does (#1852), and its tab comes forward listing it. The entries are
  counted all, the hidden ones too, so a filter's change still brings no tab forward.
