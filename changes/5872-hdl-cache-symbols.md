In short:

- A module's symbol follows its drawing: when a drawing replaced on disk changes its module's ports, its symbol
  (`<module>.sym.json`) is put in step and the schematics' instances of it are flagged out of date in the console.

In detail:

- **A module's symbol kept in step with its interface (#5872, part 3):** a symbol file records the hash of the
  module's ports it was last put in step with (`interface`: their names, directions and widths, `core/symbol-sync.js`).
  When the drawings' check (part 2) makes a module's HDL again, or finds a symbol whose module's ports changed, the
  symbol's pins follow (the new ports on their default side, the gone ones dropped; its layout kept), said in the
  console; a symbol of before is stamped quietly. The schematics' instances of a module made again that are out of
  date are flagged ("Update Symbol (its right-click menu) or update_symbols updates them, their wires kept"), in the
  interface and in the MCP's flows alike; Portuguese translations.
