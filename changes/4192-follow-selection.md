In short:

- **Live sharing: the owner's selection, seen by who follows them:** in every editor (the HDL, C and C++ text, the
  schematic, the state diagram, the ASM chart, the Petri net, the circuit, the Boolean algebra, the symbol), what the
  owner selects is shown at their followers' in the owner's colour, without changing the follower's own selection.

In detail:

- **A participant's selection in its view (#4192):** each participant's awareness view carries its selection
  (`core/collab-select.js`: a text editor's ranges, a drawing's objects as `kind:id`, a truth table's look), read as
  untrusted when it arrives and capped at 4 kB, its sending coalesced (at most one view every 250 ms, the last one
  always sent) so that a selection dragged or typed stays under the relay's awareness limit (#4173). A follower's
  page, while it follows the owner, marks the owner's selection in their presence colour (`web/js/editor-peer-sel.js`
  for the text editors, `web/js/collab-select-draw.js` for the drawings), cleared when they deselect or change
  document, while browsing alone and when the sharing ends; an object deleted meanwhile is not drawn. The MCP's
  `follow_project` gives the owner's selection with their view (`ownerView.sel`, and in its text).
