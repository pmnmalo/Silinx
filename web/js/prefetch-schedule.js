// When the browser edition downloads what Implement needs in the background (#967, #4628): never while the page and the
// project are loading. A project's opening (the one reopened at start-up too) asks for it; it starts once the page is
// loaded (its load event: the page interactive, its own 10 MB read), then a delay later (the project's documents restored,
// the user's first clicks; a part of it at random, so that a classroom's browsers, opened together, do not download
// together), then when the browser is idle (requestIdleCallback; a moment later where there is none: Safari). On a metered
// or slow connection (Save-Data, 2G/3G, a cellular one) it does not start: the first Implement downloads it, the console
// saying what, its size and its progress (web/js/open-flow-browser.js prepareBrowserFlow).
import { meteredConnection } from './asset-cache.js';

export const PREFETCH_DELAY = 15000;   // ms after the load event
export const PREFETCH_SPREAD = 30000;  // ms at most added at random

/** fn() run once the page is loaded, delay ms later, when the browser is idle; never on a metered connection. delay:
 *  globalThis.SILINX_PREPARE_DELAY (the tests'), else PREFETCH_DELAY and up to PREFETCH_SPREAD more. Returns its cancel. */
export function afterOpening(fn, { win = globalThis, delay = win.SILINX_PREPARE_DELAY ?? PREFETCH_DELAY + Math.random() * PREFETCH_SPREAD } = {}) {
  let stopped = false, timer = null;
  const idle = cb => (typeof win.requestIdleCallback === 'function' ? win.requestIdleCallback(cb, { timeout: 10000 }) : win.setTimeout(cb, 200));
  const go = () => idle(() => { if (!stopped && !meteredConnection(win.navigator)) fn(); });
  const loaded = () => { if (!stopped) timer = win.setTimeout(go, delay); };
  if (win.document?.readyState === 'complete' || !win.addEventListener) loaded();
  else win.addEventListener('load', loaded, { once: true });
  return () => { stopped = true; if (timer !== null) win.clearTimeout(timer); };
}
