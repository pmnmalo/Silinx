In short:

- **No HDL in a design and simulation project's Symbol Info and tab menus.** A schematic symbol's Symbol Info has no
  Equivalent HDL there, and a document's tab menu (and View) no Show VHDL / Verilog Beside: its drawings' other views
  are kept.

In detail:

- **A design and simulation project without HDL, part 1 (#3891):** the Symbol Info dialog (web/js/symbol-info.js)
  leaves out its Equivalent HDL section and the HDL in its parameters' note in a design project (the page's kind flag,
  web/js/project-kind-flag.js); the related views of a document (web/js/related-views.js, its tab's menu and View's
  Show … Beside) leave out a file of the HDL side, a translation and a C source's views. The MCP server already refused
  them there (`read_file` of a drawing's HDL, `related_view` translation).
