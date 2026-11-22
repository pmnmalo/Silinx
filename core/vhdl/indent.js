// VHDL's indentation, as the HDL editor gives it on Enter and as a closing word is typed (#5218): a line one level
// deeper than its block's opening (entity, architecture, package, process, function, if, case, a case's when, loop,
// generate, record, component, block…), a statement continued on the next line one level deeper than its start, an
// open '(' under its first item (or one level deeper when the '(' ends its line, its ')' back under it); a line that
// starts with 'end' back to its block's opening, 'begin' to its block's, 'elsif' / 'else' to their if's, 'when' one
// level under its case. The lines before are read as they are indented (the person's own indentation kept).

// the reserved words that are not a label before a ':'
const RESERVED = new Set(`abs access after alias all and architecture array assert attribute begin block body buffer bus case component
configuration constant context disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in
inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package port
postponed procedure process protected pure range record register reject rem report return rol ror select severity signal shared sla sll
sra srl subtype then to transport type unaffected units until use variable wait when while with xnor xor`.split(/\s+/));
// a block opened by its first word (a declaration, not an instantiation's 'u1 : entity …'), confirmed by its 'is'
const UNIT = new Set(['entity', 'architecture', 'package', 'configuration', 'context']);

/** The words a line typed that bring it back to its block's indentation (CodeMirror's indentOnInput: the line's text
 *  up to the cursor). */
export const VHDL_ELECTRIC = /^\s*(?:(?:end|elsif|when)\s|end;|begin|else)$/i;

/** A line's tokens (its comments, strings and character literals left out): { w: word (lower case) | s: symbol, col }. */
function tokens(text) {
  const out = [];
  const code = text.replace(/--.*$/, '').replace(/"[^"]*"|'.'/g, (m) => ' '.repeat(m.length));
  for (const m of code.matchAll(/\\[^\\]*\\|[a-z_]\w*|\d[\w#.]*|=>|:=|<=|[();:]/gi)) {
    if (/^[a-z_]/i.test(m[0])) out.push({ w: m[0].toLowerCase(), col: m.index });
    else if (!/^[\d\\]/.test(m[0])) out.push({ s: m[0], col: m.index });
  }
  return out;
}

/** The blocks open at the end of `lines` (each a string, as indented), the open brackets and the statement begun. */
export function scan(lines) {
  const stack = [], parens = [];
  let stmt = null;
  const top = () => stack.at(-1);
  const push = (kind, confirmed = true) => { const b = { kind, indent: stmt.indent, confirmed }; stack.push(b); stmt.block = b; return b; };
  const pop = () => { if (top()?.kind === 'when') stack.pop(); stack.pop(); };
  for (const text of lines) {
    const toks = tokens(text), indent = text.match(/^\s*/)[0].replace(/\t/g, '  ').length;
    toks.forEach((tk, i) => {
      if (parens.length) {
        if (tk.s === '(') parens.push(paren(text, tk.col, indent));
        else if (tk.s === ')') parens.pop();
        return;
      }
      // a line that starts with a closing word ends the statement left open before it (a ';' left out)
      if (!i && stmt && closes(tk.w, top())) { if (stmt.block && !stmt.block.confirmed) stack.pop(); stmt = null; }
      // (a process's, a block's or a component's head, which needs no 'is', ends with its line: its declarations follow)
      if (!i && /^(process|block|component)$/.test(stmt?.block?.kind)) stmt = null;
      stmt ??= { indent, words: 0, label: false, end: false, block: null };
      if (tk.s) {
        if (tk.s === '(') parens.push(paren(text, tk.col, indent));
        else if (tk.s === ';') { if (stmt.block && !stmt.block.confirmed && top() === stmt.block) stack.pop(); stmt = null; }
        else if (tk.s === '=>' && stmt.block?.kind === 'when') stmt = null;
        return;
      }
      if (stmt.end) return;
      const w = tk.w, first = stmt.words === 0;
      stmt.words++;
      if (first && toks[i + 1]?.s === ':' && !RESERVED.has(w)) { stmt.label = true; stmt.words = 0; return; }
      if (first && w === 'end') { stmt.end = true; pop(); return; }
      if (first && w === 'when' && /^(case|when)$/.test(top()?.kind)) { if (top().kind === 'when') stack.pop(); push('when'); return; }
      if (first && w === 'else') { stmt = null; return; }
      if (w === 'begin') { stmt = null; return; }
      if (first && !stmt.label && UNIT.has(w)) { push(w, false); return; }
      if (first && !stmt.label && w === 'component') { push(w); return; }
      if ((first || /^(pure|impure)$/.test(stmt.prev)) && /^(function|procedure)$/.test(w)) { push(w, false); return; }
      stmt.prev = w;
      if (/^(process|block|if|case|while)$/.test(w)) push(w);
      else if (w === 'for') push(w, false);
      else if (/^(record|units|protected)$/.test(w)) { push(w); stmt = null; }
      else if (/^(is|then|loop|generate)$/.test(w)) {
        if (stmt.block) { stmt.block.confirmed = true; stmt = null; }
        else if (w === 'loop') { push(w); stmt = null; }
        else if (w !== 'is') stmt = null;
      }
    });
  }
  return { stack, parens, stmt };
}

// an open '(': its line's indentation and the column of its first item (null when it ends its line)
function paren(text, col, indent) {
  const m = /\S/.exec(text.slice(col + 1).replace(/--.*$/, ''));
  return { indent, first: m ? col + 1 + m.index : null };
}

// a line's first word that closes (or goes back to) the block it is in
function closes(w, top) {
  if (w === 'end' || w === 'begin') return true;
  if (w === 'else' || w === 'elsif') return top?.kind === 'if';
  if (w === 'when') return top?.kind === 'case' || top?.kind === 'when';
  return false;
}

/** The indentation (in columns) of a line after `lines` (the lines before it), its own text `after` (the part after the
 *  cursor on Enter, or the whole line indented again); `unit`: an indentation level's columns. */
export function vhdlIndent(lines, after = '', unit = 2) {
  const { stack, parens, stmt } = scan(lines);
  const text = after.trimStart();
  if (parens.length) {
    const p = parens.at(-1);
    return p.first != null ? p.first : p.indent + (text.startsWith(')') ? 0 : unit);
  }
  const w = (/^[a-z_]\w*/i.exec(text)?.[0] || '').toLowerCase(), top = stack.at(-1);
  if (closes(w, top)) {
    if (w === 'end') return top?.kind === 'when' ? stack.at(-2)?.indent ?? 0 : top?.indent ?? 0;
    if (w === 'when') return top.kind === 'when' ? top.indent : top.indent + unit;
    return top?.indent ?? 0;
  }
  if (stmt && stmt.block !== top) return stmt.indent + unit;
  return top ? top.indent + unit : 0;
}
