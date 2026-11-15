// A drawing's HDL language in its editor's ⋮ menu (#4063): the schematic's, the Boolean algebra's, the state diagram's,
// the ASM chart's, the Petri net's and the circuit's; Preferred Language (the project's, Design Properties: the drawing
// follows it), VHDL or Verilog, the ✓ on the drawing's. The same choice as Source Properties' (drawings-lang.js
// setSourceLanguage, the project's sourceLanguage): its HDL file made again in that language. None in a design and
// simulation project (no HDL, #3780).
import { S } from './app.js';
import { menuChoice } from './toolbar-menu.js';
import { designOnly } from './design-only.js';
import { modelLanguage } from '/core/view-hdl.js';

/** The ⋮ menu's items of the drawing `path`'s language (a title and its three choices), or none. */
export function languageMenu(path) {
  if (designOnly() || !S.project) return [];
  const preferred = S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl';
  let now = preferred;
  try { now = modelLanguage(JSON.parse(S.viewTexts?.[path] ?? '{}')); } catch { /* unread: the project's */ }
  // (its own when Source Properties gave it one, or when it is in the other language)
  const value = S.project.sourceLanguage?.[path] === now || now !== preferred ? now : '';
  const items = menuChoice('HDL Language', [
    { value: '', label: 'Preferred Language', title: 'The project\'s Preferred Language (Design Properties): the drawing\'s HDL follows it' },
    { value: 'vhdl', label: 'VHDL', title: 'The drawing\'s HDL in VHDL, whatever the project\'s Preferred Language' },
    { value: 'verilog', label: 'Verilog', title: 'The drawing\'s HDL in Verilog, whatever the project\'s Preferred Language' },
  ], { value, onChange: async (c) => (await import('./drawings-lang.js')).setSourceLanguage(path, c) });
  for (const it of items) it.dataset.lang = 'true';   // (its items, beside another choice of the same values: a table's notation)
  return items;
}
