// The truth table editor's HDL link (#245, #2047; moved from truthtable.js, #4194): the banner of an HDL file not in
// sync with the table ("Not in sync with <file> — <why>", its file opened by a click), none when it is in sync (its
// name in data-hdl) or in a design project, whose HDL is never shown (#3891).
import { h } from './ui.js';
import { designKind } from './project-kind-flag.js';

/** The link's element drawn again: `opts.linkInfo()` its { file, why }, `opts.onOpenFile(file)` its click. */
export function renderTtLink(link, opts) {
  link.innerHTML = '';
  const info = opts.linkInfo?.();
  // (only when its HDL is not in sync: the file in sync unsaid, its name in data-hdl, #2047)
  link.dataset.hdl = info?.file && !info.why ? info.file.split('/').pop() : '';
  if (!info?.why || designKind()) return;   // (a design project's HDL never shown, #3891)
  link.append(h('span', { class: 'gen-banner out-of-sync' }, 'Not in sync with ',
    h('a', { onclick: () => opts.onOpenFile?.(info.file) }, info.file.split('/').pop()), ` — ${info.why}`));
}
