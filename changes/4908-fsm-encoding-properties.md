In short:

- **A state diagram's encoding is in its Properties, and you can choose each state's code:** the Encoding moved from
  the ⋮ menu to the machine's Properties, with a new User-defined encoding. Type a state's code in its Properties and
  the encoding becomes User-defined.

In detail:

- **The encoding in the machine's Properties (#4908):** the state diagram's Encoding (binary, Gray, one-hot,
  enumerated) is a field of the machine's Properties and no longer a choice of the ⋮ menu; the status line still
  shows it. The module name stays in the Properties.
- **A code of the user's for each state (#4908):** a new User-defined encoding (`encoding: 'user'`) takes each state's
  code from the state (`code`, binary digits; blanks and `_` left out, `core/fsm-codes.js`). A state's Properties show
  its code in every encoding but the enumerated one. Typing a code makes the encoding User-defined, and the other
  states keep the codes they had; choosing User-defined does the same. Check reports an error for a state with no
  code, a code that is not binary digits, more than 32 bits, codes of different widths and a code used twice. The HDL
  writes the codes as given, and the encoded table and Create Boolean Algebra use them, the unused codes as don't
  cares. The MCP's new `set_fsm_encoding` sets the encoding and the states' codes, with the same checks.
