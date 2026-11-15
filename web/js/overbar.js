// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The Electronics / Engineering notation's bars drawn (#4058): its text writes NOT as the combining overline (U+0305)
// after each character it covers (core/overline.js), which fonts draw on top of each other when a negation is inside
// another. Shown, each bar is a line over its group instead: a box with a top border around the group, nested, each
// level above the one under it. The text stays as it is: the overlines are kept in the element, hidden, so its
// textContent (read back, the tests) and what is copied from it are the same expression.
import { OVERLINE } from '/core/overline.js';

const MAX_BARS = 200;   // (as core/overline.js counts them: deeper is the parsers' nesting error)

/** The characters of `text`, each with its number of bars ({ ch, n, marks }: marks its overlines as written). */
function barsOf(text) {
  const cs = [];
  for (const ch of text) {
    if (ch === OVERLINE && cs.length) { const c = cs[cs.length - 1]; c.n = Math.min(MAX_BARS, c.n + 1); c.marks += ch; continue; }
    cs.push({ ch, n: 0, marks: '' });
  }
  return cs;
}

/** The nodes of `cs`: the runs with more bars in a box `.ob` of their own (one level at a time, with a stack, as
 *  core/overline.js reads them: no recursion on a deep nesting); the characters of a level side by side one text. */
function barNodes(cs) {
  const root = document.createDocumentFragment();
  const stack = [{ el: root, depth: 0 }];
  let buf = '';
  const flush = () => { if (buf) { stack[stack.length - 1].el.append(buf); buf = ''; } };
  for (const c of cs) {
    if (c.n !== stack[stack.length - 1].depth) flush();
    while (stack.length > 1 && c.n < stack[stack.length - 1].depth) stack.pop();
    while (c.n > stack[stack.length - 1].depth) {
      const box = document.createElement('span');
      box.className = 'ob';
      stack[stack.length - 1].el.append(box);
      stack.push({ el: box, depth: stack[stack.length - 1].depth + 1 });
    }
    buf += c.ch;
    if (c.marks) { flush(); const m = document.createElement('span'); m.className = 'ob-mark'; m.textContent = c.marks; stack[stack.length - 1].el.append(m); }
  }
  flush();
  return root;
}

// (a selection copied from a barred text: its overlines with it, as written)
function copyAsWritten(e) {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  e.clipboardData?.setData('text/plain', sel.getRangeAt(0).cloneContents().textContent);
  e.preventDefault();
}

/** `el`'s text drawn with its bars (an element of text only, with an overline in it; any other left as it is). */
function drawBars(el) {
  if (!el || el.children.length || !el.textContent.includes(OVERLINE)) return el;
  const text = el.textContent;
  el.textContent = '';
  el.append(barNodes(barsOf(text)));
  el.classList.add('ob-text');
  el.addEventListener('copy', copyAsWritten);
  return el;
}

/** Every `selector` element under `root` drawn with its bars. */
export const drawBarsIn = (root, selector = 'code') => { for (const el of root.querySelectorAll(selector)) drawBars(el); };
