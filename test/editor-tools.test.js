// The drawing editors' tools (#3971, web/js/editor-tools.js): one tool pressed (.active, aria-pressed), the canvas's
// adding class while an add tool is on, none without a canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressTool } from '../web/js/editor-tools.js';

const el = () => {
  const cls = new Set(), attrs = {};
  return { cls, attrs, classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) }, setAttribute: (k, v) => { attrs[k] = v; } };
};
const look = (tools) => Object.entries(tools).map(([k, b]) => [k, b.cls.has('active'), b.attrs['aria-pressed']]);

test('#3971 pressTool: the tool pressed, the others not; the canvas adding unless the arrow', () => {
  const tools = { select: el(), state: el(), decision: el() }, canvas = el();
  pressTool(tools, 'state', canvas, 'adding');
  assert.deepEqual(look(tools), [['select', false, 'false'], ['state', true, 'true'], ['decision', false, 'false']]);
  assert.deepEqual([...canvas.cls], ['adding']);
  pressTool(tools, 'decision', canvas, 'adding');
  assert.deepEqual(look(tools), [['select', false, 'false'], ['state', false, 'false'], ['decision', true, 'true']]);
  assert.deepEqual([...canvas.cls], ['adding']);
  pressTool(tools, 'select', canvas, 'adding');
  assert.deepEqual(look(tools), [['select', true, 'true'], ['state', false, 'false'], ['decision', false, 'false']]);
  assert.deepEqual([...canvas.cls], []);
});

test('#3971 pressTool: no canvas (the toolbar built first), an unknown tool pressing none', () => {
  const tools = { select: el(), place: el() };
  pressTool(tools, 'select');
  assert.deepEqual(look(tools), [['select', true, 'true'], ['place', false, 'false']]);
  pressTool(tools, 'nothing', el(), 'pn-adding');
  assert.deepEqual(look(tools), [['select', false, 'false'], ['place', false, 'false']]);
});
