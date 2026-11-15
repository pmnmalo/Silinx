// Add a User… (#3996), the live Share Project…'s and the toolbar's Sharing menu's: a user's role chosen, Viewer (follows
// the project, read only) or Editor (edits its text files and drawings with the owner), and that role's link given,
// hidden (link-field.js: Show, Copy, Show QR Code); the two links are not the same, the editors' carrying the room's
// signing key (core/collab-sign.js), which the viewers' has not and cannot be derived from. A share this page hosts
// (#3227) also takes a user's code (Take a Code…, collab-host.js), for a user whose page did not find it.
import { h, dialog } from './ui.js';
import { app } from './app.js';
import { writeClip } from './clipboard.js';
import { linkField } from './link-field.js';
import { withTop } from '/core/collab-link.js';

const ROLES = Object.freeze(['viewer', 'editor']);

/** The link of a role (`module`: opening on it, #3631). */
const roleLink = (share, role, module = null) => {
  const l = role === 'editor' ? share.editLink : share.link;
  return module ? withTop(l, module) : l;
};

/** Add a User…: Viewer or Editor chosen (`role`, Viewer first), its link given; resolves to the role last chosen. */
export async function addUserDialog(share, module = null, role = 'viewer') {
  let chosen = ROLES.includes(role) ? role : 'viewer';
  const field = linkField({ field: 'user-link', onCopy: l => {
    writeClip('text', l);
    app.log(chosen === 'editor' ? 'Add a User: the editors\' link copied: whoever opens it edits the project\'s text files and drawings with you.' : 'Add a User: the viewers\' link copied: whoever opens it follows the project live, read only.', 'ok');
  } });
  const note = h('p', { class: 'collab-role-note' });
  const radio = (value, label) => {
    const r = h('input', { type: 'radio', name: 'user-role', value, 'data-field': `role-${value}`, checked: value === chosen });
    r.addEventListener('change', () => { if (r.checked) { chosen = value; draw(); } });
    return h('label', { class: `collab-role-${value}` }, r, h('span', {}, label));
  };
  const draw = () => {
    field.set(roleLink(share, chosen, module));
    note.textContent = chosen === 'editor' ? 'An editor edits its text files and drawings with you, live. Give this link only to whom you trust with them.' : 'A viewer follows the project live, read only: its files and drawings, and what you do (your documents and cursor, your views, simulations, emulators and runs).';
  };
  draw();
  await dialog({
    title: 'Add a User', width: 560,
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'Give them the link of their role: they open it in Silinx.'),
      h('div', { class: 'share-how' }, h('label', {}, 'Role:'), h('div', { class: 'share-how-choices' }, radio('viewer', 'Viewer'), radio('editor', 'Editor'))),
      note, field.el,
      share.hosted ? h('p', { class: 'collab-hosted' }, 'This page hosts the project: a user whose page shows a code sends it to you, and Take a Code… takes it.') : null),
    buttons: [
      ...(share.hosted ? [{ label: 'Take a Code…', validate: () => { import('./collab-host.js').then(m => m.addCodeDialog(share)); return false; } }] : []),
      { label: 'Close', primary: true, value: true },
    ],
  });
  return chosen;
}
