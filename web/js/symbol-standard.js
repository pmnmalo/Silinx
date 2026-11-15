// The standard the schematics' logic primitives are drawn in (#4113): the viewer's preference (Settings ▸ Schematic
// Symbols), kept in the browser with the notation, the language and the theme; IEEE Std 91-1984's distinctive shapes
// when none is set. The views that draw gates (the schematic editor and its views, the RTL and technology schematics,
// the symbols' previews, the circuit editor's Show inside) read it and are drawn again when it changes (the
// 'silinx-symbols' event). core/symbol-standard.js has the standards and the IEC boxes.
import { prefKey } from './prefs.js';
import { readPref } from './silinx.js';
import { DEFAULT_SYMBOL_STANDARD, SYMBOL_STANDARDS, SYMBOL_STANDARD_IDS } from '/core/symbol-standard.js';

export const SYMBOL_STANDARD_KEY = prefKey('silinx.symbols');
const SYMBOLS_EVENT = 'silinx-symbols';

// (the one chosen in this page: kept when the browser keeps no settings)
let chosen = null;
/** The standard chosen (an id of SYMBOL_STANDARDS). */
export const getSymbolStandard = () => readPref(SYMBOL_STANDARD_KEY, SYMBOL_STANDARD_IDS, chosen ?? DEFAULT_SYMBOL_STANDARD);

/** Choose the standard: kept, and the views that draw gates drawn again. */
function setSymbolStandard(id) {
  if (!SYMBOL_STANDARD_IDS.includes(id)) return;
  chosen = id;
  try { globalThis.localStorage?.setItem(SYMBOL_STANDARD_KEY, id); } catch { /* storage unavailable: this page only */ }
  globalThis.dispatchEvent?.(new CustomEvent(SYMBOLS_EVENT, { detail: id }));
}

/** Call `fn` when the standard changes; returns the function that stops it. */
export function onSymbolStandard(fn) {
  const h = () => fn(getSymbolStandard());
  globalThis.addEventListener?.(SYMBOLS_EVENT, h);
  return () => globalThis.removeEventListener?.(SYMBOLS_EVENT, h);
}

/** The Settings menu's entry: the standards, the chosen one checked. */
export const symbolsMenu = () => ({ label: 'Schematic Symbols', submenu: SYMBOL_STANDARDS.map(([id, label]) => ({ label, checked: getSymbolStandard() === id, action: () => setSymbolStandard(id) })) });
