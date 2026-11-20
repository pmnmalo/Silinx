// A tool's result's label (#4738) for the tests that compare a tool's own data: its structured content without the label
// every tool that takes a project gets by default, an explicit label's nonce as 'N' (its note too); the label itself, its
// nonce and its default are test/mcp-untrusted.test.js's.
import { untrustedNote, PROJECT_UNTRUSTED as PROJECT_TEXT } from '../server/mcp-util.js';

export { PROJECT_TEXT };
const NONCE = /^\[End of untrusted content [0-9a-f]{16} /;
/** A label's note with its nonce as 'N' (untrustedNote(what, 'N')). */
export const noteN = t => (typeof t === 'string' ? t.replace(NONCE, '[End of untrusted content N ') : t);
/** The note of a label as the tests write it: untrustedNote(what, 'N'). */
export const NOTE = what => untrustedNote(what, 'N');
/** structuredContent without its default `untrusted` label; an explicit one with its nonce as 'N'. */
export function unlabelled(data) {
  if (!data?.untrusted) return data;
  const { untrusted, ...rest } = data;
  if (untrusted.content !== PROJECT_TEXT) return { ...rest, untrusted: { ...untrusted, nonce: 'N', note: noteN(untrusted.note) } };
  return Object.keys(rest).length ? rest : undefined;
}
/** A tool's whole result with the default label left out (its note and its structured content's) and an explicit
 *  label's nonce as 'N'. */
export function plain(r) {
  if (!r?.structuredContent?.untrusted) return r;
  const data = unlabelled(r.structuredContent);
  const content = data?.untrusted || r.structuredContent.untrusted.content !== PROJECT_TEXT
    ? r.content.map((c, i) => (i === r.content.length - 1 ? { ...c, text: noteN(c.text) } : c)) : r.content.slice(0, -1);
  const { structuredContent, ...rest } = r;
  return { ...rest, content, ...(data === undefined ? {} : { structuredContent: data }) };
}
