In short:

- **The FSM Wizard's sequence detector takes a regular expression:** besides a bit string such as 1011, the pattern may
  be a regular expression over 0 and 1, such as `1(01)*1`, `10+1`, `1[01]1` or `110|101`; the wizard draws its
  detector, overlapping or not, Moore or Mealy, and says why a pattern is refused.

In detail:

- **Sequence detector from a regular expression (#4902):** the FSM Wizard's *Sequence detector* template accepts a
  regular expression over 0 and 1: `|`, `( )`, `*`, `+`, `?`, `.` or `[01]` for any bit, `{n}`, `{n,}`, `{n,m}`. The
  detector is built the textbook way (`core/regex-automata.js`, `core/seq-detector.js`): Thompson's NFA, the subset
  construction of the DFA of `.*R` (z = 1 when the bits read end with a match), a Moore or a Mealy machine, minimised by
  partition refinement, its states numbered breadth-first. Overlapping, the search goes on after a match; not
  overlapping, it starts again after the match's last bit. A bit string gives the same diagram as before. The wizard
  refuses, with the position, a syntax error, a pattern that matches nothing or matches the empty string, and a detector
  of more than 64 states. The MCP server's `new_source` makes a state diagram from the FSM Wizard's templates too
  (`template`, `template_params`), the detector of a regular expression among them.
