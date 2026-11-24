In short:

- On Windows, the user's guide explains what to do when Zadig does not list the board: uninstall it first in
  Device Manager.

In detail:

- **A board Zadig does not list (#5472):** the user's guide's section *Programming the board from the browser on
  Windows* (EN, PT) says how to uninstall the board in Device Manager (its hidden devices too, the driver removed with
  it), plug it in again and give it WinUSB with Zadig, and that Adept then needs reinstalling. The console's WinUSB
  messages say it too (`core/webusb-support.js`), as the MCP server's `program_board` does.
