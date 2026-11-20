// Open from GitHub Repository…'s list of the user's repositories (#4653): under the address's field, the most recently
// pushed first, filtered by what the field holds; a click (or Tab / the arrows onto one) puts its address in the field,
// and Enter opens it. Typing any address stays possible. Listed by the edition (api.gitRepositories: the browser's
// sign-in, the server's token or GitHub's command line); when they cannot be, the console says why and how to have them.
import { api } from './api.js';
import { h } from './ui.js';
import { collabLog } from './collab-log.js';
import { filterRepositories, repoLine } from '/core/github-repos.js';

/** The list's element, filled when the repositories come; url: the address's field (its 'input' filters the list). */
export function repoList(url) {
  const status = h('div', { class: 'hint git-repos-status' }, 'Reading your GitHub repositories…');
  const list = h('ul', { class: 'git-repos', role: 'listbox', 'aria-label': 'Your GitHub repositories', style: { maxHeight: '180px', overflowY: 'auto', margin: '4px 0 0', padding: '0', listStyle: 'none', border: '1px solid var(--border)' } });
  list.hidden = true;
  // (data-loading until the list comes: its coming moves the dialog's buttons, which a click waits for, #4816)
  const box = h('div', { class: 'git-repos-box', 'data-loading': '', style: { gridColumn: '1 / -1' } }, status, list);
  let all = null, picking = false;
  // (a repository picked: its address in the field, the list left as it is)
  const choose = (li, r) => {
    for (const o of list.children) o.setAttribute('aria-selected', String(o === li));
    if (url.value === r.url) return;
    url.value = r.url;
    picking = true;
    try { url.dispatchEvent(new Event('input', { bubbles: true })); } finally { picking = false; }
  };
  const render = () => {
    const shown = filterRepositories(all, url.value);
    list.replaceChildren(...shown.map(r => {
      const li = h('li', { class: 'git-repo', role: 'option', tabindex: '0', 'data-repo': r.repository, title: repoLine(r), style: { padding: '3px 6px', cursor: 'pointer' } },
        h('span', { 'data-no-i18n': '' }, r.repository), r.private ? h('span', { class: 'git-repo-private', style: { marginLeft: '6px', opacity: 0.7 } }, '(private)') : null);
      li.setAttribute('aria-selected', String(r.url === url.value));
      li.addEventListener('click', () => choose(li, r));
      li.addEventListener('focus', () => choose(li, r));
      li.addEventListener('keydown', e => {
        const to = e.key === 'ArrowDown' ? li.nextElementSibling : e.key === 'ArrowUp' ? li.previousElementSibling || url : null;
        if (to) { e.preventDefault(); to.focus(); }
      });
      return li;
    }));
    list.hidden = !all.length;
    status.textContent = !all.length ? 'You have no GitHub repository: type its address.'
      : shown.length ? `${shown.length} of your ${all.length} GitHub repositories, the most recently pushed first:` : 'None of your GitHub repositories has this: its address is opened as it is.';
  };
  url.addEventListener('input', () => { if (all && !picking) render(); });
  url.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && list.firstElementChild) { e.preventDefault(); list.firstElementChild.focus(); } });
  // (asked each time the dialog opens: a repository made a minute ago is there)
  api.gitRepositories().then(r => {
    delete box.dataset.loading;
    if (!url.isConnected) return;
    all = r.repositories;
    render();
  }, e => {
    delete box.dataset.loading;
    if (!url.isConnected) return;
    status.textContent = 'Your GitHub repositories are not listed (the console says why): type the address.';
    collabLog(`${e.message.replace(/^./, c => c.toUpperCase())}.`, 'info');
    if (e.hint) collabLog(`Hint: ${e.hint}`, 'info');
  });
  return box;
}
