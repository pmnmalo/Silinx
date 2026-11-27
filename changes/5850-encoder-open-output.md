In short:

- **Schematics:** an ENCODER whose V is left open, or a DECODER with outputs left open, no longer brings Check
  Syntax's warning of a signal assigned and never used.

In detail:

- **An encoder's or a decoder's output left open (#5850):** its block's HDL assigns nothing to it (once a signal of
  its own, an OR of the encoder's inputs for V, never read); the outputs connected are as before.
