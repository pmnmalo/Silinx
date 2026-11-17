// The merge view (#4214, phase 3 of #4204): text files changed on both sides (an HDL file, a test bench, constraints,
// C/C++) merged three-way by their lines (core/text-merge.js), in a document of its own. For each file, its hunks side
// by side (the base, mine, theirs: what each side made of the same lines, a conflict marked), and below them the
// result: what the merge takes, and for each conflict Mine, Theirs or Both (mine's lines, then theirs'), or the lines
// edited by hand. Its toolbar holds the file, the conflicts' Previous / Next, the caller's action (Pull from GitHub,
// Merge) and Cancel; its status line the counts (docs/UI-GUIDELINES.md); its messages go to the console. It writes
// nothing: it gives its caller the choices ({ [path]: { [id]: 'mine' | 'theirs' | 'both' | { text } } }), which the
// caller's merge applies (a pull again, Merge Contribution, a branch's merge), so that no conflict marker ever reaches a
// project's files. The texts are someone else's: shown as text only.
import { h } from './ui.js';
import { openDoc, findDoc, activateDoc, closeDoc } from './app.js';
import { log, logError } from './console.js';
import { t } from './i18n.js';
import { statusLine } from './status-line.js';
import { mergeText, checkTextChoice } from '/core/text-merge.js';

const SAME_SHOWN = 3;   // (unchanged lines shown at each end of a long run of them)
const SIDES = ['mine', 'theirs', 'both'];
const SIDE_LABEL = { mine: 'Mine', theirs: 'Theirs', both: 'Both' };

// the conflicts the choices leave, over every file: [{ path, id }]
function conflictsLeft(merges, choices) {
  return merges.flatMap(m => m.merge.conflicts.filter(id => !checkTextChoice(choices[m.path]?.[id])).map(id => ({ path: m.path, id })));
}

/** Opens the merge view of files ([{ path, base (null: no ancestor), mine, theirs }]); labels: { mine, theirs } (the
 *  sides' names: 'Mine (here)', 'Theirs (GitHub)'), action: its button's label, choices: those made before. Resolves to
 *  the choices once every conflict is resolved and the action clicked, or to null (Cancel, the tab closed). */
export function openMergeView({ key = 'merge', title = 'Merge', files, labels = {}, action = 'Merge', choices = {} }) {
  const id = `merge:${key}`;
  const old = findDoc(id);
  if (old) { activateDoc(old); return old.merge.result; }
  let settle;
  const result = new Promise(r => { settle = r; });
  openDoc({ id, title, tooltip: files.map(f => f.path).join(', '), icon: 'file', create: (el, doc) => mountMergeView(el, doc, { files, labels, action, choices, done: v => settle(v), result }) });
  return result;
}

function mountMergeView(el, doc, { files, labels, action, choices: given, done, result }) {
  const merges = files.map(f => ({ path: f.path, merge: mergeText(f.base, f.mine, f.theirs) }));
  const choices = structuredClone(given || {});
  const total = merges.reduce((a, m) => a + m.merge.conflicts.length, 0);
  let cur = 0, settled = false;
  const finish = v => { if (settled) return; settled = true; done(v); };
  doc.merge = { result, merges, choices, current: () => merges[cur].path, left: () => conflictsLeft(merges, choices) };

  const btn = (label, tip, cmd, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn asm-wide${cls}`, 'data-cmd': cmd, title: tip, onclick }, label);
  const fileSel = h('select', { class: 'asm-select merge-file-select', title: 'The file shown', 'data-no-i18n': '', onchange: e => show(Number(e.target.value)) },
    ...merges.map((m, i) => h('option', { value: String(i) }, m.path)));
  const prev = btn('Previous Conflict', 'The conflict before this one', 'prev', () => step(-1));
  const next = btn('Next Conflict', 'The next conflict', 'next', () => step(1));
  const apply = btn(action, 'Apply the merge with these choices', 'apply', () => applyMerge(), ' merge-apply');
  const cancel = btn('Cancel', 'Close the merge view: nothing is merged', 'cancel', () => { finish(null); closeDoc(doc); });
  const line = statusLine();
  const body = h('div', { class: 'merge-body' });
  const root = h('div', { class: 'asm-editor merge-view' },
    h('div', { class: 'asm-toolbar merge-bar' },
      ...(merges.length > 1 ? [h('div', { class: 'asm-group' }, fileSel)] : []),
      h('div', { class: 'asm-group' }, prev, next), h('div', { class: 'asm-spacer' }), h('div', { class: 'asm-group' }, apply, cancel)),
    body, line.el);
  el.append(root);
  log(t(`Merge: ${total} conflict(s) in ${merges.length} file(s), the same lines changed on both sides: choose Mine, Theirs or Both for each, or edit its lines, then ${action}.`), 'info');

  function status() {
    const left = conflictsLeft(merges, choices).length;
    line.set([...(merges.length > 1 ? [`File ${cur + 1} of ${merges.length}`] : []), `${total - left} of ${total} conflict(s) resolved`]);
  }
  function show(i, focusId = null) {
    cur = i;
    fileSel.value = String(i);
    body.replaceChildren(...renderFile(merges[i], labels, choices[merges[i].path] ||= {}, () => status()));
    status();
    if (focusId) body.querySelector(`.merge-choice[data-id="${focusId}"]`)?.scrollIntoView({ block: 'center' });
  }
  // the conflict before or after the one in sight (across the files)
  function step(dir) {
    const all = merges.flatMap((m, i) => m.merge.conflicts.map(id => ({ i, id })));
    if (!all.length) return;
    const at = body.querySelector('.merge-choice.current')?.dataset.id;
    let k = all.findIndex(x => x.i === cur && x.id === at);
    k = k < 0 ? (dir > 0 ? all.findIndex(x => x.i >= cur) : all.findLastIndex(x => x.i <= cur)) : k + dir;
    const to = all[(k + all.length) % all.length] || all[0];
    if (to.i !== cur) show(to.i);
    focusChoice(to.id);
  }
  function focusChoice(cid) {
    for (const c of body.querySelectorAll('.merge-choice')) c.classList.toggle('current', c.dataset.id === cid);
    body.querySelector(`.merge-choice[data-id="${cid}"]`)?.scrollIntoView({ block: 'center' });
  }
  function applyMerge() {
    const left = conflictsLeft(merges, choices);
    if (left.length) {
      logError(`Merge: ${left.length} conflict(s) left to resolve (${left.map(x => `${x.path} ${x.id}`).join(', ')}): choose Mine, Theirs or Both, or edit its lines.`);
      const i = merges.findIndex(m => m.path === left[0].path);
      if (i !== cur) show(i);
      focusChoice(left[0].id);
      return;
    }
    finish(Object.fromEntries(merges.map(m => [m.path, { ...choices[m.path] }])));
    closeDoc(doc);
  }
  show(0);
  return { destroy: () => finish(null) };
}

const lines = l => h('pre', { class: 'merge-lines', 'data-no-i18n': '' }, l.join('\n'));
// a run of unchanged lines, its middle folded when it is long
function sameLines(l) {
  if (l.length <= 2 * SAME_SHOWN + 1) return lines(l);
  return h('div', {}, lines(l.slice(0, SAME_SHOWN)), h('div', { class: 'merge-fold hint' }, `⋯ ${l.length - 2 * SAME_SHOWN} unchanged line(s)`), lines(l.slice(-SAME_SHOWN)));
}

// a file's hunks (the three sides) and its result (each conflict's choice)
function renderFile(m, labels, picks, changed) {
  const cell = (hk, side) => h('td', { class: `merge-cell merge-${side}` }, hk.kind === 'same' ? sameLines(hk[side]) : lines(hk[side]));
  const sides = h('table', { class: 'merge-sides' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Common Ancestor'), h('th', {}, labels.mine || 'Mine'), h('th', {}, labels.theirs || 'Theirs'))),
    h('tbody', {}, ...m.merge.hunks.map(hk => h('tr', { class: `merge-hunk merge-${hk.kind}`, ...(hk.id ? { 'data-id': hk.id } : {}) }, cell(hk, 'base'), cell(hk, 'mine'), cell(hk, 'theirs')))));
  const n = m.merge.conflicts.length;
  const result = h('div', { class: 'merge-result' }, ...m.merge.hunks.map(hk => {
    if (hk.kind !== 'conflict') return h('div', { class: `merge-taken merge-${hk.kind}` }, hk.kind === 'same' ? sameLines(hk.mine) : lines(hk.kind === 'theirs' ? hk.theirs : hk.mine));
    return conflictBlock(m, hk, n, picks, changed);
  }));
  return [h('div', { class: 'merge-path', 'data-no-i18n': '' }, m.path), sides, h('h3', {}, 'Result'), result];
}

// a conflict's choice: Mine, Theirs, Both, or its lines edited
function conflictBlock(m, hk, n, picks, changed) {
  const text = h('textarea', { class: 'merge-edit', spellcheck: false, rows: Math.max(2, hk.mine.length, hk.theirs.length), placeholder: 'Choose Mine, Theirs or Both, or write the lines here.' });
  const buttons = SIDES.map(s => h('button', { type: 'button', class: `btn merge-pick merge-pick-${s}`, 'data-side': s, onclick: () => pick(s) }, SIDE_LABEL[s]));
  const edited = h('span', { class: 'merge-edited hint' });
  const block = h('div', { class: 'merge-choice', 'data-id': hk.id },
    h('div', { class: 'merge-choice-head' }, h('span', { class: 'merge-choice-name' }, `Conflict ${Number(hk.id.slice(1))} of ${n}`), ...buttons, edited), text);
  const sync = () => {
    const c = picks[hk.id];
    for (const b of buttons) b.classList.toggle('on', c === b.dataset.side);
    block.classList.toggle('resolved', checkTextChoice(c));
    edited.textContent = c && typeof c === 'object' ? 'Edited' : '';
  };
  const linesOf = s => (s === 'both' ? [...hk.mine, ...hk.theirs] : hk[s]);
  function pick(s) { picks[hk.id] = s; text.value = linesOf(s).join('\n'); sync(); changed(); }
  text.addEventListener('input', () => { picks[hk.id] = { text: text.value }; sync(); changed(); });
  block.addEventListener('pointerdown', () => { for (const o of block.parentElement?.querySelectorAll('.merge-choice') || []) o.classList.toggle('current', o === block); });
  const c = picks[hk.id];
  if (checkTextChoice(c)) text.value = typeof c === 'object' ? c.text.replace(/\r?\n$/, '') : linesOf(c).join('\n');
  sync();
  return block;
}

