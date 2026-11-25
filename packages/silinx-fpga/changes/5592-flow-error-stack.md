In detail:

- **An unexpected error of the flow said with its type and its stack's first frames (part of #5592):** its line
  (`ERROR:Silinx - …`) and the run's error give its type when it is not a plain Error (Firefox's InternalError, a
  TypeError…), its message and its stack's top 8 frames. Before, the stack's first line was left out as V8's message
  line, which in Firefox and WebKit is the frame that threw (open-flow-core.js errorText). Tests: flow-ide (V8's,
  Firefox's and WebKit's stacks; the flow's line of an InternalError).
