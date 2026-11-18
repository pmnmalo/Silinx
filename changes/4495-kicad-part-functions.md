In short:

- **What a KiCad part is:** the circuit editor's Parts panel shows what each part of the KiCad catalogue (and a
  project's own KiCad parts) is next to its number: "4049 Hex inverting buffer", "74LS123 Dual retriggerable
  monostable". Typing "inverter", "flip-flop" or "multiplexer" finds them, and in Portuguese the functions are
  translated ("Dois monoestáveis redisparáveis").

In detail:

- **What a KiCad part is (#4495):** a part that behaves as an IC of Silinx's library shows that IC's title. Any other
  shows its KiCad symbol's Description shortened to its function by one rule (`core/part-function.js` `shortFunction`:
  packages, ratings, families and notes left out, a sentence's case). Only the functions are kept, in
  `core/kicad-catalogue-functions.js`, which `scripts/kicad-catalogue.mjs` writes. The search finds a part by its
  function, its case and accents aside. In Portuguese the functions are translated by a small vocabulary of the logic
  ICs' words, applied by rule (`functionPt`); it agrees with the interface's own translations of Silinx's ICs' titles,
  and a function with a word outside it stays in English. The MCP's `part_libraries` with `catalogue` and
  `circuit_parts` return the function, and `circuit_parts` takes a `query`.
