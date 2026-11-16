In detail:

- **A Silinx property set on a KiCad symbol written on one line (#4297):** its new property took the whole text before
  it on that line as its indent, writing the symbol's beginning twice, and the library could not be read again
  (`a "(" not closed`). It now takes the line's leading white space only.
