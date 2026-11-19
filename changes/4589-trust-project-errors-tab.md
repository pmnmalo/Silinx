In short:

- **Trust Project in the Errors tab:** an imported project's refusal (programming the board or the PROM, Xilinx ISE,
  AMD Vivado) has its Trust Project button in the Errors tab too, the tab the error brings to the front.

In detail:

- **The Errors tab's refusals carry the Trust Project button (#4589):** #4583 gave it to the Console tab's lines only,
  but an error brings the Errors tab to the front; there, each refusal for an untrusted project has the button (asked
  first), disabled once the project is trusted.
