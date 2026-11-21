// Bytes as base64 and base64url, one copy (#4772: the shared project's modules, the design link, the gist link, the
// GitHub API and the page's server calls each had their own). By chunks of 32 KiB: a document's state or a design is too
// large for one String.fromCharCode call. base64url has no padding when written and takes it or not when read (atob
// accepts both). The checks a caller makes on the text (its characters, its length) stay the caller's. No Node or DOM
// API but btoa / atob (globals of the browser, of Node and of a worker).

/** Bytes (a Uint8Array) as base64, padded. */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Base64 -> its bytes (a Uint8Array); atob's error on a text that is not base64. */
export const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

/** Bytes as base64url, no padding (a key's text, a room's id, a link's design). */
export const toBase64url = bytes => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Base64url, padded or not -> its bytes. */
export const fromBase64url = text =>
  fromBase64(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
