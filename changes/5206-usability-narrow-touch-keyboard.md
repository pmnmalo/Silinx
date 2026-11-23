In detail:

- **Usability tests of a narrow screen, touch and the keyboard (#5206, its sixth and last phase):**
  `test/usability/phone.test.js` has a person's sessions on a phone's screen (390 × 844, touch). The uart example's
  module is opened by a double tap on its Design row and is read only there (a tap and a key change nothing); its
  bench is simulated (the Silinx interface's Simulate, the ISE style's More tools ▸ Simulate) and its waves read by
  touch (a tap places the cursor, a pinch zooms, two fingers scroll the time), the values at the cursor the reference
  simulator's; its board is emulated (Engine ▸ Compiled from the toolbar's menu, a line typed in the Serial terminal,
  BTN0 tapped on the strip under the board), the terminal, the LEDs and the display the design's simulation's. The
  lock example's schematic, state diagram, ASM chart and Petri net are each opened by a double tap, panned by two
  fingers and zoomed by a pinch, and a finger dragged on them changes nothing.
- `test/usability/tablet.test.js` works on a tablet in portrait (820 × 1180, touch, narrower than 1024 px): the
  traffic example's state diagram opened from the ISE style's drawer (behind the header's ☰) or the Silinx interface's
  side panel, two states dragged by a finger, the view panned and pinched, a state renamed in Properties (behind the
  editor's ☰ Properties, over the canvas), Check tapped, the toolbar's Undo tapped back to the start and Redo to the
  end, the diagram's check and its HDL in VHDL and Verilog sound after every step; and the stopwatch on the Board
  Emulator by taps (its ☰ Properties, the board's buttons: started, stopped with its time kept, cleared).
- `test/usability/keyboard.test.js` is a session with no mouse: the counter typed in its empty file opened from the
  Design tree (↓, Enter), Check Syntax from the Process menu (the ISE style's menu bar by F10, the Silinx interface's
  command palette by Ctrl+K), the mistake fixed by the arrows, Edit ▸ Undo to the start and Redo; the traffic's state
  diagram zoomed by its keys, a state renamed and a condition edited in its transition table (Tab, Enter), Check, Undo
  and Redo; the gates' bench simulated and its waves read by the keys (a row, its changes, zoom, a marker, the full
  view), the values at the cursor the reference simulator's. The console's lines are checked exactly at every step,
  in both interfaces and in Portuguese, about 1.5 minutes a configuration for the three files.
- New helpers: `lib/touch-actions.js` (a tap, a double tap, a finger held, one finger dragged, two fingers panning or
  pinching, the phone's panes and More tools) and `lib/key-actions.js` (Tab to a control, the Design tree by the
  arrows, the menus by the keyboard, the command palette), with their tests in `test/usability-lib.test.js`.
- The bugs found are todos: #5299 (Emulate on a tablet in portrait, the Silinx interface: an empty page with nothing to
  start the emulator, its side panel folded) and #5300 (a file opened from the command palette does not get the
  keyboard's focus).
