In short:

- **Top-Level Source Type: chosen in Design Properties, and more of them.** Design Properties lets the Top-Level
  Source Type be changed (a setting: nothing is made) and no longer shows the Top Module row; Petri Net, Circuit, C
  and C++ are top types too, New Project starting the project with that top.

In detail:

- **The Top-Level Source Type (#4105):** its types in core/top-types.js, Petri Net, Circuit, C Function (HLS) and
  C++ Function (HLS) added; New Project makes the top of each (`createTopSource`: the drawing, or the function `top`);
  Design Properties' a choice, saved as ISE's property is, nothing made, the console saying it, undone by Undo Design
  Properties; its Top Module row gone (Set as Top Module chooses it). A design and simulation project's types are the
  drawings' (no HDL, no C / C++), in New Project and Design Properties. The MCP server's `set_design_properties` takes
  `top_source_type`, alone or with the rest, with the same choices and checks.
