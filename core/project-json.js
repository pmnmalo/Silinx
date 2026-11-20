// A project's description, silinx.json, read from its text (#4755): a byte order mark at its start (an editor's on
// Windows, a file saved as "UTF-8 with BOM") is not part of the JSON and is skipped, as the ISE files' readers do
// (core/isesch.js). What is not JSON throws, its parser's message kept: the caller says which project it was.

/** The description in `text` (a silinx.json), its byte order mark skipped -> its object; throws a SyntaxError. */
export function parseDescription(text) {
  const s = String(text);
  return JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
}
