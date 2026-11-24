// Why the browser edition cannot program the board here (#1079, core/webusb-support.js): a browser with WebUSB can;
// an iPad or iPhone (any browser, Chrome too: Safari's engine) is told so, not to use Chrome or Edge; others are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { noWebUsb, appleTouchDevice, NO_WEBUSB, NO_WEBUSB_APPLE, WINUSB_HINT, WINUSB_GUIDE, needsWinUsb, ftdiInUse, usbError } from '../core/webusb-support.js';
import { slug } from '../scripts/build-docs-site.mjs';

// real browsers' navigators (the parts the rule reads)
const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadChrome: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  // an iPad's Safari or Chrome asking for the desktop site: it says it is a Mac
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const usb = { getDevices: async () => [] };

test('#1079 a browser with WebUSB can program the board: no reason', () => {
  assert.equal(noWebUsb({ userAgent: UA.winChrome, maxTouchPoints: 0, usb }), null);
  assert.equal(noWebUsb({ userAgent: UA.androidChrome, maxTouchPoints: 5, usb }), null);
});

test('#1079 an iPad or iPhone: no browser has WebUSB there, the message says so (not "Chrome or Edge")', () => {
  for (const [ua, touch] of [[UA.ipadChrome, 5], [UA.iphoneSafari, 5], [UA.ipadDesktop, 5]]) {
    assert.equal(appleTouchDevice({ userAgent: ua, maxTouchPoints: touch }), true, ua);
    assert.equal(noWebUsb({ userAgent: ua, maxTouchPoints: touch }), NO_WEBUSB_APPLE, ua);
  }
  assert.match(NO_WEBUSB_APPLE, /^an iPad or iPhone cannot program the board: every browser there, Chrome and Edge too, runs on Safari's engine, which has no WebUSB; program the downloaded \.bit from a computer/);
  assert.doesNotMatch(NO_WEBUSB_APPLE, /needs Chrome or Edge/);
});

test('#1079 a computer\'s browser without WebUSB (Firefox, Safari on a Mac, a page from a file): use Chrome or Edge', () => {
  for (const [ua, touch] of [[UA.linuxFirefox, 0], [UA.macSafari, 0], [UA.winChrome, 0], [UA.macSafari, undefined]]) {
    assert.equal(appleTouchDevice({ userAgent: ua, maxTouchPoints: touch }), false, ua);
    assert.equal(noWebUsb({ userAgent: ua, maxTouchPoints: touch }), NO_WEBUSB, ua);
  }
  assert.match(NO_WEBUSB, /^programming from the browser needs Chrome or Edge \(WebUSB\)/);
});

test('no navigator (Node), or one without a User-Agent: the general reason', () => {
  assert.equal(noWebUsb(undefined), NO_WEBUSB);
  assert.equal(noWebUsb({}), NO_WEBUSB);
  assert.equal(appleTouchDevice(undefined), false);
});

test('#4593 Windows: the board WebUSB cannot open, its driver Adept\'s or FTDI\'s: WinUSB with Zadig', () => {
  assert.equal(WINUSB_HINT, 'on Windows, Digilent Adept\'s or FTDI\'s driver holds the board unless it has the WinUSB driver: give it WinUSB with Zadig (zadig.akeo.ie) to program it from the browser (Adept then no longer sees it until its driver is put back; a board Zadig does not list: uninstall it first in Device Manager; the user\'s guide: Programming the board from the browser on Windows)');
  assert.equal(ftdiInUse('Access denied.'), `the board is in use (another program, or the operating system's FTDI driver: Access denied.); ${WINUSB_HINT}`);
});

test('#4593 the browser\'s refusals of the board: the chooser closed, no click, another error as it is', () => {
  const ex = (name, message) => Object.assign(new Error(message), { name });
  assert.equal(usbError(ex('NotFoundError', 'No device selected.')), 'no board chosen: connect the board\'s USB cable, switch it on and choose it in the browser\'s list (on Windows, a board missing from the list, in Chrome and in Edge, has Digilent Adept\'s or FTDI\'s driver: give it the WinUSB driver with Zadig, zadig.akeo.ie; a board Zadig does not list: uninstall it first in Device Manager; the user\'s guide: Programming the board from the browser on Windows)');
  const gesture = 'Failed to execute \'requestDevice\' on \'USB\': Must be handling a user gesture to show a permission request.';
  assert.equal(usbError(ex('SecurityError', gesture)), `the browser did not show its list of USB devices (${gesture}): it shows it only right after a click; click the button again`);
  // (a SecurityError of another kind, as a permissions policy's: its message as it is)
  assert.equal(usbError(ex('SecurityError', 'Access to the feature "usb" is disallowed by permissions policy.')), 'Access to the feature "usb" is disallowed by permissions policy.');
  assert.equal(usbError(ex('NetworkError', 'Unable to open device.')), 'Unable to open device.');
  assert.equal(usbError('odd'), 'odd');
});

test('#5459 the WinUSB lines: which errors send the user to the guide, and the guide\'s section in each language', () => {
  const ex = (name, message) => Object.assign(new Error(message), { name });
  assert.equal(needsWinUsb(WINUSB_HINT), true);
  assert.equal(needsWinUsb(ftdiInUse('Access denied.')), true);
  assert.equal(needsWinUsb(usbError(ex('NotFoundError', 'No device selected.'))), true);
  assert.equal(needsWinUsb(usbError(ex('NetworkError', 'Unable to open device.'))), false);
  assert.equal(needsWinUsb(NO_WEBUSB), false);
  assert.equal(needsWinUsb(undefined), false);
  // each anchor is a heading of that language's guide, as the site's pages make it
  assert.deepEqual(Object.keys(WINUSB_GUIDE), ['en', 'pt']);
  for (const [lang, url] of Object.entries(WINUSB_GUIDE)) {
    const m = url.match(/^https:\/\/pmnmalo\.github\.io\/Silinx\/docs\/(\w+)\/getting-started\.html#(.+)$/);
    assert.ok(m && m[1] === lang, url);
    const md = fs.readFileSync(new URL(`../docs/user/${lang}/getting-started.md`, import.meta.url), 'utf8');
    const headings = md.split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, '')));
    assert.ok(headings.includes(m[2]), `${lang}: #${m[2]}`);
  }
});
