// A follower's role, for the owner (#4646): Viewer | Editor, the current one pressed, the other one a click away (the
// owner's role changes, collab-presence.js's setPresenceRoles: collab-share.js's, the MCP's change too, its console
// lines); Editor disabled, its tip saying why, in a share with no editors' key. Shown on the follower's row of the
// Collaboration tab's Sharing box (collab-tab.js) and of the toolbar's Sharing menu (collab-presence.js, #4849).
import { h } from './ui.js';

/** The Viewer | Editor switch of participant `x` ({ name, role, client }): `roles` the owner's role changes ({ set(peer,
 *  role), editors() }), `done` called once a change is made (the place it is shown drawn again). */
export function roleSwitch(x, roles, done = () => {}) {
  const can = roles.editors();
  const state = (role, label) => {
    const on = x.role === role || (role === 'viewer' && x.role !== 'editor');
    const off = !on && role === 'editor' && !can;
    return h('button', { type: 'button', class: `collab-role-state${on ? ' on' : ''}`, 'data-role': role, 'aria-pressed': String(on), disabled: off,
      title: on ? '' : off ? 'This share has no editors\' link: share it again to let editors in' : role === 'editor' ? `Make ${x.name} an Editor` : `Make ${x.name} a Viewer`,
      onclick: on || off ? null : () => Promise.resolve(roles.set(x, role)).finally(done) }, label);
  };
  return h('span', { class: 'collab-roles', role: 'group', 'aria-label': 'Role', 'data-client': String(x.client ?? '') }, state('viewer', 'Viewer'), state('editor', 'Editor'));
}
