// Usability tests (#5206, phase 1): a session in the HDL editor (lib/session.js's, the HDL editor's kit,
// lib/hdl-actions.js): a design typed from empty, line after line, each line a step whose text must be the typing's
// model's (lib/hdl-typing.js); Undo back to the start and Redo to the end as the editor's history has them (its steps
// are its own: the characters typed in a row are one), each Undo changing the text, the Redos giving the same texts back
// in the reverse order.
import { Session } from './session.js';
import { HDL_KIT, editorState, tr } from './hdl-actions.js';
import { TypingModel, fileOf } from './hdl-typing.js';
import { DESIGNS } from './hdl-designs.js';

export class HdlSession extends Session {
  constructor(page, env, opts) { super(page, env, { hdl: false, kit: HDL_KIT, ...opts }); }

  /** A design of lib/hdl-designs.js typed from empty (its first line not indented): a step a line (Enter, the indentation corrected, the line typed),
   *  the text after each the model's. `strict`: 'indent', the indentation the editor gives left as it is (it must be
   *  the one intended); 'enter', no completion list closed before an Enter; either typed with no mistake. */
  async typeDesign(lang, { strict = null } = {}) {
    const D = DESIGNS[lang], m = new TypingModel(), typed = (l) => (strict ? l.line : l.typed ?? l.line);
    this.model = m;
    const same = (text) => { if (text !== m.text) throw new Error(`the text is not the one typed: line ${diffLine(text, m.text)}: ${JSON.stringify(lineOf(text, diffLine(text, m.text)))}, typed ${JSON.stringify(lineOf(m.text, diffLine(text, m.text)))}`); };
    for (const [i, l] of D.lines.entries()) {
      await this.step('type a line', { n: i + 1, indent: l.indent, line: typed(l) }, async () => {
        if (i) {
          await this.a.enter({ escape: strict !== 'enter' });
          m.enter(l.indent);
          if (strict !== 'indent') await this.a.indentTo(l.indent);
        }
        await this.a.typeLine(typed(l), m);
      }, { expect: same });
    }
    await this.step('Enter at the end', {}, async () => {
      await this.a.enter({ escape: strict !== 'enter' });
      m.enter(0);
      if (strict !== 'indent') await this.a.indentTo(0);
    }, { expect: same });
    // (the model's text: the design's, its mistakes as typed)
    const want = fileOf(D.lines.map((l) => ({ ...l, line: typed(l) })));
    if (m.text !== want) throw new Error(`the typing's model gives another text than the design's: line ${diffLine(m.text, want)}`);
  }

  /** Undo to the start (the first from Edit ▸ Undo, the others Ctrl+Z), each changing the text (`first`: the text
   *  the first must give); then Redo to the end (Edit ▸ Redo, then Ctrl+Shift+Z / Ctrl+Y), the same texts in the
   *  reverse order. */
  async undoRedo({ first } = {}) {
    const start = this.docs[0], end = this.doc, seen = [end];
    const [editL, undoL, redoL] = await tr(this.page, ['Edit', 'Undo', 'Redo']);
    const focus = () => this.page.eval(() => window.Silinx.active.editor.focus());
    for (let k = 0; (await editorState(this.page)).history.undo; k++) {
      if (k > 500) await this.fail('undo', { Undo: ['more than 500 Undos'] });
      this.steps.push({ name: 'undo', args: { n: k + 1 } });
      if (k) await this.a.undo(); else { await this.page.menu(editL, undoL); await focus(); }
      const d = await this.settled();
      if (d === seen.at(-1)) await this.fail('undo', { Undo: [`Undo ${k + 1} did not change the text`] }, seen.at(-1), d);
      if (!k && first != null && d !== first) await this.fail('undo', { Undo: ['the first Undo did not undo the last step'] }, first, d);
      seen.push(d);
    }
    if (seen.at(-1) !== start) await this.fail('undo', { Undo: [`${seen.length - 1} Undos, and the text is not the start's`] }, start, seen.at(-1));
    await this.shot();
    for (let i = seen.length - 2; i >= 0; i--) {
      this.steps.push({ name: 'redo', args: { n: seen.length - 1 - i } });
      if (i === seen.length - 2) { await this.page.menu(editL, redoL); await focus(); } else await this.a.redo();
      const d = await this.settled();
      if (d !== seen[i]) await this.fail('redo', { Redo: [`Redo ${seen.length - 1 - i} did not give the text Undo ${i + 1} went back from`] }, seen[i], d);
    }
    if ((await editorState(this.page)).history.redo) await this.fail('redo', { Redo: ['Redo still enabled at the end'] });
    await this.shot();
  }
}

const diffLine = (a, b) => { const x = a.split('\n'), y = b.split('\n'); let i = 0; while (i < x.length && x[i] === y[i]) i++; return i + 1; };
const lineOf = (t, n) => t.split('\n')[n - 1] ?? null;
