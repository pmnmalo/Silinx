// A phone's editors (#5121): on a phone (PHONE_QUERY of web/js/narrow.js, under 600 px) a document is read, simulated
// and tried out, not edited: an editor opened there opens read only, as a followed project's (#3181), with the
// read-only notice at the right end of its toolbar (docs/UI-GUIDELINES.md), its tip saying where to edit it. Opened
// again on a wider screen (a tablet, a computer, the phone turned so), it edits.

import { h } from './ui.js';
import { isPhone } from './narrow.js';

/** The phone's read-only notice for an editor's toolbar; null on a wider screen. */
export const phoneNotice = () => (isPhone()
  ? h('span', { class: 'gen-banner read-only', 'data-phone-notice': '', title: 'Edit it on a tablet or a computer' }, 'Read-only on a phone')
  : null);

/** A drawing editor's options on a phone (read only, its Try it kept, the notice); null on a wider screen. */
export const phoneOnly = () => (isPhone() ? { readOnly: true, simulate: true, banner: phoneNotice() } : null);
