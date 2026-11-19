// web/js/silent-answer.js (#4694): an answer awaited with a deadline for saying it has not come.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onSilence } from '../web/js/silent-answer.js';

const later = (ms, v) => new Promise(ok => setTimeout(() => ok(v), ms));

test('an answer in time: its value, nothing said', async () => {
  let said = 0;
  assert.equal(await onSilence(later(10, 'granted'), 200, () => said++), 'granted');
  await later(250);
  assert.equal(said, 0, 'the timer cleared');
});

test('an answer after the deadline: said once, then its value', async () => {
  let said = 0;
  const p = onSilence(later(120, true), 30, () => said++);
  await later(60);
  assert.equal(said, 1);
  assert.equal(await p, true);
  assert.equal(said, 1);
});

test('no answer: said once, the wait goes on', async () => {
  let said = 0;
  const p = onSilence(new Promise(() => {}), 20, () => said++);
  let settled = false; p.then(() => { settled = true; });
  await later(100);
  assert.equal(said, 1);
  assert.equal(settled, false);
});

test('a value that is not a promise, or undefined (nothing was late): at once, nothing said', async () => {
  let said = 0;
  assert.equal(await onSilence(undefined, 20, () => said++), undefined);
  assert.equal(await onSilence(false, 20, () => said++), false);
  await later(50);
  assert.equal(said, 0);
});

test('a refusal in time: rejected, nothing said', async () => {
  let said = 0;
  await assert.rejects(onSilence(Promise.reject(new Error('no')), 20, () => said++), /no/);
  await later(50);
  assert.equal(said, 0);
});
