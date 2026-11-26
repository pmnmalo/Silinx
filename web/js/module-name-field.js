// A drawing's module name in its Properties (#5718): shown, never edited there. Changed there it renamed the drawing
// alone, its HDL, its file and the instances of it left behind (its source with a red cross in the hierarchy); a module
// is renamed by the Design pane's Rename… (the MCP server's rename_module), which renames them all together.

import { h } from './dom.js';

/** The field's tip: where a module is renamed (a tip, not a line under the field: docs/UI-GUIDELINES.md, no hint line). */
const MODULE_NAME_TIP = 'Renamed with Rename… in the Design pane';

/** The module name's field: its input, read only (its name selected and copied, #5736; drawn as a disabled field). */
export const moduleNameInput = (name, cls = '') => h('input', { type: 'text', class: cls, value: name ?? '', readOnly: true, title: MODULE_NAME_TIP, spellcheck: 'false', 'data-module-name': '' });
