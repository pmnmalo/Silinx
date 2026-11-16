In detail:

- **Import KiCad Part…: a PCM .zip or a .kicad_symdir folder listed once (#4307):** when the file input fired twice,
  both reads listed the package's libraries, so each one appeared twice. The table is now cleared once the read is
  done, for the last pick only.
