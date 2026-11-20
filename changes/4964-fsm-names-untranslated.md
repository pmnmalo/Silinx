In short:

- **A state diagram in Portuguese:** a signal or a state named as a word of the interface (`up`, `enable`, `clock`,
  `Counter`) keeps its name in the tables, Try it and Properties; `up` is no longer shown as "crescente".

In detail:

- **Signals' and states' names never translated (#4964):** the interface's translator rewrote every text equal to one of
  its labels, and the state diagram's tables (the transition table's states, conditions and outputs, the state table's
  states, the encoded table's headers and notes), its Try it (the state, the outputs, the trace, shared with the ASM
  chart's), a transition's condition in Properties and the ASM chart's Initial state and Try it state hold only the user's
  names: they are now marked `data-no-i18n`. A UI test, in Portuguese, on a machine whose names are words of the
  dictionary.
