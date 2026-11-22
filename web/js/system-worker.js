// Web Worker: a co-design System's run (#4701), off the page's thread and where the compiled engine may make its code:
// core/system-host.js hostSystemRun on the worker's port; web/js/system-remote.js starts it (from this file on the local
// server, from its embedded text in the browser edition) and drives it. A worker has no import map: avr8js is given to
// the AVR's adapter here (core/system-sim-avr.js), from the path the server serves it at (the browser edition bundles it).
import * as avr8js from '/vendor/npm/avr8js/dist/esm/index.js';
import { hostSystemRun } from '/core/system-host.js';

globalThis.SILINX_AVR8JS = avr8js;
hostSystemRun(self);
