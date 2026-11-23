// The drawings' expression parser's errors in Portuguese (#5196): each error core/asm-expr.js gives, made by the parser
// itself from a text that has it, translated exactly; the column of a state diagram's; the Petri net's, the state
// diagram's and the ASM chart's messages that hold one, their reason translated too (an ASM chart's other reasons left
// as they are, the whole line in English).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCondition, parseAction, DRAWING_NESTING } from '../core/asm-expr.js';
import { newModel, validate } from '../core/asm.js';
import { newFsm, validateFsm } from '../core/fsm.js';
import { newPetri, validatePetri } from '../core/petri.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');
const { exprReason, EXPR_PT_PATTERNS } = await import('../web/js/i18n-expr.js');

const deep = '('.repeat(DRAWING_NESTING + 1) + 'a' + ')'.repeat(DRAWING_NESTING + 1);
// [the parser's result, its English (the parser's own), its Portuguese]
const CASES = [
  [parseCondition("4'bx1"), "x/z digits are not supported in literal 4'bx1", "os dígitos x/z não são suportados no literal 4'bx1"],
  [parseCondition("4'b21"), "invalid digits in literal 4'b21", "dígitos inválidos no literal 4'b21"],
  [parseCondition("0'b1"), "zero-width literal 0'b1", "literal de largura zero 0'b1"],
  [parseCondition('1.5'), "a condition has no real numbers ('.' is AND: a.b)", "uma condição não tem números reais ('.' é o E: a.b)"],
  [parseCondition('a == ""'), 'empty bit-string literal ""', 'literal de bits vazio ""'],
  [parseCondition('a == "102"'), 'bit-string literal "102" may only contain 0, 1 and _', 'o literal de bits "102" só pode ter 0, 1 e _'],
  [parseCondition("'a"), "unexpected ' (NOT after an operand: a')", "' inesperado (o NÃO depois de um operando: a')"],
  [parseCondition('a # b'), "unexpected character '#'", "carácter '#' inesperado"],
  [parseCondition('(a'), "expected ')' at end", "esperava-se ')' no fim"],
  [parseCondition('a[1 b'), "expected ']' near 'b'", "esperava-se ']' perto de 'b'"],
  [parseCondition('a[b]'), "bit index of 'a' must be a decimal number", "o índice de bit de 'a' tem de ser um número decimal"],
  [parseCondition('a[1:3]'), 'slice a[1:3]: the left index must be the higher one', 'fatia a[1:3]: o índice da esquerda tem de ser o maior'],
  [parseCondition(deep), `expression nested more than ${DRAWING_NESTING} levels deep (parentheses, operators)`, `expressão aninhada em mais de ${DRAWING_NESTING} níveis (parênteses, operadores)`],
  [parseCondition('a &'), 'unexpected end of expression', 'fim inesperado da expressão'],
  [parseCondition('a / b'), "unexpected '/' (a condition has no division: '/' before an operand is NOT, /a)", "'/' inesperado (uma condição não tem divisão: '/' antes de um operando é o NÃO, /a)"],
  [parseCondition('a b'), "unexpected 'b' (an operator missing before it: a && b, a.b)", "'b' inesperado (falta um operador antes dele: a && b, a.b)"],
  [parseCondition('a & )'), "unexpected ')'", "')' inesperado"],
  [parseCondition('  '), 'empty condition', 'condição vazia'],
  [parseAction('= 1'), 'an action must start with an output or register name', 'uma ação tem de começar pelo nome de uma saída ou de um registo'],
  [parseAction('z 1'), "expected '=' after 'z'", "esperava-se '=' depois de 'z'"],
];

test('#5196 each error of the expression parser, made by it, in Portuguese', () => {
  for (const [r, en, pt] of CASES) {
    assert.equal(r.error, en);
    assert.equal(t(en), pt);
    assert.equal(exprReason(en), pt);
  }
  // (each pattern of the module made by one of them)
  assert.deepEqual(EXPR_PT_PATTERNS.filter(([re]) => !CASES.some(([, en]) => re.test(en))).map(([re]) => String(re)), []);
});

test('#5196 a state diagram\'s column; a text that is no parser\'s error as it is', () => {
  assert.equal(exprReason('column 4: unexpected end of expression'), 'coluna 4: fim inesperado da expressão');
  assert.equal(exprReason("'q' is not an input"), "'q' is not an input");
  assert.equal(exprReason('column 2: something else'), 'column 2: something else');
});

test('#5196 the editors\' messages that hold a parser\'s error: the reason translated too', () => {
  const p = newPetri('ctl');
  p.transitions[0].guard = 'go &';
  assert.deepEqual(validatePetri(p).map((d) => [d.severity, t(d.message)]), [['error', "transição start: guarda 'go &': fim inesperado da expressão"]]);
  const f = newFsm('ctl');
  f.transitions[0].cond = 'x &';
  assert.deepEqual(validateFsm(f).map((d) => [d.severity, t(d.message)]), [['error', "Transição S0 → S1: a condição 'x &' não é válida (coluna 4: fim inesperado da expressão)"]]);
  const a = newModel('ctl', 'vhdl');
  a.nodes.find((n) => n.id === 'd1').cond = 'start &';
  a.nodes.find((n) => n.id === 's1').actions = ['ready = (1'];
  assert.deepEqual(validate(a).map((d) => [d.severity, t(d.message)]), [
    ['error', "Ação 'ready = (1' do estado 'IDLE': esperava-se ')' no fim"],
    ['error', "Decisão 'start &': fim inesperado da expressão"],
  ]);
  assert.equal(t("Conditional output action 'z =': unexpected end of expression"), "Ação 'z =' da saída condicional: fim inesperado da expressão");
  assert.equal(t("Every-cycle block 'B' action '= 1': an action must start with an output or register name"), "Ação '= 1' do bloco de cada ciclo 'B': uma ação tem de começar pelo nome de uma saída ou de um registo");
  // (an ASM chart's other reason: the line as it is, not half in Portuguese)
  assert.equal(t("Decision 'q': 'q' is not an input"), "Decision 'q': 'q' is not an input");
  assert.equal(t("Case 'op': add an 'others' exit (the values of a 32-bit expression cannot all be listed)"), "Case 'op': add an 'others' exit (the values of a 32-bit expression cannot all be listed)");
});
