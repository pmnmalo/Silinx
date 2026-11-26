In detail:

- **The monthly Pins workflow follows every source pinned outside npm (#5649):** a pin is declared once, next to the
  code that uses it (a module's `export const PINNED`, a shell script's, a Dockerfile's or a workflow's
  `# pinned: {…}` comment whose regular expression reads the value from the same file), as one of four generic kinds:
  a repository's tag (against its latest tag of the same shape, within a series, its commit checked when pinned), a
  commit (against its branch's head, or only when given paths changed; read from another repository's file), a
  download's SHA-256, or reported only. Declared: the KiCad catalogue's libraries (SparkFun's, the Arduino modules',
  KiCad's own symbols and footprints within KiCad 9, two files' SHA-256), the ported prjxray, prjxray-db and Apicula,
  Digilent's master XDCs, adepttool, the Silinx commit nextpnr-spartan's Spartan-3E and Spartan-6 chip databases are
  built from (its SILINX_REF, behind when their devices, research scripts or timing changed), and, reported, the
  Docker images' Ubuntu bases, XC16's and Vitis HLS's images. CLAUDE.md: a new pin outside npm is declared so the
  workflow follows it. Tests: check-pins (each kind behind and current, the wrong commit of a tag, a changed SHA-256,
  a network error, the declarations read and their errors, the issue's text).
