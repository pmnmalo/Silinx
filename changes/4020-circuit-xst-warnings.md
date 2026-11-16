In short:

- **A digital circuit with a chip's output left unwired builds with ISE without warnings:** XST's warnings on that
  open output and on the flip-flops behind it are left out of the run, and the console says how many.

In detail:

- **XST's warnings on a circuit's chips left out (#4020):** a circuit on the FPGA instances each MSI or sequential chip
  with its unread outputs open, and XST warns on them (Xst:753) and on the flip-flops behind them (Xst:2677). The ISE
  run (and the MCP's run_process) leaves those two messages out when they are on a circuit's chips, found by their
  names in the circuit's generated HDL (core/circuit-xst.js); any other instance's still warn. The console says how
  many were left out (`INFO:Silinx - … warning(s) of XST left out`), and the synthesis report's count of warnings is
  without them.
