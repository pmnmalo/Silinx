// Usability tests (#5206, phase 1): a model of the HDL editor's typing, what its text is after a person's keys, to check
// the editor's against (lib/hdl-actions.js): the brackets and quotes it closes (CodeMirror's closeBrackets: an opening
// bracket or a quote closed when what follows is a space, the end of the line or a closing character; a quote after a
// word's letter not, as 4'd0; a closing character typed over the one it put), Enter (the text after the cursor carried to
// the new line, its spaces dropped; a line of spaces only before the cursor emptied; the new line indented as the
// person leaves it: the editor's, or corrected; a closing word, 'end', 'else'…, the editor brings back to its block's
// indentation as it is typed, which is the one intended), Enter after a word typed whole a new line even with the
// completion list open on it, a completion taken (the rest of its word inserted), the End of a line.
//
// A line to type is written as the person types it: `[[std_logic_v|ector]]` types `std_logic_v`, waits for the
// completion list and takes its first word, which is `std_logic_vector` (the part after the bar what it adds).

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);
const QUOTES = new Set(["'", '"']);
// (what may follow a bracket or a quote for it to be closed: closeBrackets' `before`, a space, the end of the line)
const BEFORE = new Set([')', ']', '}', ':', ';', '>']);
const closes = (next) => next === '' || /\s/.test(next) || BEFORE.has(next);

export class TypingModel {
  constructor(text = '') { this.text = text; this.pos = text.length; }
  get next() { return this.text[this.pos] ?? ''; }
  get prev() { return this.text[this.pos - 1] ?? ''; }
  insert(s, cursor = s.length) { this.text = this.text.slice(0, this.pos) + s + this.text.slice(this.pos); this.pos += cursor; }

  /** One character typed. */
  type(ch) {
    if ((CLOSE.has(ch) || QUOTES.has(ch)) && this.next === ch) { this.pos++; return; }
    if (OPEN[ch] && closes(this.next)) return this.insert(ch + OPEN[ch], 1);
    if (QUOTES.has(ch) && !/\w/.test(this.prev) && closes(this.next)) return this.insert(ch + ch, 1);
    this.insert(ch);
  }
  /** A string typed, one character after the other. */
  typeAll(s) { for (const ch of s) this.type(ch); }

  /** Enter, the new line then indented by `indent` spaces (the editor's, as the person corrects it). */
  enter(indent) {
    const from = this.text.lastIndexOf('\n', this.pos - 1) + 1;
    let to = this.text.indexOf('\n', this.pos);
    if (to < 0) to = this.text.length;
    const before = this.text.slice(from, this.pos), after = this.text.slice(this.pos, to).replace(/^\s+/, '');
    const head = /\S/.test(before) ? before : '';
    this.text = `${this.text.slice(0, from)}${head}\n${' '.repeat(indent)}${after}${this.text.slice(to)}`;
    this.pos = from + head.length + 1 + indent;
  }

  /** A completion taken: the rest of its word inserted. */
  complete(rest) { this.insert(rest); }

  /** The cursor at the end of line `n` (1-based). */
  endOf(n) {
    let at = 0;
    for (let i = 1; i < n; i++) at = this.text.indexOf('\n', at) + 1;
    const e = this.text.indexOf('\n', at);
    this.pos = e < 0 ? this.text.length : e;
  }
}

/** A line as the person types it: its pieces, the text typed and the completions taken ({ type } / { prefix, rest }). */
export function pieces(line) {
  const out = [];
  const re = /\[\[([^|\]]*)\|([^\]]*)\]\]/g;
  let at = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > at) out.push({ type: line.slice(at, m.index) });
    out.push({ prefix: m[1], rest: m[2] });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ type: line.slice(at) });
  return out;
}

/** A line's text once typed (its completions taken). */
export const plain = (line) => line.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$1$2');

/** The file a design's lines make: each `{ indent, line }` typed, one Enter between two (the last line ends the file). */
export function fileOf(lines) {
  return `${lines.map((l) => `${' '.repeat(l.indent)}${plain(l.line)}`).join('\n')}\n`;
}

/** The model of a design typed from empty: the lines, each after an Enter, with the indentation intended (the
 *  mistakes typed as they are, `typed`), and an Enter after the last; what it gives, the text. */
export function typeDesign(lines) {
  const m = new TypingModel();
  lines.forEach((l, i) => {
    if (i) m.enter(l.indent); else m.insert(' '.repeat(l.indent));
    for (const p of pieces(l.typed ?? l.line)) {
      if (p.type != null) m.typeAll(p.type);
      else { m.typeAll(p.prefix); m.complete(p.rest); }
    }
  });
  m.enter(0);
  return m;
}
