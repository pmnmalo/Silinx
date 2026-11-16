In short:

- **Browse KiCad Libraries…:** the circuit editor's Parts panel lists KiCad's own 74xx and 4xxx symbol libraries and
  the KiCad Plugin and Content Manager's library packages (SparkFun's among them), with each one's licence. It imports
  a library into the project: its 74LS00, 74HC00, CD4011… behave as Silinx's ICs. A PCM package's `.zip` and a
  `.kicad_symdir` folder can be imported too.

In detail:

- **KiCad's libraries fetched by the local server (#4285, #4278):** the PCM's official index and its library packages,
  and KiCad 9.0.0's 74xx and 4xxx symbol libraries (`core/kicad-pcm.js`, `server/kicad-libraries.js`). They come from
  an allowed list of hosts only, over HTTPS, with each redirect checked and the size limited. A package is read only
  once its SHA-256 is the index's (KiCad's own libraries: one pinned). Only a zip's `symbols/` and `footprints/` are
  inflated, with no path out of it. They are kept in the configuration folder for offline use, and the index is fetched
  again after a day.
- **Browse KiCad Libraries… (#4285):** a dialog of the Parts panel, on the local server only. It searches the libraries
  and shows each one's version, licence and size. A library picked shows what its symbol libraries hold; those ticked
  are imported with the footprints their symbols name and their source, author and licence. Replacing files asks first.
- **Import KiCad Part… takes a PCM package's `.zip` and a `.kicad_symdir` folder (#4285).**
- **MCP (#4285):** `part_libraries` (the libraries, a search, what one holds); `import_part` with `library`, a `.zip` or
  a `.kicad_symdir` folder, and `libraries` to choose.
- **A 3-state output fits a library IC's output (#4285):** the 74595's in KiCad's libraries (`tri_state`) now behave as
  Silinx's 74595. A footprint named `PCM_<library>:<name>`, as the PCM's installed libraries are, is found in
  `parts/<library>.pretty/`.
