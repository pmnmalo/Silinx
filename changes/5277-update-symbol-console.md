In short:

- **Update Symbol says what it did in the console:** a pin left unconnected by the update is a warning there
  (`WARNING: top.sch.json: Symbol updated; not connected any more: …`), no longer a note flashed on the canvas.

In detail:

- **Update Symbol's message in the console (#5277):** Update Symbol and Update All of an instance's Properties, and
  Update Symbol of its right-click menu, write their result to the console through the editor's messages (a warning
  when a removed or turned pin's wire is left unconnected, a plain line when every connection is kept), in the
  page's language, instead of the canvas's hint; the text is core's `symbolUpdateNote`, the MCP's `update_symbols`
  says the same.
