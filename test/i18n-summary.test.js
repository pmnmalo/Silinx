// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The Design Summary's Portuguese patterns (web/js/i18n-summary.js, #4518), tried before every other pattern of
// web/js/i18n.js, translate its rows and nothing else: a wizard's parameter message ("Number of states (N): a whole
// number…") keeps its own translation (#4829: it came out as "Número de states (N, even): …").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FSM_TEMPLATES, ASM_TEMPLATES, PETRI_TEMPLATES, SCH_TEMPLATES, templateDefaults, templateError } from '../core/chart-templates.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');

test('#4829 the templates\' parameter messages translated whole, the Design Summary\'s patterns not taking them', () => {
  assert.equal(t(templateError('fsm', 'johnson', { n: '70' })), 'Número de estados (N, par): um número inteiro de 2 a 64.');
  assert.equal(t(templateError('fsm', 'counter', { n: '1' })), 'Número de estados (N): um número inteiro de 2 a 64.');
  // every numeric parameter of every template out of range: its message has no English left
  let n = 0;
  for (const [kind, list] of [['fsm', FSM_TEMPLATES], ['asm', ASM_TEMPLATES], ['petri', PETRI_TEMPLATES], ['sch', SCH_TEMPLATES]]) {
    for (const tp of list) {
      for (const p of tp.params || []) {
        if (p.options || p.key === 'pattern') continue;
        const msg = templateError(kind, tp.id, { ...templateDefaults(kind, tp.id), [p.key]: String(p.max + 1) });
        assert.match(msg, /: a whole number from -?\d+ to -?\d+\.$/, `${kind} ${tp.id} ${p.key}`);
        assert.match(t(msg), /: um número inteiro de -?\d+ a -?\d+\.$/, `${kind} ${tp.id}: ${t(msg)}`);
        assert.doesNotMatch(t(msg), /\b(Number|states|even|places|Clocks)\b/, `${kind} ${tp.id}: ${t(msg)}`);
        n++;
      }
    }
  }
  assert.ok(n >= 10, `${n} parameters`);
});

test('#4518 the Design Summary\'s utilization rows still in Portuguese, a resource of no translation kept as the report\'s', () => {
  assert.equal(t('Number of Slice Flip Flops'), 'Número de Flip Flops de Slice');
  assert.equal(t('Total Number of 4 input LUTs'), 'Número total de LUTs de 4 entradas');
  assert.equal(t('Number of RAMB16s'), 'Número de RAMB16s');
});
