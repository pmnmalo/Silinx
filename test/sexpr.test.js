// S-expressions as KiCad's files write them (#4279): core/sexpr.js's parser, its error paths and its limits
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSexpr, SEXPR_LIMITS, head, all, one, num, flag } from '../core/sexpr.js';

test('parseSexpr: lists, bare tokens, quoted strings with their escapes, comments of no kind', () => {
  assert.deepEqual(parseSexpr('(a b (c "d e" 1.5 -2) ())'), [['a', 'b', ['c', 'd e', '1.5', '-2'], []]]);
  assert.deepEqual(parseSexpr('(s "a \\"q\\" \\\\ b\\nc\\td" "")'), [['s', 'a "q" \\ b\nc\td', '']]);
  assert.deepEqual(parseSexpr('(x "(not a list)")(y)'), [['x', '(not a list)'], ['y']]);
  assert.deepEqual(parseSexpr('\r\n\t(a\r\n\tb)\f'), [['a', 'b']]);
  assert.deepEqual(parseSexpr('(u "Ω ≥ ✓ ~{RST}")'), [['u', 'Ω ≥ ✓ ~{RST}']]);
  assert.deepEqual(parseSexpr('(a"b"c)'), [['a', 'b', 'c']], 'a string ends a token');
  assert.deepEqual(parseSexpr(''), []);
  assert.deepEqual(parseSexpr('(a "multi\nline")\n(b)'), [['a', 'multi\nline'], ['b']]);
});

test('parseSexpr: a malformed text throws with its line', () => {
  assert.throws(() => parseSexpr('(a\n(b c)\n'), /^Error: line 1: a "\(" not closed$/);
  assert.throws(() => parseSexpr('(a)\n(b))'), /^Error: line 2: a "\)" with no "\(" before it$/);
  assert.throws(() => parseSexpr('(a\n "never closed)'), /^Error: line 2: a string not closed$/);
  assert.throws(() => parseSexpr('stray (a)'), /^Error: a token outside any list: stray$/);
  assert.throws(() => parseSexpr('(a) "s"'), /^Error: a token outside any list: s$/);
});

test('parseSexpr: the limits of size, depth and tokens', () => {
  assert.deepEqual(SEXPR_LIMITS, { maxBytes: 32 * 1024 * 1024, maxDepth: 64, maxTokens: 8_000_000 });
  assert.throws(() => parseSexpr('(a b c)', { maxBytes: 6 }), /^Error: the file is too large: 7 characters \(at most 6\)$/);
  assert.deepEqual(parseSexpr('(a b c)', { maxBytes: 7 }), [['a', 'b', 'c']]);
  assert.equal(parseSexpr(`${'('.repeat(64)}${')'.repeat(64)}`).length, 1, '64 levels: the limit');
  assert.throws(() => parseSexpr(`${'('.repeat(65)}${')'.repeat(65)}`), /^Error: line 1: the lists are nested too deep \(at most 64\)$/);
  assert.throws(() => parseSexpr('(a\n(b (c)))', { maxDepth: 2 }), /^Error: line 2: the lists are nested too deep \(at most 2\)$/);
  assert.throws(() => parseSexpr('(a b c)', { maxTokens: 3 }), /^Error: the file has too many tokens \(at most 3\)$/);
  assert.deepEqual(parseSexpr('(a b c)', { maxTokens: 4 }), [['a', 'b', 'c']], 'a list and its three atoms: 4 tokens');
  // a deep text no longer throws a RangeError of the stack: the parser has no recursion
  assert.throws(() => parseSexpr('('.repeat(200000)), /nested too deep/);
});

test('head, all, one, num, flag: reading the lists', () => {
  const [l] = parseSexpr('(pin input line (at 1 -2.5 90) (name "A") (name "B") hide (hide yes) (length x))');
  assert.equal(head(l), 'pin');
  assert.equal(head('atom'), null);
  assert.equal(head([['x']]), null);
  assert.deepEqual(one(l, 'at'), ['at', '1', '-2.5', '90']);
  assert.equal(one(l, 'nothing'), null);
  assert.equal(one(null, 'at'), null);
  assert.deepEqual(all(l, 'name').map((x) => x[1]), ['A', 'B']);
  assert.deepEqual(all(undefined, 'name'), []);
  assert.equal(num('-2.5'), -2.5);
  assert.equal(num('1e3'), 1000);
  assert.equal(num('x'), 0);
  assert.equal(num('x', NaN), NaN);
  assert.equal(num(undefined, 7), 7);
  assert.equal(num('  '), 0);
  const [k6] = parseSexpr('(effects (font) hide)'), [k8] = parseSexpr('(effects (font) (hide yes))'), [no] = parseSexpr('(effects (font) (hide no))');
  assert.equal(flag(k6, 'hide'), true);
  assert.equal(flag(k8, 'hide'), true);
  assert.equal(flag(no, 'hide'), false);
  assert.equal(flag(parseSexpr('(power)')[0], 'power'), false, 'the keyword is not a flag');
  assert.equal(flag(parseSexpr('(x (power))')[0], 'power'), true);
  assert.equal(flag(null, 'hide'), false);
});
