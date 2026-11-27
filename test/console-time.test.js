// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The time a console line was written (#5035): a message's time (core/message.js: made with it, its entry's of the
// Errors / Warnings tabs, its data for the MCP), shown as `14:03:27`, the day too for one of another day; a shared
// project's owner's lines carry theirs to its followers (core/collab-runs.js) and to the MCP's follow_project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMessage, lineMessage, entryOf, messageData, messageTime } from '../core/message.js';
import { runsActivity, followedRuns, runMessages } from '../core/collab-runs.js';

const at = (y, mo, d, h, mi, s) => new Date(y, mo - 1, d, h, mi, s).getTime();

test('#5035 messageTime: the local time of a line of the same day, the day and month too for one of another day', () => {
  const now = at(2026, 11, 20, 23, 59, 30);
  assert.equal(messageTime(at(2026, 11, 20, 14, 3, 27), now), '14:03:27');
  assert.equal(messageTime(at(2026, 11, 20, 0, 0, 0), now), '00:00:00');
  assert.equal(messageTime(at(2026, 11, 19, 23, 58, 1), now), '19/11 23:58:01');
  assert.equal(messageTime(at(2025, 11, 20, 9, 5, 7), now), '20/11 09:05:07');   // (the same day of another year: its day)
  assert.equal(messageTime(at(2026, 1, 2, 3, 4, 5), at(2026, 1, 3, 0, 0, 0)), '02/01 03:04:05');
  // no time: nothing
  for (const t of [undefined, null, -1, 1.5, NaN, '123', Infinity]) assert.equal(messageTime(t, now), '', String(t));
  // (now: its default)
  assert.match(messageTime(Date.now()), /^\d\d:\d\d:\d\d$/);
});

test('#5035 a message\'s time: kept when given (a whole number of ms), left out otherwise; its entry\'s and its data\'s', () => {
  const t = at(2026, 11, 20, 14, 3, 27);
  assert.equal(makeMessage({ text: 'x', time: t }).time, t);
  for (const bad of [undefined, null, -5, 2.5, 'now', NaN]) assert.equal('time' in makeMessage({ text: 'x', time: bad }), false, String(bad));
  // a line's message: its time beside its other fields
  const m = lineMessage('WARNING:Xst:737 - Found latch', { cls: 'warn', source: 'impl', time: t });
  assert.deepEqual(m, { severity: 'warning', source: 'impl', text: 'WARNING:Xst:737 - Found latch', tool: 'Xst:737', location: null, action: null, process: null, run: null, time: t });
  assert.deepEqual(entryOf(m), { severity: 'warning', tool: 'Xst:737', message: 'Found latch', file: null, line: 0, inText: false, src: 'impl', run: null, action: null, time: t });
  assert.equal(messageData(m).time, t);
  // none: as before
  assert.equal('time' in entryOf(lineMessage('ERROR: no', { cls: 'err' })), false);
  assert.equal('time' in messageData(lineMessage('hello')), false);
});

test('#5035 a shared project\'s runs: each line with the owner\'s time, kept by its follower; the MCP\'s follow_project\'s messages with it', () => {
  const t = at(2026, 11, 20, 14, 3, 27);
  const v = runsActivity({ id: 1, status: { synth: 'running' }, lines: [['Started : "Synthesize - XST".', 'hdr', 'impl', t], ['WARNING:Xst:737 - Found latch', 'warn', 'impl', t + 1000], ['no time', '', 'app']] });
  assert.deepEqual(v.lines, [['Started : "Synthesize - XST".', 'hdr', 'impl', t], ['WARNING:Xst:737 - Found latch', 'warn', 'impl', t + 1000], ['no time', '', 'app']]);
  const r = followedRuns(JSON.parse(JSON.stringify(v)));
  assert.deepEqual(r.lines, v.lines);
  // (untrusted: a time not one left out)
  assert.deepEqual(followedRuns({ id: 2, lines: [['a', '', 'app', 'soon'], ['b', '', 'app', -1], ['c', '', 'app', 1.5]] }).lines, [['a', '', 'app'], ['b', '', 'app'], ['c', '', 'app']]);
  assert.deepEqual(runMessages(r).map((m) => [m.text, m.time]), [['Started : "Synthesize - XST".', t], ['WARNING:Xst:737 - Found latch', t + 1000], ['no time', undefined]]);
});
