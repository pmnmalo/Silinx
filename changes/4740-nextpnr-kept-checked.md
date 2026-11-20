In detail:

- **The open families' nextpnr kept in the configuration folder is checked before it runs (#4740):** the package's
  tarball is kept with its files and checked against package-lock.json's SHA-512 at the first load of each run, then
  every file against the tarball's; a file changed or missing is written again from the tarball (said in the log), a
  tarball changed or missing (a folder kept by an earlier version of Silinx) downloaded again.
