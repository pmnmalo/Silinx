In detail:

- **An architecture's declaration with its entity's name is an error (#5360):** a signal, constant, type, function,
  file or alias of an architecture with the name of one of its entity's generics, ports or declarations, in any case,
  is reported as XST's HDLParsers:1202 (an entity and its architecture are one declarative region), at the
  declaration's line: by src/vhdl/parser.js for an entity of the same file, by buildLibrary for one of another file
  (src/vhdl/labels.js declarationErrors). A block's declarations are not the architecture's.
