// Usability tests (#5206, phase 4): what a person does with a design's hierarchy, through the interface: a module
// instance of a schematic double-clicked (its module opened: a schematic, or its HDL), the tab of the one above clicked
// to go back; an out-of-date instance's Update Symbol (its Properties' note read, the button clicked); a line of an HDL
// file replaced (the cursor taken to it with the arrows, the line after its indentation selected with Home and
// Shift+End, the new one typed character by character, Escape), Ctrl+S. The schematic's own actions are
// lib/sch-actions.js's.
import { schActions, ED } from './sch-actions.js';
import { editorState } from './hdl-actions.js';
import { symbolBox } from '../../../core/schdoc-symbols.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The schematic's actions and the hierarchy's on `page`. */
export function hierActions(page) {
  const sch = schActions(page);
  const active = () => page.eval(() => window.Silinx.active?.id ?? null);
  const a = {
    ...sch,
    /** The instance `name` double-clicked: its module opened in front (its id, 'sch:src/mid.sch.json', 'file:src/cell.v'). */
    async descend(name) {
      const s = (await sch.getDoc()).symbols.find((x) => x.name === name);
      if (!s) throw new Error(`no symbol ${name}`);
      const b = symbolBox(s), was = await active();
      await sch.tool('select');
      await page.dblclick(await sch.at(b.x + b.w / 2, b.y + b.h / 2));
      return page.waitFor((w) => { const d = window.Silinx.active; return d && d.id !== w && (d.schEditor || d.editor?.view) ? d.id : null; }, [was], { what: `${name}'s module opened` });
    },
    /** A document's tab clicked (its file's name): that document in front. */
    async tab(title) {
      await page.click('#doc-tabs .tlabel', { text: title });
      await page.waitFor((t) => window.Silinx.active?.path?.split('/').pop() === t, [title], { what: `${title} in front` });
      await sleep(150);
    },
    /** Update Symbol of the instance `name`: selected, its Properties' note (its text returned), the button. */
    async updateSymbol(name) {
      await sch.select(name);
      await page.waitFor((ed) => document.querySelector(`${ed} .se-stale`), [ED], { what: `${name}'s out-of-date note` });
      const note = await page.eval((ed) => document.querySelector(`${ed} .se-stale`).textContent, ED);
      await page.click(`${ED} .se-update`);
      await page.waitFor((ed) => !document.querySelector(`${ed} .se-stale`), [ED], { what: `${name} up to date` });
      return note;
    },
    /** Ctrl+S on the document in front: saved (the tab's mark gone). */
    async save() {
      await page.eval(() => clearTimeout(window.Silinx.active._autosave));
      await page.key('s', { modifiers: 2 });
      await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
    },
    /** In the HDL editor in front, the line `n` (1-based) replaced by `text` (its indentation kept): typed character by
     *  character. */
    async replaceLine(n, text) {
      await page.eval(() => window.Silinx.active.editor.focus());
      for (let k = (await editorState(page)).line; k !== n; k += k > n ? -1 : 1) await page.key(k > n ? 'ArrowUp' : 'ArrowDown');
      // (End, then Home: the line's text after its indentation, wherever the cursor was on it; Shift+End selects it)
      await page.key('End');
      await page.key('Home');
      await page.key('End', { modifiers: 8 });
      for (const ch of text) await page.type(ch);
      await sleep(200);
      await page.key('Escape');
    },
  };
  return a;
}

/** The HDL editor's text (the document in front's). */
export const hdlText = (page) => page.eval(() => window.Silinx.active?.editor?.getValue() ?? null);
