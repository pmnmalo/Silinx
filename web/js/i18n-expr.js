// Portuguese strings of the drawings' expression parser's errors (core/asm-expr.js: an ASM chart's, a state diagram's,
// a Petri net's condition or action; merged into the dictionary of i18n.js), and exprReason: such an error translated
// inside the editors' own messages (i18n-petri.js, i18n-fsm.js, i18n-asm below: "transition t1: guard 'go &': …", #5196).
export const EXPR_PT_PATTERNS = [
  [/^x\/z digits are not supported in literal (.+)$/, 'os dígitos x/z não são suportados no literal $1'],
  [/^invalid digits in literal (.+)$/, 'dígitos inválidos no literal $1'],
  [/^zero-width literal (.+)$/, 'literal de largura zero $1'],
  [/^a condition has no real numbers \('\.' is AND: a\.b\)$/, "uma condição não tem números reais ('.' é o E: a.b)"],
  [/^empty bit-string literal ""$/, 'literal de bits vazio ""'],
  [/^bit-string literal (.+) may only contain 0, 1 and _$/, 'o literal de bits $1 só pode ter 0, 1 e _'],
  [/^unexpected ' \(NOT after an operand: a'\)$/, "' inesperado (o NÃO depois de um operando: a')"],
  [/^unexpected character '(.*)'$/, "carácter '$1' inesperado"],
  [/^expected '(.*)' at end$/, "esperava-se '$1' no fim"],
  [/^expected '(.*)' near '(.*)'$/, "esperava-se '$1' perto de '$2'"],
  [/^bit index of '(.*)' must be a decimal number$/, "o índice de bit de '$1' tem de ser um número decimal"],
  [/^slice (.+): the left index must be the higher one$/, 'fatia $1: o índice da esquerda tem de ser o maior'],
  [/^expression nested more than (\d+) levels deep \(parentheses, operators\)$/, 'expressão aninhada em mais de $1 níveis (parênteses, operadores)'],
  [/^unexpected end of expression$/, 'fim inesperado da expressão'],
  [/^unexpected '\/' \(a condition has no division: '\/' before an operand is NOT, \/a\)$/, "'/' inesperado (uma condição não tem divisão: '/' antes de um operando é o NÃO, /a)"],
  [/^unexpected '(.*)' \(an operator missing before it: a && b, a\.b\)$/, "'$1' inesperado (falta um operador antes dele: a && b, a.b)"],
  [/^unexpected '(.*)'$/, "'$1' inesperado"],
  [/^empty condition$/, 'condição vazia'],
  [/^an action must start with an output or register name$/, 'uma ação tem de começar pelo nome de uma saída ou de um registo'],
  [/^expected '=' after '(.*)'$/, "esperava-se '=' depois de '$1'"],
];

/** A parser's error in Portuguese, its "column N: " too (the state diagram's); another text as it is. */
export function exprReason(text) {
  const m = /^column (\d+): ([\s\S]*)$/.exec(text);
  const [col, reason] = m ? [`coluna ${m[1]}: `, m[2]] : ['', text];
  const p = EXPR_PT_PATTERNS.find(([re]) => re.test(reason));
  return p ? col + reason.replace(p[0], p[1]) : text;
}

// the ASM chart's messages that hold a parser's error (core/asm.js's checks): translated only when theirs is one (the
// line as it is otherwise, its other reasons not half in Portuguese)
const ifExpr = (m, r, pt) => { const x = exprReason(r); return x === r ? m : pt(x); };
export const ASM_EXPR_PT_PATTERNS = [
  [/^Decision '(.*?)': ([\s\S]+)$/, (m, c, r) => ifExpr(m, r, (x) => `Decisão '${c}': ${x}`)],
  [/^Case '(.*?)': ([\s\S]+)$/, (m, c, r) => ifExpr(m, r, (x) => `Caso '${c}': ${x}`)],
  [/^(State|Every-cycle block) '(.*?)' action '(.*?)': ([\s\S]+)$/,
    (m, k, n, a, r) => ifExpr(m, r, (x) => `Ação '${a}' ${k === 'State' ? 'do estado' : 'do bloco de cada ciclo'} '${n}': ${x}`)],
  [/^Conditional output action '(.*?)': ([\s\S]+)$/, (m, a, r) => ifExpr(m, r, (x) => `Ação '${a}' da saída condicional: ${x}`)],
];
