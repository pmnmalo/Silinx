// Share Project… and Share Module… (#3698): one action, the way of sharing chosen in its window, its first row (Share:):
// a copy (web/js/link-copy.js: a link with the project in it) or live (web/js/collab-share.js: others follow it as it
// changes). Switching closes the window and opens the other way's in its place. It opens on A copy, but while the project
// is shared live: on Live, the way in use (#4669; Live's way last chosen, relay or peer to peer, is still the one Share
// Live… preselects: web/js/share-via.js). Live is disabled, its reason its tip, where the project cannot be shared live.
import { api } from './api.js';
import { h } from './ui.js';
import { S } from './app.js';
import { getLanguage } from './i18n.js';

/** The window's width, a copy's and Live's (#4617): one size (its height app.css's .share-dlg), so that switching
 *  between them does not resize the window. */
export const SHARE_WIDTH = 720;

/** The windows' introductions (#4676: of about the same length, each laid out over the other's, twinText): A copy's
 *  (the project's name), Live's. */
export const copyIntro = name => `A link that opens '${name}' in Silinx, for slides or a message: the whole project is inside it, no file to host. Anyone with the link has every file of the project, its comments too, as it is now.`;
export const liveIntro = () => 'Others follow this project live with its link, read only: its files and drawings as they change, and what you do: your documents, views, simulations and runs. Of its builds, only the reports you open.';
/** A text and its twin, the other way's, laid out in one place (#4676): the twin unseen, the place as tall as the
 *  taller of the two at any width and in any language, so that switching between them moves nothing below.
 *  `attrs` the text's element's (its class the twin's too). */
export const twinText = (tag, attrs, text, other) => h('div', { class: 'share-twin' }, h(tag, attrs, text),
  h(tag, { ...attrs, class: `${attrs.class ? `${attrs.class} ` : ''}share-twin-ghost`, 'aria-hidden': 'true' }, other));

/** The window's title, and its console messages' name: Share Project, or Share Module (a module's). */
export const shareTitle = module => (module ? 'Share Module' : 'Share Project');

/** Whether Share Project… can be used (#4259: File ▸ Share Project…, the toolbar's button and the Collaboration tab's
 *  Share a Copy…): a project open. */
export const canShare = () => !!S.project;

/** Why the project (`module`: one of its modules) cannot be shared live here, or null (the Collaboration tab's Share
 *  Live…'s too, #4215). */
export function liveProblem(module = null) {
  if (!api.collab && !api.standalone) return 'This edition of Silinx does not share a project live.';
  if (location.protocol === 'file:') return 'A Silinx opened from a file has no address that others can open: open Silinx from its site to share a project live.';
  if (api.following) return 'You are following another\'s project: stop following it to share one live.';
  if (module && (S.modules || []).some(m => m.name === module && m.role === 'sim')) return 'A test bench is shared as a copy only.';
  return null;
}

/** Share Project… (no `module`) or Share Module… (`module`, and the copy's `view`): A copy's window, but while the
 *  project is shared live, Live's (its links, Stop Sharing; #4669). */
export async function shareDialog({ module = null, view = null } = {}) {
  if (!canShare()) return null;
  const shared = !liveProblem(module) && !!(await import('./collab-share.js')).sharedLink();
  return openHow(shared ? 'live' : 'copy', { module, view });
}

/** Share Live… (the Collaboration tab's, #4215): Share Project…'s window with Live chosen (its way last chosen). */
export async function shareLiveDialog() {
  if (!S.project || liveProblem()) return null;
  return openHow('live', {});
}

/** Share a Copy… (the Collaboration tab's, #4259): Share Project…'s window with A copy chosen. */
export async function shareCopyDialog() {
  if (!canShare()) return null;
  return openHow('copy', {});
}

// (`shown`: called once the window is on the screen: the one it replaces closed then, #4676)
async function openHow(how, opts) {
  if (how === 'live') return (await import('./collab-share.js')).shareProjectDialog(opts);
  return (await import('./link-copy.js')).copyLinkDialog(opts);
}

/** The window's Share: row, `how` checked: the other way chosen opens its window, and closes this one (`close`) once
 *  that one is on the screen, in the same frame (#4676: never a frame with no window, while a copy's link is made);
 *  this one's caller then sees `wanted` and returns `switched()`, the other way's window. The browser edition's (#4634) has three: A copy, Live peer
 *  to peer (no relay), Live via your Cloudflare relay (#4670: in that order, the keyboard's too); Live's window's `via` checked, the
 *  other live one chosen there given to `onVia` (the window kept), locked while shared (`lock`). Returns { el, wanted,
 *  switched, lock }. */
export function howRow(how, { module = null, view = null, close, via = null, onVia = () => {} }) {
  let wanted = null, next = null;
  const live = liveProblem(module);
  const three = !api.collab && api.standalone;
  const radios = [];
  // (side by side, each one's explanation on the line below its button, #3995)
  const radio = (value, label, note, way = null) => {
    const on = value === how && (!way || way === via);
    const r = h('input', { type: 'radio', name: 'share-how', value: way ? `${value}-${way}` : value, 'data-field': `how-${way ? `${value}-${way}` : value}`, checked: on, disabled: value === 'live' && !!live });
    r.addEventListener('change', () => {
      if (!r.checked) return;
      if (value === how && way) { via = way; onVia(way); return; }   // (Live's other way, in Live's window)
      if (value !== how && !next) {
        wanted = value;
        next = openHow(value, { module, view, ...(way ? { via: way } : {}), shown: close });
        next.finally(close);   // (its window never shown, an error said: this one closed all the same)
      }
    });
    radios.push({ r, way });
    return h('label', { class: `share-how-${way ? `${value}-${way}` : value}`, title: value === 'live' && live ? live : '' }, r, label, h('span', { class: 'share-how-note' }, note));
  };
  const el = h('div', { class: `share-how${three ? ' share-how-three' : ''}` },
    h('label', {}, 'Share:'),
    h('div', { class: 'share-how-choices' },
      radio('copy', h('span', {}, 'A copy'), 'A link with the project in it'),
      ...(three
        ? [radio('live', h('span', {}, 'Live peer to peer (no relay)'), 'Others follow it as you work, with no setup', 'peer'),
          radio('live', h('span', {}, 'Live via your Cloudflare relay'), 'Others follow it as you work, on any network', 'relay')]
        // ('Live' is the Petri net's liveness elsewhere, Viva: this one's word given here)
        : [radio('live', h('span', { 'data-no-i18n': '' }, getLanguage() === 'pt' ? 'Em direto' : 'Live'), 'Others follow it as you work')])));
  return {
    el,
    get wanted() { return wanted; },
    switched: () => next,
    // (while shared, Live's other way cannot be chosen: its connection is made)
    lock: on => { for (const { r, way } of radios) if (way && way !== via) r.disabled = on || !!live; },
  };
}
