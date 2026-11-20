// Add a User… (#3996), the live Share Project…'s and the toolbar's Sharing menu's: a user's role chosen, Viewer (follows
// the project, read only) or Editor (edits its text files and drawings with the owner), and that role's link made by
// Generate, hidden; Show Sharing Link… (#4851, the Sharing menu's, in place of Copy View Link and Copy Editor Link): the
// same window with the share's links as they are, shown at once (no Generate) (link-field.js: Generate, Copy, Show, Show QR Code, #4073); the two links are not the same, the editors' carrying the room's
// signing key (core/collab-sign.js), which the viewers' has not and cannot be derived from. A share this page hosts
// (#3227) also takes a user's code (Take a Code…, collab-host.js), for a user whose page did not find it.
import { h, dialog } from './ui.js';
import { writeClip } from './clipboard.js';
import { linkField } from './link-field.js';
import { withTop } from '/core/collab-link.js';
import { collabLog } from './collab-log.js';

const ROLES = Object.freeze(['viewer', 'editor']);

/** The link of a role (`module`: opening on it, #3631). */
const roleLink = (share, role, module = null) => {
  const l = role === 'editor' ? share.editLink : share.link;
  return module ? withTop(l, module) : l;
};

/** Add a User…: Viewer or Editor chosen (`role`, Viewer first), its link given; resolves to the role last chosen. */
export const addUserDialog = (share, module = null, role = 'viewer') => roleDialog(share, module, role, false);
/** Show Sharing Link… (#4851): Viewer or Editor chosen, the share's link of that role shown at once; resolves to the
 *  role last chosen. */
export const sharingLinkDialog = (share, module = null, role = 'viewer') => roleDialog(share, module, role, true);

// (`made`: the link shown as it is, Show Sharing Link…'s; else made by Generate, Add a User…'s)
async function roleDialog(share, module, role, made) {
  const what = made ? 'Sharing Link' : 'Add a User';
  let chosen = ROLES.includes(role) ? role : 'viewer';
  const field = linkField({ field: 'user-link', ...(made ? {} : { generate: async () => roleLink(share, chosen, module) }), onCopy: l => {
    writeClip('text', l);
    collabLog(chosen === 'editor' ? `${what}: the editors' link copied: whoever opens it edits the project's text files and drawings with you.` : `${what}: the viewers' link copied: whoever opens it follows the project live, read only.`, 'ok');
  } });
  const note = h('p', { class: 'collab-role-note' });
  const radio = (value, label) => {
    const r = h('input', { type: 'radio', name: 'user-role', value, 'data-field': `role-${value}`, checked: value === chosen });
    r.addEventListener('change', () => { if (r.checked) { chosen = value; draw(); } });
    return h('label', { class: `collab-role-${value}` }, r, h('span', {}, label));
  };
  const draw = () => {
    field.set(made ? roleLink(share, chosen, module) : null);   // (the role's link made by Generate, #4073; Show Sharing Link…'s as it is)
    note.textContent = chosen === 'editor' ? 'An editor edits its text files and drawings with you, live. Give this link only to whom you trust with them.' : 'A viewer follows the project live, read only: its files and drawings, and what you do (your documents and cursor, your views, simulations, emulators and runs).';
  };
  draw();
  await dialog({
    title: what, width: 560,
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, made ? 'The links of this share: give each user the link of their role; they open it in Silinx.' : 'Give them the link of their role: they open it in Silinx.'),
      h('div', { class: 'share-how' }, h('label', {}, 'Role:'), h('div', { class: 'share-how-choices' }, radio('viewer', 'Viewer'), radio('editor', 'Editor'))),
      note, field.el,
      share.hosted && !made ? h('p', { class: 'collab-hosted' }, 'This page hosts the project: a user whose page shows a code sends it to you, and Take a Code… takes it.') : null),
    buttons: [
      ...(share.hosted && !made ? [{ label: 'Take a Code…', validate: () => { import('./collab-host.js').then(m => m.addCodeDialog(share)); return false; } }] : []),
      { label: 'Close', primary: true, value: true },
    ],
  });
  return chosen;
}
