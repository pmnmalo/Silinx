In short:

- **Phones:** documents open read only on a phone, with "Read-only on a phone" at the end of their toolbar: read,
  zoom, try them out and simulate there; edit on a tablet or a computer.

In detail:

- A phone's editors, the third phase of #5121 (#5229): under 600 px every editor opens read only, as a followed
  project's (`web/js/phone-readonly.js`): the HDL, C and constraints text, the schematic, the state diagram, the ASM
  chart, the Petri net, the truth table, the circuit, the System, the Symbol Editor. The read-only notice "Read-only on
  a phone" sits at the right end of the toolbar, its tip saying where to edit; the editing tools are hidden, the view
  and Try it kept. A followed project's, a generated file's or a newer Silinx's notice comes first. Opened again on a
  wider screen, the document edits. UI tests at 375 × 812 and 430 × 932 with touch on the lock example, in both
  interfaces and in Portuguese (`test/ui/phone-readonly.test.js`).
