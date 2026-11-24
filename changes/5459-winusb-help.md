In short:

- On Windows, a board missing from Chrome's or Edge's list of USB devices, or one they cannot open, now says what to
  do: its error in the console has a **Help: The Board on Windows** button that opens the user's guide on the WinUSB
  driver (Zadig), for every board the browser programs.

In detail:

- **The WinUSB help where the student needs it (#5459):** the console's error lines that send the user to the WinUSB
  driver (`core/webusb-support.js` `needsWinUsb`: the board that cannot be opened, Digilent's or FTDI's, and the
  browser's list closed with no board) get a **Help: The Board on Windows** button that opens the user's guide's
  section *Programming the board from the browser on Windows* in the interface's language (`WINUSB_GUIDE`). The *no
  board chosen* message says the board missing from the list, in Chrome and in Edge, has Digilent Adept's or FTDI's
  driver, and names Zadig and the guide's section, as the MCP server's `program_board` says it too. The guide (EN, PT)
  describes both symptoms, how to see in Device Manager which driver has the board, and, for teachers and lab
  administrators, Zadig's administrator rights and one driver per room.
