In short:

- Remove Source's buttons show their labels on one line again.

In detail:

- **A dialog's buttons keep their labels on one line (#5748):** Remove from Project's question (#5720) is wider, its
  three buttons on one row in English and in Portuguese; any dialog's button keeps its label on one line, a row too wide
  for the window wrapping whole buttons (their labels wrapped and overflowed the buttons' fixed height in the Silinx
  interface). Tests: design-multi-select checks every button's label on one line and the buttons in one row (fails on
  the old code), in both interfaces and in Portuguese.
