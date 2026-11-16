// Who is in a shared project (#3181), at the right end of the main toolbar (the Silinx interface's top bar, before
// Search commands and files, #3315): a round badge per participant (their initial, in their colour; their name and
// role its tip: owner, editor or viewer, #3997), the owner's first, then a button: the owner's "Sharing", a follower's "Following <owner>" (or "Follow
// <owner>" when they browse alone), its menu the participants and the commands (the link, stop sharing; follow, stop
// following). Shown in both interfaces, while the project is shared; the Collaboration tab's Live box shows the same (#4215).
import { h, popupMenu } from './ui.js';
import { collab } from './collab-state.js';

let box = null;
let commands = () => [];   // the menu's commands (collab-share.js, collab-follow.js)
let shown = { label: '', all: [] };   // what the presence shows (the Collaboration tab's Live box too, #4215)

/** The menu's commands while a project is shared or followed: () => [items]. */
export function setPresenceCommands(fn) { commands = fn; }
/** The presence as shown (the Collaboration tab's Live box, #4215): its label, the participants (the owner first; me:
 *  this page's), the menu's commands; nothing while no project is shared or followed. */
export const presence = () => (collab.role ? { label: shown.label, all: shown.all, commands: commands().filter(c => c !== '-') } : { label: '', all: [], commands: [] });

const initial = name => (String(name).trim()[0] || '?').toUpperCase();
const badge = p => h('span', { class: `collab-badge${p.role === 'owner' ? ' owner' : ''}`, style: { background: p.color }, title: p.name, 'data-no-i18n': '', 'data-peer': p.name }, initial(p.name));

// its place: the Silinx interface's top bar, before Search commands and files; the others' toolbar, at its right end;
// moved there when the interface changes (View ▸ Interface)
function place() {
  const top = document.documentElement.dataset.ui === 'silinx' && document.getElementById('top-actions');
  const search = top && document.getElementById('palette-btn');
  if (search?.parentNode === top) { if (box.nextElementSibling !== search) search.before(box); }
  else if (top) { if (box.parentNode !== top) top.prepend(box); }
  else { const tb = document.getElementById('toolbar'); if (tb && box.parentNode !== tb) tb.append(box); }
}
let watched = false;
function watch() {
  if (watched) return;
  watched = true;
  new MutationObserver(() => { if (box) place(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui', 'data-layout'] });
}

/** The presence, drawn again (hidden when nothing is shared): `label` the button's, `me` this participant. */
export function renderPresence({ label = '', me = null, peers = [] } = {}) {
  if (!document.getElementById('toolbar')) return;
  shown = { label, all: [...(me ? [me] : []), ...peers].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0)) };
  dispatchEvent(new CustomEvent('silinx:collab-presence'));   // (the Collaboration tab's Live box drawn again, #4215)
  if (!collab.role) { box?.remove(); box = null; return; }
  if (!box) box = h('div', { class: 'collab-presence', role: 'group', 'aria-label': 'Shared project' });
  place();
  watch();
  const { all } = shown;
  const btn = h('button', { class: 'tb-btn collab-btn', title: 'Shared project: who is in it, and its commands', 'aria-haspopup': 'menu' }, label);
  btn.addEventListener('click', () => { const r = btn.getBoundingClientRect(); popupMenu(menuItems(all), r.left, r.bottom + 2); });
  box.replaceChildren(h('span', { class: 'collab-badges' }, ...all.map(badge)), btn);
}

function menuItems(all) {
  // (a name is the participant's, not translated; their role beside it)
  const people = all.map(p => ({ label: p.name, raw: true, shortcut: p.me ? 'you' : p.role === 'owner' ? 'owner' : p.role === 'editor' ? 'editor' : 'viewer', disabled: true }));
  return [...people, '-', ...commands()];
}
