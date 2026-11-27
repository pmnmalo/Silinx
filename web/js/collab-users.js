// Show Sharing Link… (#4851, the toolbar's Sharing menu's): a user's role chosen, Viewer (follows the project, read
// only) or Editor (edits its text files and drawings with the owner), and the share's link of that role shown (link-field.js:
// Copy, Show, Show QR Code, #4073); the two links are not the same, the editors' carrying the room's signing key
// (core/collab-sign.js), which the viewers' has not and cannot be derived from. (The add-a-user step, #3996, and the codes
// exchanged by hand are gone, #5868: whoever has the link opens it, and the pages find each other.)
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

/** Show Sharing Link… (#4851): Viewer or Editor chosen (`role`, Viewer first), the share's link of that role shown at
 *  once; resolves to the role last chosen. */
export async function sharingLinkDialog(share, module = null, role = 'viewer') {
  const what = 'Sharing Link';
  let chosen = ROLES.includes(role) ? role : 'viewer';
  const field = linkField({ field: 'user-link', onCopy: l => {
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
    field.set(roleLink(share, chosen, module));
    note.textContent = chosen === 'editor' ? 'An editor edits its text files and drawings with you, live. Give this link only to whom you trust with them.' : 'A viewer follows the project live, read only: its files and drawings, and what you do (your documents and cursor, your views, simulations, emulators and runs).';
  };
  draw();
  await dialog({
    title: what, width: 560,
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'The links of this share: give each user the link of their role; they open it in Silinx.'),
      h('div', { class: 'share-how' }, h('label', {}, 'Role:'), h('div', { class: 'share-how-choices' }, radio('viewer', 'Viewer'), radio('editor', 'Editor'))),
      note, field.el),
    buttons: [{ label: 'Close', primary: true, value: true }],
  });
  return chosen;
}
