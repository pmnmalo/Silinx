In detail:

- **Every engine behind the System's node contract (part of #5485):** the compiled engine, the event-driven simulator,
  the AVR, the circuit and the terminal each have their factory (`compiledContract`, `eventContract`, `avrContract`,
  `circuitContract`, `terminalContract`) and their fidelity notes (what each models, approximates and leaves out, for
  #5499); `adapterPorts` (an adapter's pins as typed ports, at its board's level: the AVR's 5 V); `NodeEngine`, a node of
  the contract only (a stimulus, the PIC24's `Pic24Node`) in the scheduler, which bounds its windows by a node's
  lookahead too; `ContractNode` runs an engine that ends a run past t1 from there (its next inputs at its time, saved so,
  the replay the same) and tells an adapter's own `run` (the AVR's) from the contract's; `core/system-build.js` takes its
  wires' latencies from the link kinds' lookahead (the same). The System's runs unchanged: the uart-avr example's 30 ms,
  its report and every link's trace, byte for byte as before. Tests: system-contract-engines (every engine against the
  contract: run in windows, restored mid-run giving the same run, no warnings; a contract node in the scheduler, the
  same bytes as the adapter's; a node's lookahead).
