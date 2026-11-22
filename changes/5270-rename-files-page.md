In detail:

- **Rename… in the Files view keeps the Files page (#5270):** since #5250, Rename brought the editor in front to the
  front again even when it was there already, and the Tasks layout took that for its task brought forward, showing the
  Design page with the Files tab still marked; an editor already in front is left as it is. The UI test of the Silinx
  import gate expects its line's right count since #5253 (its one source, no other file).
