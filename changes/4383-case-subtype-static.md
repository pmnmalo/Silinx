In short:

- **Verilog to VHDL:** a case on a concatenation translates to VHDL that ISE accepts (`case case2_t'(a & b) is`, with
  its subtype declared); Check Syntax warns of a VHDL case whose selector's subtype is not locally static, which XST
  refuses.

In detail:

- **A VHDL case's selector of a subtype not locally static (#4383):** the Verilog-to-VHDL translator wrote a
  `case ({a, b})` as `case std_logic_vector'(a & b) is`, which XST refuses (HDLCompiler:803); it now qualifies a
  concatenation's or a signed vector's selector by a subtype of its width declared in the architecture, as #4380 did
  for the circuit ICs. The VHDL front end warns of such a case (a concatenation, or a conversion or qualification by
  an unconstrained type mark), naming HDLCompiler:803; the simulation is unchanged.
