In short:

- **ASM charts: a register's width from the generics:** a register's width can be an expression of the chart's
  generics, such as `clog2(DEBOUNCE)` or `N + 1`; the generated VHDL and Verilog keep it (with a `clog2` constant
  function, which XST accepts), and the blinky example's debounce counters use it.

In detail:

- **An ASM chart's register width given by an expression of its generics (#4378):** the Properties panel's width of a
  register takes a number or an expression (integers, generics, `+ - * /`, parentheses, `clog2(n)`: the bits that
  count 0 to n-1, at least 1), and so does the chart's file (`core/asm-width.js`). The Check reports an expression that
  is not valid, names a generic the chart does not have (with the right spelling when only the letter case differs),
  divides by 0 or goes negative, or whose value at the generics' default values is not 1..256. Such a register meets,
  in `+ - & | ^ ~ << >>`, only constants and values of its own width (any other may be wider or narrower at the
  values the module is given: the Check says so), a case box tests a slice of it, a copy, a comparison or a slice of it
  meets any width. The generated VHDL declares `std_logic_vector(clog2(DEBOUNCE) - 1 downto 0)` and sizes its
  literals and resizes with the expression; the Verilog `reg [clog2(DEBOUNCE)-1:0]`; both declare the `clog2`
  function when a width calls it (XST has no `$clog2`), and both simulate as a reference at several generics' values.
  The chart's simulator (Try it, `simulate_drawing`) takes the widths at the generics' default values. The chart made
  from HDL keeps the expression, from the generator's header, the previous chart, or a hand-written declaration
  (`[clog2(N + 1)-1:0]`, with a `clog2` function). The MCP server's `write_file`, `check_drawing` and
  `simulate_drawing` take such a chart. Blinky's `speed_ctrl` chart sizes its debounce counters `clog2(DEBOUNCE)`
  (2 bits at DEBOUNCE = 3, as before).
