// Unit tests (#4765): web/js/i18n-general.js, the general Portuguese dictionary moved out of web/js/i18n.js: the
// Portuguese locale's strings (i18n.js adds the areas' dictionaries to it, what it has not), and i18n.js's exports as
// before the move.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { PT } = await import('../web/js/i18n-general.js');
const i18n = await import('../web/js/i18n.js');

test('i18n-general.js: the general dictionary is the Portuguese locale\'s, the areas\' dictionaries added to it', async () => {
  assert.equal(i18n.LOCALES.pt.strings, PT);
  assert.equal(PT.Development, 'Desenvolvimento');
  // (an area's string, one the general dictionary did not have)
  const { TT_PT } = await import('../web/js/i18n-truthtable.js');
  const [k, v] = Object.entries(TT_PT)[0];
  assert.equal(PT[k], v);
  assert.ok(Object.keys(PT).length > 2000, `${Object.keys(PT).length} strings`);
});

test('i18n.js still exports what it did before the move (#4765)', () => {
  assert.deepEqual(Object.keys(i18n).sort(), ['LOCALES', 'getLanguage', 'onLanguageChange', 'setLanguage', 'startI18n', 't']);
  assert.equal(i18n.t('Development'), 'Development', 'English until the language changes');
});
