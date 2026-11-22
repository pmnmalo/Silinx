// Usability tests (#5206, phase 1): the HDL editor's kit for a session (lib/session.js): its document the editor's text,
// its actions a person's keys in the editor (a line typed character by character, the indentation the editor gives
// corrected with Backspace and Tab, a completion taken from its list, Enter), Edit ▸ Undo / Redo and Ctrl+Z / Ctrl+Y,
// Check Syntax from the editor's bar, the Errors tab's row of a message clicked. A drawing's invariants have no part
// here (none, nor wires): the text's are each step's, against the typing's model (lib/hdl-typing.js).
import { pieces } from './hdl-typing.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (Cmd on a Mac, where the browser runs the editor's Mac key map; Ctrl elsewhere)
const MOD = { modifiers: process.platform === 'darwin' ? 4 : 2 };
// (CodeMirror takes no Enter in the first 75 ms of its list; a person reads it first)
const READ_MS = 300;

/** The labels in the page's language. */
export const tr = (page, list) => page.eval(async (l) => { const { t } = await import('/js/i18n.js'); return l.map((x) => t(x)); }, list);

/** The editor's state: its text, the cursor's line (1-based) and column, the completion list's words, its history. */
export const editorState = (page) => page.eval(() => {
  const e = window.Silinx.active?.editor;
  if (!e) return null;
  const c = e.getCursor();
  return { text: e.getValue(), line: c.line + 1, ch: c.ch, list: [...document.querySelectorAll('.cm-tooltip-autocomplete li .cm-completionLabel')].map((x) => x.textContent),
    history: e.historySize(), focused: !!document.activeElement?.closest('.doc:not([hidden]) .cm-editor') };
});

export function hdlActions(page) {
  const a = {
    async open(file) {
      await page.eval((p) => window.SilinxApp.openFile(p), file);
      await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && window.Silinx.active.editor?.view, [file], { what: `${file} in its editor` });
      await page.eval(() => window.Silinx.active.editor.focus());
    },
    getDoc: async () => (await editorState(page)).text,
    async undo() { await page.key('z', MOD); },
    async redo() { await page.key(process.platform === 'darwin' ? 'z' : 'y', { modifiers: MOD.modifiers | (process.platform === 'darwin' ? 8 : 0) }); },

    /** The new line's indentation made `indent` as a person does, with Backspace (back to the indent unit before) and
     *  Tab (on to the next): the editor's own first, returned. */
    async indentTo(indent) {
      const given = (await editorState(page)).ch;
      for (let k = 0; k < 20; k++) {
        const { ch } = await editorState(page);
        if (ch === indent) break;
        await page.key(ch > indent ? 'Backspace' : 'Tab');
      }
      return given;
    },

    /** A line typed (its pieces, lib/hdl-typing.js): its characters one by one, a completion's prefix then its list's
     *  first word taken with Enter (the list must offer it first: `prefix + rest`). */
    async typeLine(line, model) {
      for (const p of pieces(line)) {
        if (p.type != null) { for (const ch of p.type) await page.type(ch); model?.typeAll(p.type); continue; }
        for (const ch of p.prefix) await page.type(ch);
        model?.typeAll(p.prefix);
        const want = p.prefix.replace(/^.*?([\w.$]*)$/, '$1') + p.rest;
        const list = await page.waitFor(() => { const l = [...document.querySelectorAll('.cm-tooltip-autocomplete li .cm-completionLabel')].map((x) => x.textContent); return l.length ? l : null; }, [], { what: `the completion list after '${p.prefix}'` });
        if (!list[0]?.startsWith(want)) throw new Error(`the completion list after '${p.prefix}' offers ${JSON.stringify(list.slice(0, 4))} first, not '${want}'`);
        await sleep(READ_MS);
        await page.key('Enter');
        model?.complete(p.rest);
      }
    },

    /** Enter at the end of a line, the person reading the line first (a completion list still open on the word typed
     *  whole: the new line all the same, #5220). */
    async enter() {
      await sleep(READ_MS);
      await page.key('Enter');
    },

    /** Check Syntax from the editor's bar: the lines of its run, from its header to its result, the empty ones left out. */
    async checkSyntax() {
      const [label] = await tr(page, ['Check Syntax']);
      const n = await page.eval(() => document.querySelectorAll('#console-log .ln').length);
      await page.click('.doc:not([hidden]) .editor-bar .btn', { text: label });
      await page.waitFor((k) => [...document.querySelectorAll('#console-log .ln')].slice(k).some((l) => /^Process "Check Syntax" (completed|failed)/.test(l.textContent)), [n], { what: 'Check Syntax done', timeout: 30000 });
      return page.eval((k) => [...document.querySelectorAll('#console-log .ln')].slice(k).map((l) => l.textContent).filter((t) => t.trim()), n);
    },

    /** The console's tab in front: errors, warnings or console. */
    consoleTab: () => page.eval(() => document.querySelector('#console-tabs .tab.active').dataset.page),
    /** The Errors tab's rows: their messages (their fixes' buttons left out). */
    errorRows: () => page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((d) => [...d.children].filter((e) => e.tagName === 'SPAN' && e.getAttribute('role') !== 'button').map((e) => e.textContent).join(''))),
    /** The Errors tab's row of a message clicked, on its file and line (its fix's button, at its middle, not). */
    async clickErrorRow(i = 0) { await page.click('#console-errors .diag .loc', { index: i }); },
    /** The console's line of a message clicked. */
    async clickConsoleLine(text) {
      await page.click('#console-tabs .tab[data-page=console]');
      const i = await page.eval((t) => [...document.querySelectorAll('#console-log .ln')].findLastIndex((l) => l.textContent === t), text);
      await page.click('#console-log .ln', { index: i });
    },
  };
  return a;
}

/** The HDL editor's kit for a Session: no drawing invariants, no wires. */
export const HDL_KIT = {
  actions: hdlActions,
  invariants: () => ({}),
  hdlErrors: () => [],
  detached: () => [],
  dangling: () => [],
};
