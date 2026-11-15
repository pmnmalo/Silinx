In detail:

- **The paths a project's lists name, checked as the file routes' (#4182):** a hidden file or folder that a project's
  `silinx.json` lists (`.git/config`) is never built nor copied into `build/src/` (an error naming it), nor a test bench
  of the simulation models, nor a file an exercise reads beside it (one of its problems); Vivado's constraints file is
  one of the project's (inside its folder, no hidden one); Sync with the .xise leaves out a hidden file and
  `silinx.json` as an import does.
- **A bitstream named by its absolute path (#4182):** resolved once as the system resolves it (its links, then its
  `..`), and that path is the one its project's trust is checked on and the one programmed.
- **Delete Project (#4182):** deletes a project's folder only, one with its `silinx.json` (a 404 for another folder of
  the workspace, as for none).
- **Vivado's settings script (#4182):** checked again when the ssh build folder changes, as ISE's.
