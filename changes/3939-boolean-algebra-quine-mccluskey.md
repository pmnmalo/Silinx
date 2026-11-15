In short:

- **Boolean Algebra: up to 16 inputs, the Karnaugh map and Quine-McCluskey:** a truth table takes up to 16 inputs. Its
  results list the least gates and the least delay first, then the Karnaugh map's simplified function and a new
  Quine-McCluskey result, each in SOP or POS as clicked and each with its tick box. Quine-McCluskey can show its steps.
  The separate Minimal SOP and Minimal POS results are gone: they are what these two give.
- **A table's own notation:** the toolbar's ⋮ menu chooses the notation of a table's expressions. By default it is the
  one in Settings ▸ Boolean Notation.

In detail:

- **Truth tables of up to 16 inputs (#3939):** the editor, a module's table, the expression wizard, the handwritten
  equations, a state diagram's tables and a table edited live (it was cut to 8 inputs) take up to 16 inputs.
  - A table of more than 256 rows scrolls in a box of its own; only its rows in view are drawn.
  - A very long expression (a NAND form's of many inputs) is shown in part, with its number of literals.
  - The Karnaugh map is drawn up to 6 inputs. Past that the console says there is none, and the minimal SOP and POS are
    Quine-McCluskey's.
- **The results' order (#3939):** Least number of gates, Least delay, Karnaugh map, Quine-McCluskey, the canonical SOP
  and POS, then the XOR, NAND and NOR forms.
  - The Karnaugh map's result shows its minimal SOP or POS, whichever is clicked, and the map's groups follow.
  - The Minimal SOP and Minimal POS results are removed. The forms `sop` and `pos` stay, named Karnaugh map SOP / POS.
- **Quine-McCluskey (#3939, `core/qm.js`):** the prime implicants by combining the implicants column by column, the
  chart, the essential primes, then the cover of the rest by branch and bound (Petrick's method's minimum).
  - It is bounded by work, never by time, so the same table always gives the same module. Past 20 000 implicants it
    uses a cover heuristic: each minterm left grown into a prime, then the redundant terms dropped.
  - A result not proven minimal is a console warning. So is a Karnaugh map search that was cut short (it was a note
    in the results).
  - Its steps, when ticked: the columns (✓ on those combined), the chart (× and the essential primes ✱), the essential
    prime implicants and the cover. A table too large for its steps shows its count of primes only.
  - Its tick box sets the new forms `qsop` / `qpos` in the HDL module and the schematic.
  - Tested: every 3-input function with don't cares and random 4-input ones against a brute-force reference; up to 6
    inputs as costly as the Karnaugh map's minimisation; random and structured functions of up to 16 inputs equal to
    their table, each term prime.
- **A table's own notation (#3939):** the ⋮ menu's Notation is "As in the Settings" by default, else one of the five,
  saved with the table (`notation`). The results' own notation menu is removed.
- **MCP (#3939):** `related_view`'s results list the Karnaugh map's SOP and POS (up to 6 inputs) and Quine-McCluskey's,
  with their prime implicants, the essential ones, whether proven minimal and the steps' columns. `set_output_logic`
  takes `qsop` and `qpos`. `set_notation` with a table's project and path reads, sets or clears (`settings`) its own
  notation, which `related_view` and `set_output_logic` use.
