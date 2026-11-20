// The circuit editor's keys (web/js/circuit-keys.js, #4945: moved out of mountCircuitEditor as they were), mounted alone
// on a stand-in root: each key's action, Esc's three cases, a field's keys left alone, a read-only editor's edits ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountCircuitKeys } from '../web/js/circuit-keys.js';

// a root, the editor's state and a log of what its functions were called with
function mount({ readOnly = false, sel = null, sim = false, tool = 'select', draft = null } = {}) {
  const root = new EventTarget(), log = [];
  const f = (name) => (...a) => log.push(a.length ? `${name}(${a.join(',')})` : name);
  mountCircuitKeys({ root, readOnly, sel: () => sel, sim: () => sim, tool: () => tool, draft: () => draft,
    clip: { copy: f('copy'), pasteKey: f('pasteKey') }, undo: f('undo'), redo: f('redo'), deleteSelection: f('delete'), stopSim: f('stopSim'),
    endWire: f('endWire'), setTool: f('setTool'), rotateSelection: f('rotate'), zoomBtn: f('zoom'), fit: f('fit') });
  // (a key pressed: on the root, or on a field, tagName)
  const press = (key, { ctrl = false, shift = false, tag = 'DIV' } = {}) => {
    const e = new Event('keydown');
    Object.assign(e, { key, ctrlKey: ctrl, metaKey: false, shiftKey: shift });
    let prevented = false;
    e.preventDefault = () => { prevented = true; };
    Object.defineProperty(e, 'target', { value: { tagName: tag } });
    root.dispatchEvent(e);
    return prevented;
  };
  return { press, log };
}

test('the circuit editor\'s keys: undo, redo, delete, copy and cut a part, paste, turn, zoom, fit', () => {
  const k = mount({ sel: { kind: 'part', id: 'U1' } });
  assert.equal(k.press('z', { ctrl: true }), true);
  k.press('Z', { ctrl: true, shift: true }); k.press('y', { ctrl: true });
  k.press('Delete'); k.press('Backspace');
  k.press('c', { ctrl: true }); k.press('x', { ctrl: true }); k.press('v', { ctrl: true });
  k.press('r'); k.press('+'); k.press('='); k.press('-'); k.press('f');
  assert.deepEqual(k.log, ['undo', 'redo', 'redo', 'delete', 'delete', 'copy(false)', 'copy(true)', 'pasteKey', 'rotate', 'zoom(1.25)', 'zoom(1.25)', 'zoom(0.8)', 'fit']);
  // (a wire selected: no copy; other keys nothing)
  const w = mount({ sel: { kind: 'wire', id: 'w1' } });
  assert.equal(w.press('c', { ctrl: true }), false);
  w.press('q'); w.press('r', { ctrl: true });
  assert.deepEqual(w.log, []);
});

test('Esc: Try it stopped, a wire being drawn ended, else the Select tool', () => {
  const a = mount({ sim: true, tool: 'wire', draft: [[0, 0], [1, 0]] }); a.press('Escape');
  const b = mount({ tool: 'wire', draft: [[0, 0], [1, 0]] }); b.press('Escape');
  const c = mount({ tool: 'wire', draft: [[0, 0]] }); c.press('Escape');
  assert.deepEqual([a.log, b.log, c.log], [['stopSim'], ['endWire'], ['setTool(select)']]);
});

test('a field\'s keys left alone; a read-only editor\'s edits ignored, its copy, zoom and fit kept', () => {
  const k = mount({ sel: { kind: 'part', id: 'U1' } });
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) { k.press('Delete', { tag }); k.press('z', { ctrl: true, tag }); }
  assert.deepEqual(k.log, []);
  const r = mount({ readOnly: true, sel: { kind: 'part', id: 'U1' } });
  for (const key of ['z', 'y', 'x', 'v', 'c']) r.press(key, { ctrl: true });
  r.press('Delete'); r.press('Backspace'); r.press('r'); r.press('R');
  r.press('+'); r.press('f');
  assert.deepEqual(r.log, ['copy(false)', 'zoom(1.25)', 'fit'], 'a copy kept (Ctrl+C)');
});
