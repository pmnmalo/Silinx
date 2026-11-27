In short:

- Translate to Verilog takes the VHDL a schematic's ADD or SUB with a carry in generates (its carry
  `unsigned'(0 => CI)`), and aggregates with named choices of single bits in general (#5853).

In detail:

- Translate to Verilog: an aggregate with named choices of single bits, signals as well as literals, becomes a
  concatenation, of the target's width with `others` or of its choices' own range without (`(0 => ci)`, `(3 => x,
  others => '0')`, `(3 => '1', 2 downto 0 => x)`); `signed'(0 => x)` a signed bit. What a concatenation cannot express
  is refused with its reason: a value of more than one bit, a bit not given, a choice out of the range, a choice not
  constant (#5853).
- Translate to VHDL: `$signed` of a single bit is `signed'(0 => a)`, not a conversion of an aggregate, which is not
  VHDL (#5853).
