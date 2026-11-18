// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The Electronics / Engineering notation's bars drawn (#4058): its text writes NOT as the combining overline (U+0305)
// after each character it covers (core/overline.js), which fonts draw on top of each other when a negation is inside
// another. Shown, each bar is a line over its group instead: a box with a top border around the group, nested, each
// level above the one under it. The text stays as it is: the overlines are kept in the element, hidden, so its
// textContent (read back, the tests) and what is copied from it are the same expression.
// In SVG (a state diagram's arcs, an ASM chart's decisions, #4484) the text is drawn without its overlines, and each bar
// is a line measured over its characters (core/overline.js's barLines), the text as written kept in `data-written`.
import { OVERLINE, BAR_WIDTH, barLines, barRuns } from '/core/overline.js';

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

// ---------------------------------------------------------------------------- SVG (#4484)
const SVG_NS = 'http://www.w3.org/2000/svg';
// (the texts not laid out when drawn (a document's tab not shown): their bars drawn once they are)
const pending = new Map();
let observer = null;

/** A text part's bars drawn as lines, after its text element; false when it is not laid out yet. */
function drawSvgLines(job) {
  const { text, el, bars } = job;
  if (!text.isConnected) return true;
  const size = parseFloat(getComputedStyle(el).fontSize) || 12;
  let lines;
  try { lines = barLines(bars, (i) => el.getExtentOfChar(i), size); } catch { lines = null; }
  if (!lines) return false;
  let g = job.g;
  if (!g) {
    g = job.g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'ob-bars');
    if (text.style.fill) g.style.stroke = text.style.fill;   // (a text of a colour of its own: its bars too)
    text.after(g);
  }
  for (const l of lines) {
    const line = document.createElementNS(SVG_NS, 'line');
    for (const [k, v] of [['x1', l.x1], ['x2', l.x2], ['y1', l.y], ['y2', l.y], ['stroke-width', size * BAR_WIDTH]]) line.setAttribute(k, Math.round(v * 100) / 100);
    line.dataset.level = l.level;
    g.append(line);
  }
  return true;
}

function observe(job) {
  observer ??= typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const jobs = pending.get(target) ?? [];
      if (!target.isConnected) { pending.delete(target); observer.unobserve(target); continue; }
      const left = jobs.filter((j) => !drawSvgLines(j));
      if (left.length) pending.set(target, left);
      else { pending.delete(target); observer.unobserve(target); }
    }
  }) : null;
  if (!observer) return;
  if (!pending.has(job.text)) { pending.set(job.text, []); observer.observe(job.text); }
  pending.get(job.text).push(job);
}

/** Every SVG text `selector` under `root` drawn with its bars as lines (#4484): each of its parts (its tspans, or the
 *  text itself) written without its overlines, its bars lines over their characters after it (`.ob-bars`), the text as
 *  written in its `data-written`. All the texts written first, then all measured: one layout. */
export function drawSvgBarsIn(root, selector) {
  const jobs = [];
  for (const text of root.querySelectorAll(selector)) {
    const written = text.textContent;
    if (!written.includes(OVERLINE)) continue;
    const tspans = [...text.children].filter((c) => c.localName === 'tspan');
    for (const el of tspans.length ? tspans : [text]) {
      if (!el.textContent.includes(OVERLINE)) continue;
      const { plain, bars } = barRuns(el.textContent);
      el.textContent = plain;
      jobs.push({ text, el, bars });
    }
    text.dataset.written = written;
  }
  for (const job of jobs) if (!drawSvgLines(job)) observe(job);
}
