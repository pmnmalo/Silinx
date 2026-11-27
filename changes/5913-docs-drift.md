In detail:

- **Docs and comments that contradicted the code (#5913, part 1):** docs/PROJECT.md names Fast (Speed 1) as a new
  project's Optimization; core/system-doc.js's header the System document's version 2; docs/ARCHITECTURE.md the PIC24's
  emulator as Silinx's own package (no longer "possible"), the scheduler's host `system-host.js`; core/system-sim.js's
  header an ESP32 node's SharedArrayBuffer; the circuit node's fidelity notes its analog parts solved (#5382) and a
  digital net's levels only. A test checks each against the code (test/docs-drift.test.js). docs/SYSTEMS.md's part
  follows once the pull requests that change it are merged.
