// The MCP server's protocol rules (#4752, server/mcp-protocol.js, server/mcp-aliases.js, server/mcp-args.js): the versions
// it speaks (an unknown one answered with the newest), JSON-RPC batches in 2025-03-26 only, initialize before any request
// but ping, a message's size (one line, never read whole past its limit), a renamed argument's old name accepted and said
// deprecated, a string's length and pattern checked; on the server's streams too (serveMcp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { PROTOCOL_VERSIONS, MAX_LINE, negotiate, sessionRefusal, readLines } from '../server/mcp-protocol.js';
import { ALIASES, withAliases } from '../server/mcp-aliases.js';
import { schemaErrors } from '../server/mcp-args.js';

test('#4752 the versions: the one asked when spoken, else the newest', () => {
  assert.deepEqual(PROTOCOL_VERSIONS, ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
  for (const v of PROTOCOL_VERSIONS) assert.equal(negotiate(v), v);
  for (const v of ['1999-01-01', undefined, 42]) assert.equal(negotiate(v), '2025-11-25');
});

test('#4752 the session\'s refusals: initialize first (ping allowed), batches only in 2025-03-26, an empty batch', () => {
  const fresh = {};
  assert.deepEqual(sessionRefusal({ jsonrpc: '2.0', id: 1, method: 'tools/call' }, fresh), { code: -32002, message: 'not initialized: send initialize first' });
  assert.deepEqual(sessionRefusal({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, fresh).code, -32002);
  for (const method of ['initialize', 'ping']) assert.equal(sessionRefusal({ jsonrpc: '2.0', id: 1, method }, fresh), null, method);
  assert.equal(sessionRefusal({ jsonrpc: '2.0', method: 'notifications/initialized' }, fresh), null);
  const batch = [{ jsonrpc: '2.0', id: 1, method: 'ping' }];
  assert.match(sessionRefusal(batch, fresh).message, /^not initialized/);
  assert.match(sessionRefusal(batch, { initialized: true, protocolVersion: '2025-06-18' }).message, /^batches are not part of protocol version 2025-06-18 \(2025-03-26's only\)/);
  assert.match(sessionRefusal(batch, { initialized: true, protocolVersion: '2025-11-25' }).message, /2025-11-25/);
  assert.equal(sessionRefusal(batch, { initialized: true, protocolVersion: '2025-03-26' }), null);
  assert.deepEqual(sessionRefusal([], { initialized: true, protocolVersion: '2025-03-26' }), { code: -32600, message: 'invalid request: an empty batch' });
  assert.equal(sessionRefusal({ jsonrpc: '2.0', id: 2, method: 'tools/call' }, { initialized: true, protocolVersion: '2025-06-18' }), null);
});

test('#4752 readLines: lines split across chunks, CR LF, the last line with no LF; a line past the limit skipped and said once', async () => {
  const input = new PassThrough(), lines = [];
  let long = 0, ended;
  const end = new Promise(r => { ended = r; });
  readLines(input, { onLine: l => lines.push(l), onTooLong: () => long++, onEnd: ended, max: 10 });
  input.write('ab');
  input.write('c\r\nde\n');
  input.write('0123456789X');   // (past 10, no LF yet: skipped)
  input.write('YZ more of it\nok\n');
  input.write('0123456789012\nlast');   // (past 10 in one chunk)
  input.end();
  await end;
  assert.deepEqual(lines, ['abc', 'de', 'ok', 'last']);
  assert.equal(long, 2);
  assert.ok(MAX_LINE >= 16 * 1024 * 1024, 'a large source still fits');
});

test('#4752 the deprecated arguments: the old name\'s value given to the new one, said; both given or a wrong value refused', () => {
  const np = { name: 'new_project' }, sdp = { name: 'set_design_properties' };
  assert.deepEqual(withAliases(np, { name: 'a', design_only: true }), { args: { name: 'a', profile: 'logic' }, warnings: ['WARNING: design_only is deprecated (#4103): give profile (true is profile logic).'] });
  assert.deepEqual(withAliases(sdp, { project: 'a', design_only: false }).args, { project: 'a', profile: 'fpga' });
  // (kind, the profile's name of before #5440: design is logic)
  assert.deepEqual(withAliases(np, { name: 'a', kind: 'design' }), { args: { name: 'a', profile: 'logic' }, warnings: ['WARNING: kind is deprecated (#5440): give profile (design is profile logic, fpga and system the same).'] });
  assert.deepEqual(withAliases(sdp, { project: 'a', kind: 'fpga' }).args, { project: 'a', profile: 'fpga' });
  assert.equal(withAliases(np, { name: 'a', kind: 'robot' }).error, 'new_project: kind: one of fpga, design, system');
  assert.equal(withAliases(np, { name: 'a', profile: 'fpga', design_only: true }).error, 'new_project: give profile, not design_only too (design_only is profile\'s deprecated alias)');
  assert.equal(withAliases(np, { name: 'a', design_only: 'yes' }).error, 'new_project: design_only: true or false');
  // (another tool's argument of that name: not an alias of its)
  assert.deepEqual(withAliases({ name: 'list_projects' }, { design_only: true }), { args: { design_only: true }, warnings: [] });
  for (const a of ALIASES) assert.match(a.since, /^#\d+$/, a.from);
});

test('#4752 a string\'s length and pattern checked', () => {
  const S = { type: 'string', minLength: 1, maxLength: 5, pattern: '^[a-z]+$' };
  assert.deepEqual(schemaErrors('abc', S, 'x'), []);
  assert.deepEqual(schemaErrors('', S, 'x'), ['x: at least 1 character(s)']);
  assert.deepEqual(schemaErrors('abcdef', S, 'x'), ['x: at most 5 character(s)']);
  assert.deepEqual(schemaErrors('ab1', S, 'x'), ['x: matching ^[a-z]+$']);
  // (only a string's: a number's length is none)
  assert.deepEqual(schemaErrors(123456, { type: ['string', 'number'], maxLength: 2 }, 'x'), []);
});
