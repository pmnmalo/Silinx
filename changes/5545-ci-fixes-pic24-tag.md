In short:

- **Sharing with editors:** an editor let in just as the owner's connection was lost can edit once the owner is back;
  the room no longer refuses their changes.

In detail:

- **The owner's list of its editors given to the room again when it resumes (#5545):** a list the owner published as
  its connection was being lost never reached the room, which then refused that editor's edits after the resume
  (core/collab-client.js: the last list sent again with the resume's answer, before any frame; a list the room has
  already is left). Test: collab-resume (the connection cut as the list is sent: the editor's change reaches the
  owner, no error), which also fixes the test's flake on Windows.
- **The CI's failures on main and on the silinx-pic24-v0.2.0 tag (#5538, #5539, #5540, #5542, #5543, #5544, #5546,
  #5547, #5548, #5549, #5560):** the Portuguese of the System's two browser-edition messages (a node's Implement, a
  node's firmware) and the i18n test's examples of the CPU node's badge and the Explorer 16/32's LEDs; the Adept test's
  Windows message from WINUSB_HINT (#5472 lengthened it); the Board Emulator's layouts test importing its module by
  a file URL (an absolute path is no module URL on Windows); reactive-c's and reactive-py's outputs split on Windows's
  `\r\n`; the Technology Schematic UI test with pong's 1070 cells in 22 blocks (#4877 changed pong); the unused-exports
  scan leaving another test's hidden temporary folder (test/.tmp-*), which may go while it reads. The Design pane's
  grouping by node (#5540, #5542) was fixed by 49e32595c.
