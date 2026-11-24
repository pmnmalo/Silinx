// Silinx - why the browser edition cannot program the board here (#1079): programming goes through WebUSB, which
// Chrome and Edge have on a computer and on Android, from a page opened from https:// or http://localhost. An iPad
// or an iPhone has it in no browser: there every browser, Chrome and Edge too, runs on Safari's engine (WebKit),
// so its message does not send the user to a browser they already have. An iPad may say it is a Mac: a Mac with
// a touch screen.
//
// Isomorphic ES module (browser + Node), no DOM.

export const NO_WEBUSB = 'programming from the browser needs Chrome or Edge (WebUSB), with the page opened from https:// or http://localhost (not from a file); or program the downloaded .bit with the full Silinx application, Digilent Adept or iMPACT';
export const NO_WEBUSB_APPLE = 'an iPad or iPhone cannot program the board: every browser there, Chrome and Edge too, runs on Safari\'s engine, which has no WebUSB; program the downloaded .bit from a computer (Chrome or Edge, the full Silinx application, Digilent Adept or iMPACT) or from an Android tablet in Chrome';

/** Whether the device is an iPad or an iPhone (an iPad that says it is a Mac: a touch screen). `nav`: the navigator. */
export function appleTouchDevice(nav = globalThis.navigator) {
  const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
}

/** Why the board cannot be programmed from this browser, or null when it has WebUSB. */
export function noWebUsb(nav = globalThis.navigator) {
  if (nav?.usb) return null;
  return appleTouchDevice(nav) ? NO_WEBUSB_APPLE : NO_WEBUSB;
}

/** What to do when the board cannot be opened on Windows (#4593): WebUSB opens only a device whose driver is WinUSB, and
 *  Digilent Adept's (installed with Adept, ISE or Vivado) or FTDI's driver holds the board. */
export const WINUSB_HINT = 'on Windows, Digilent Adept\'s or FTDI\'s driver holds the board unless it has the WinUSB driver: give it WinUSB with Zadig (zadig.akeo.ie) to program it from the browser (Adept then no longer sees it until its driver is put back; a board Zadig does not list: uninstall it first in Device Manager; the user\'s guide: Programming the board from the browser on Windows)';
/** That section of the user's guide on the site, in each language (#5459): the console's button on a line that names
 *  WinUSB opens it. */
export const WINUSB_GUIDE = {
  en: 'https://pmnmalo.github.io/Silinx/docs/en/getting-started.html#programming-the-board-from-the-browser-on-windows',
  pt: 'https://pmnmalo.github.io/Silinx/docs/pt/getting-started.html#programar-a-placa-a-partir-do-browser-no-windows',
};
/** Whether an error's text sends the user to the WinUSB driver (#5459). */
export const needsWinUsb = text => /\bWinUSB\b/.test(String(text));
/** An FTDI board that could not be opened or claimed: its message. */
export const ftdiInUse = msg => `the board is in use (another program, or the operating system's FTDI driver: ${msg}); ${WINUSB_HINT}`;
/** The browser's refusal to give the page the board (requestDevice's, getDevices'), with what to do next (#4593): `e` the
 *  DOMException. */
export function usbError(e) {
  if (e?.name === 'NotFoundError') return 'no board chosen: connect the board\'s USB cable, switch it on and choose it in the browser\'s list (on Windows, a board missing from the list, in Chrome and in Edge, has Digilent Adept\'s or FTDI\'s driver: give it the WinUSB driver with Zadig, zadig.akeo.ie; a board Zadig does not list: uninstall it first in Device Manager; the user\'s guide: Programming the board from the browser on Windows)';
  if (e?.name === 'SecurityError' && /gesture|activation/i.test(e.message)) return `the browser did not show its list of USB devices (${e.message}): it shows it only right after a click; click the button again`;
  return e?.message || String(e);
}
