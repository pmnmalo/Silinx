In short:

- **The breadboard example builds with ISE again:** a circuit's 74194, 7476, 74112, 7447, 7448 and 74151 no longer stop
  XST with "Subtype of case expression is not locally static".

In detail:

- **A circuit IC's case on a concatenation, qualified by a subtype of its width (#4380):** the ICs' VHDL (the digital
  architecture and the simulation's model) wrote `case std_logic_vector'(s1 & s0) is`, whose subtype is not locally
  static, as VHDL wants of a case's expression (XST's HDLCompiler:803, on the breadboard example in the ISE nightly);
  now `case slv2'(s1 & s0) is`, its `subtype slv2 is std_logic_vector(1 downto 0)` declared in the architecture. The
  breadboard example's HDL regenerated.
