In short:

- **Programming the board from the browser:** Chrome's list of USB devices shows again at **Program FPGA**, Initialize
  Chain, the PROM's operations and the logic analyzer's capture, also when the click first implements the design; a
  board Windows' driver holds says how to give it WinUSB (Zadig), and Getting Started has a Windows section.

In detail:

- **The WebUSB chooser asked for at the click itself (#4593):** Chrome shows it only while the click's activation lasts,
  and the browser edition asked for the board after its awaits (the pins, the bitstream, the project's file,
  `getDevices()`, the implementation the click may run first): a `SecurityError`, no list. The click now asks for it
  before any await (`web/js/api-local.js` `usbPick`, the devices granted before kept from `getDevices()` and its connect /
  disconnect events; the device by the board and the file: `core/usb-program.js` `usbTarget`), and the job takes the
  board chosen. The browser's refusals in the console with the next step (`core/webusb-support.js` `usbError`: the list
  closed with no board, a list not shown); a board that cannot be opened, Adept's or an FTDI's (now `open()` too, Windows'
  "Access denied."), names WinUSB and Zadig (`WINUSB_HINT`). UI test `test/ui/webusb-gesture.test.js`, a `navigator.usb`
  that refuses the chooser after any await.
