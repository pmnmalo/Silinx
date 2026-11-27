In short:

- **A System document saved over another's change:** the System editor's Save no longer writes over a System that
  `edit_system` or another tab changed meanwhile: it says so in the console, and a second Save keeps your version.

In detail:

- **A precondition on a file's writes (#5915, the architecture audit #5902):** a write may carry the tag of the text
  its writer read (`core/text-tag.js`; the route's `If-Match`): the local server and the browser edition's stores write
  over that text only, else refuse (412) with the text now's tag. The System editor's Save and the MCP's `edit_system`
  use it for the `.sys.json`, so neither overwrites the other's change silently; the refusal is said in the console
  (Portuguese too) and by the tool, and the editor's document stays to save.
