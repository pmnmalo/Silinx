// A drawing's module name in its Properties (#5718): shown, never edited there. Changed there it renamed the drawing
// alone, its HDL, its file and the instances of it left behind (its source with a red cross in the hierarchy); a module
// is renamed by the Design pane's Rename… (the MCP server's rename_module), which renames them all together.

import { h } from './dom.js';

/** The note under the field: where a module is renamed. */
export const MODULE_NAME_NOTE = 'renamed with Rename… in the Design pane';

/** The module name's field: its input, disabled (docs/UI-GUIDELINES.md: a read-only field). */
export const moduleNameInput = (name, cls = '') => h('input', { type: 'text', class: cls, value: name ?? '', disabled: true, spellcheck: 'false', 'data-module-name': '' });
