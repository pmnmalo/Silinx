// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The MCP protocol's rules of a session (server/mcp.js serveMcp, #4752): the versions the server speaks and what each
// allows (JSON-RPC batches: 2025-03-26's only, removed by 2025-06-18), initialize before anything but ping, and the size
// of a message (one line of stdin, never read whole past MAX_LINE).

/** The protocol versions the server speaks, the newest first: an initialize asking another gets the newest. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
// the versions with JSON-RPC batches (an array of requests on one line)
const BATCHES = new Set(['2025-03-26']);
/** The longest message (a line of stdin), in characters: a write_file of a large source fits, a runaway client does not. */
export const MAX_LINE = 32 * 1024 * 1024;

/** The version an initialize asking `asked` gets: that one when the server speaks it, else the newest. */
export const negotiate = asked => (PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0]);

/** Why a session refuses a message before it is handled (state: the session's, { initialized, protocolVersion }): a batch
 *  where its version has none, a request other than initialize and ping before initialize; null: handled. The refusal is
 *  a JSON-RPC error { code, message }. */
export function sessionRefusal(msg, state) {
  if (Array.isArray(msg)) {
    if (!msg.length) return { code: -32600, message: 'invalid request: an empty batch' };
    if (!state.initialized) return { code: -32600, message: 'not initialized: send initialize first, alone' };
    if (!BATCHES.has(state.protocolVersion)) return { code: -32600, message: `batches are not part of protocol version ${state.protocolVersion} (2025-03-26's only): send one request a line` };
    return null;
  }
  if (!msg || typeof msg !== 'object' || msg.id === undefined || msg.id === null) return null;   // (a notification: nothing to answer)
  if (!state.initialized && msg.method !== 'initialize' && msg.method !== 'ping') return { code: -32002, message: 'not initialized: send initialize first' };
  return null;
}

/** The lines of a stream (stdin): onLine(line) for each, a CR before its LF dropped; a line longer than `max` characters
 *  not kept (what it held is skipped up to its end) and said by onTooLong() once; onEnd() when the stream ends. */
export function readLines(input, { onLine, onTooLong, onEnd, max = MAX_LINE }) {
  let buf = '', skipping = false;
  input.setEncoding?.('utf8');
  input.on('data', chunk => {
    let rest = String(chunk);
    for (;;) {
      const nl = rest.indexOf('\n');
      if (nl < 0) {
        if (!skipping && buf.length + rest.length > max) { skipping = true; buf = ''; onTooLong(); }
        if (!skipping) buf += rest;
        return;
      }
      const piece = rest.slice(0, nl);
      rest = rest.slice(nl + 1);
      if (skipping) { skipping = false; continue; }
      if (buf.length + piece.length > max) { buf = ''; onTooLong(); continue; }
      const line = buf + piece;
      buf = '';
      onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
    }
  });
  input.on('end', () => { if (buf && !skipping) onLine(buf); buf = ''; onEnd?.(); });
}
