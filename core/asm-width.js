// Silinx ASM charts - a register's width given by an expression of the chart's generics (#4378): `clog2(DEBOUNCE)`,
// `N + 1`, `2 * K`. Its syntax (integers, generics, + - * /, parentheses, clog2(n)), its value at the generics' values
// and its code, the same in VHDL and in Verilog: clog2 is a constant function the generated module declares (XST
// supports constant functions in VHDL and in Verilog, not Verilog's $clog2). Isomorphic ES module.

/** clog2(n): the bits that count 0 .. n-1, at least 1 (the examples' constant function: 1 for n <= 2). */
export const clog2 = (n) => {
  let r = 0;
  for (let x = n - 1; x > 0; x = Math.floor(x / 2)) r++;
  return Math.max(1, r);
};

/** A register's width as the model keeps it: a number, or the text of an expression (a number's text is a number). */
export function widthValue(v, d = 1) {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return d;
    return /^\d+$/.test(t) ? Number(t) : t;
  }
  return Number.isFinite(Number(v)) ? Number(v) : d;
}

/** True for a width given by an expression (not a number). */
export const isWidthExpr = (w) => typeof w === 'string';

const TOKEN = /\s*(?:(\d+)|([A-Za-z][A-Za-z0-9_]*)|([-+*/()]))/y;

/** Parse a width expression: { ast } or { error }. ast: { k: 'num', v } | { k: 'id', name } | { k: 'clog2', a } | { k: 'bin', op, a, b }. */
export function parseWidth(text) {
  const toks = [];
  const src = String(text ?? '');
  TOKEN.lastIndex = 0;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(src);
    if (!m) return { error: `unexpected '${src.slice(i).trim()[0]}'` };
    toks.push(m[1] != null ? { t: 'num', v: Number(m[1]) } : m[2] != null ? { t: 'id', v: m[2] } : { t: 'op', v: m[3] });
    i = TOKEN.lastIndex;
  }
  if (!toks.length) return { error: 'no expression' };
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error(`'${v}' expected`); p++; };
  function factor() {
    const tk = toks[p++];
    if (!tk) throw new Error('the expression ends too soon');
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'id') {
      if (tk.v.toLowerCase() !== 'clog2' || !isOp('(')) return { k: 'id', name: tk.v };
      p++;
      const a = sum();
      expect(')');
      return { k: 'clog2', a };
    }
    if (tk.v === '(') { const a = sum(); expect(')'); return { k: 'par', a }; }
    throw new Error(`unexpected '${tk.v}'`);
  }
  function product() {
    let a = factor();
    while (isOp('*') || isOp('/')) { const op = toks[p++].v; a = { k: 'bin', op, a, b: factor() }; }
    return a;
  }
  function sum() {
    let a = product();
    while (isOp('+') || isOp('-')) { const op = toks[p++].v; a = { k: 'bin', op, a, b: product() }; }
    return a;
  }
  try {
    const ast = sum();
    if (p < toks.length) throw new Error(`unexpected '${toks[p].v}'`);
    return { ast };
  } catch (e) { return { error: e.message }; }
}

/** The names an expression reads. */
export function widthNames(ast, out = []) {
  if (ast.k === 'id') out.push(ast.name);
  else if (ast.k === 'clog2' || ast.k === 'par') widthNames(ast.a, out);
  else if (ast.k === 'bin') { widthNames(ast.a, out); widthNames(ast.b, out); }
  return out;
}

/** True if the expression calls clog2. */
export const usesClog2 = (ast) => ast.k === 'clog2' || ((ast.k === 'par') && usesClog2(ast.a)) || (ast.k === 'bin' && (usesClog2(ast.a) || usesClog2(ast.b)));

/** Its value at the generics' values (value(name) -> number): a number, or throws an Error (a negative value, a division by 0). */
export function evalWidth(ast, value) {
  switch (ast.k) {
    case 'num': return ast.v;
    case 'id': return value(ast.name);
    case 'par': return evalWidth(ast.a, value);
    case 'clog2': return clog2(evalWidth(ast.a, value));
    case 'bin': {
      const a = evalWidth(ast.a, value), b = evalWidth(ast.b, value);
      if (ast.op === '/' && b === 0) throw new Error('a division by 0');
      const r = ast.op === '+' ? a + b : ast.op === '-' ? a - b : ast.op === '*' ? a * b : Math.trunc(a / b);
      if (r < 0) throw new Error(`a negative value (${r})`);
      return r;
    }
  }
  return 0;
}

/** Its code (VHDL and Verilog alike), the generics spelt as declared (name(n) -> the generic's name). */
export function widthCode(ast, name = (n) => n) {
  switch (ast.k) {
    case 'num': return String(ast.v);
    case 'id': return name(ast.name);
    case 'par': return `(${widthCode(ast.a, name)})`;
    case 'clog2': return `clog2(${widthCode(ast.a, name)})`;
    case 'bin': return `${widthCode(ast.a, name)} ${ast.op} ${widthCode(ast.b, name)}`;
  }
  return '';
}

/** The helper function the generated module declares when a width calls clog2: its lines (indented by 4). */
export function clog2Lines(lang) {
  if (lang === 'vhdl') {
    return [
      '    -- the bits that count 0 .. n-1 (at least 1): the registers\' widths',
      '    function clog2 (n : integer) return integer is',
      '        variable x : integer := n - 1;',
      '        variable r : integer := 0;',
      '    begin',
      '        for i in 1 to 31 loop',
      '            if x > 0 then',
      '                x := x / 2;',
      '                r := r + 1;',
      '            end if;',
      '        end loop;',
      '        if r < 1 then return 1; end if;',
      '        return r;',
      '    end function;',
    ];
  }
  return [
    '    // the bits that count 0 .. n-1 (at least 1): the registers\' widths',
    '    function integer clog2(input integer n);',
    '        integer x;',
    '        begin',
    '            x = n - 1;',
    '            for (clog2 = 0; x > 0; clog2 = clog2 + 1) x = x >> 1;',
    '            if (clog2 < 1) clog2 = 1;',
    '        end',
    '    endfunction',
  ];
}

/**
 * A register's width in the chart's analysis (generics: Map name -> default value, the chart's valid generics):
 * { width } for a number, { width (its value at the generics' default values), p: { text, code } } for an expression,
 * or { error } (the Check's message).
 */
export function registerWidth(r, generics) {
  const what = `Register '${r.name}'`;
  if (!isWidthExpr(r.width)) {
    if (!Number.isInteger(r.width) || r.width < 1 || r.width > 256) return { error: `${what} has invalid width ${r.width} (1..256)` };
    return { width: r.width };
  }
  const text = r.width;
  const q = parseWidth(text);
  if (q.error) return { error: `${what}: width '${text}' is not a valid expression (${q.error}): write a number or an expression of the generics, e.g. clog2(N) or N + 1` };
  for (const n of widthNames(q.ast)) {
    if (generics.has(n)) continue;
    const ci = [...generics.keys()].find((k) => k.toLowerCase() === n.toLowerCase());
    return { error: `${what}: width '${text}': '${n}' is not a generic of the chart${ci ? ` (did you mean '${ci}'?)` : ''}` };
  }
  let width;
  try { width = evalWidth(q.ast, (n) => generics.get(n)); } catch (e) { return { error: `${what}: width '${text}' is ${e.message} at the generics' default values` }; }
  if (width < 1 || width > 256) return { error: `${what}: width '${text}' is ${width} at the generics' default values (1..256)` };
  return { width, p: { text, code: widthCode(q.ast), clog2: usesClog2(q.ast) } };
}

/**
 * The width expression of a hand-written HDL declaration (`std_logic_vector(clog2(N) - 1 downto 0)`, `[N-1:0]`: the
 * range of core/compile.js's IR), or null when its range is not (expression) - 1 downto 0 of the generics (generic(n):
 * a generic's name as the chart spells it, or null), integers, + - * / and clog2.
 */
export function widthFromHdl(range, generic) {
  if (!range || range.right?.op !== 'int' || Number(range.right.value) !== 0) return null;
  const l = range.left;
  if (l?.op !== 'binary' || l.o !== '-' || l.b?.op !== 'int' || Number(l.b.value) !== 1) return null;
  let named = false;
  const prec = (e) => (e.op === 'binary' ? (e.o === '+' || e.o === '-' ? 1 : 2) : 3);
  const conv = (e) => {
    switch (e?.op) {
      case 'int': return String(e.value);
      case 'ref': { const g = generic(e.name); if (!g) throw new Error(); named = true; return g; }
      case 'call': case 'apply':
        if (String(e.name).toLowerCase() !== 'clog2' || e.args?.length !== 1) throw new Error();
        return `clog2(${conv(e.args[0])})`;
      case 'binary': {
        if (!['+', '-', '*', '/'].includes(e.o)) throw new Error();
        const p = prec(e);
        const a = conv(e.a), b = conv(e.b);
        return `${prec(e.a) < p ? `(${a})` : a} ${e.o} ${prec(e.b) < p || (prec(e.b) === p && e.o !== '+' && e.o !== '*') ? `(${b})` : b}`;
      }
    }
    throw new Error();
  };
  try {
    const text = conv(l.a);
    return named ? text : null;
  } catch { return null; }
}
