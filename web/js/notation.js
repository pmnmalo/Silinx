// The notation of the Boolean expressions Silinx shows (#3915): the viewer's preference (Settings ▸ Boolean Notation),
// kept in the browser with the language and the theme; Electronics / Engineering (a̅·b + c) when none is set. The
// views that show expressions (the truth table's results and K-map groups, the state diagram's tables) read it and are
// drawn again when it changes (the 'silinx-notation' event). core/expr-notation.js writes the expressions.
import { prefKey } from './prefs.js';
import { readPref } from './silinx.js';
import { DEFAULT_NOTATION, NOTATIONS, NOTATION_IDS } from '/core/expr-notation.js';

export { NOTATIONS };
export const NOTATION_KEY = prefKey('silinx.notation');
const NOTATION_EVENT = 'silinx-notation';

// (the one chosen in this page: kept when the browser keeps no settings)
let chosen = null;
/** The notation chosen (an id of NOTATIONS). */
export const getNotation = () => readPref(NOTATION_KEY, NOTATION_IDS, chosen ?? DEFAULT_NOTATION);

/** Choose the notation: kept, and the views that show expressions drawn again. */
function setNotation(id) {
  if (!NOTATION_IDS.includes(id)) return;
  chosen = id;
  try { globalThis.localStorage?.setItem(NOTATION_KEY, id); } catch { /* storage unavailable: this page only */ }
  globalThis.dispatchEvent?.(new CustomEvent(NOTATION_EVENT, { detail: id }));
}

/** Call `fn` when the notation changes; returns the function that stops it. */
export function onNotation(fn) {
  const h = () => fn(getNotation());
  globalThis.addEventListener?.(NOTATION_EVENT, h);
  return () => globalThis.removeEventListener?.(NOTATION_EVENT, h);
}

/** The Settings menu's entry: the notations, the chosen one checked. */
export const notationMenu = () => ({ label: 'Boolean Notation', submenu: NOTATIONS.map(([id, label]) => ({ label, checked: getNotation() === id, action: () => setNotation(id) })) });
