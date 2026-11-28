// silinx-pic24 - the assembler's expressions (#5931), as xc16-as reads them: numbers (decimal, 0x hex, 0b binary, 'c'),
// names (labels, .equ's, the device's registers and bits), '.' and '$' (the address here), parentheses, the unary - ~ !,
// C's binary operators by their precedence, and xc16-as's operators on a program address: tblpage() (its TBLPAG),
// tbloffset() (its offset in that page) and handle() (its 16-bit address).

const OPS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
const FUNCS = { tblpage: (v) => (v >> 16) & 0x7f, tbloffset: (v) => v & 0xffff, handle: (v) => v & 0xffff };
const ESC = { n: 10, r: 13, t: 9, 0: 0, '\\': 92, "'": 39, '"': 34 };

function fail(msg) { throw new Error(msg); }

function tokens(text) {
  const out = [], re = /\s*(0x[0-9a-f]+|0b[01]+|\d+|'(?:\\.|[^'])'|[A-Za-z_.$][\w.$]*|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%&|^~!()<>])/iy;
  let m;
  while (re.lastIndex < text.length && (m = re.exec(text))) out.push(m[1]);
  if (re.lastIndex < text.length && text.slice(re.lastIndex).trim()) fail(`cannot read '${text.slice(re.lastIndex).trim()}'`);
  return out;
}

/** An expression's value; env.lookup(name) a name's (or throws), env.pc the address here. */
export function evaluate(text, env) {
  const t = tokens(String(text));
  if (!t.length) fail('no value');
  let i = 0;
  const primary = () => {
    const x = t[i++];
    if (x == null) fail(`an expression ends too soon: ${text}`);
    if (x === '(') { const v = binary(0); if (t[i++] !== ')') fail(`a ')' is missing: ${text}`); return v; }
    if (x === '-') return -primary();
    if (x === '+') return primary();
    if (x === '~') return ~primary();
    if (x === '!') return primary() ? 0 : 1;
    if (/^0x/i.test(x)) return parseInt(x.slice(2), 16);
    if (/^0b/i.test(x)) return parseInt(x.slice(2), 2);
    if (/^\d/.test(x)) return parseInt(x, 10);
    if (x[0] === "'") return x[1] === '\\' ? (ESC[x[2]] ?? fail(`no escape \\${x[2]}`)) : x.charCodeAt(1);
    if (x === '.' || x === '$') return env.pc;
    const f = FUNCS[x.toLowerCase()];
    if (f && t[i] === '(') { i++; const v = binary(0); if (t[i++] !== ')') fail(`a ')' is missing: ${text}`); return f(v); }
    if (/^(psvpage|psvoffset|edspage|edsoffset)$/i.test(x)) fail(`${x}(): not supported yet`);
    return env.lookup(x);
  };
  const binary = (level) => {
    if (level === OPS.length) return primary();
    let v = binary(level + 1);
    while (OPS[level].includes(t[i])) {
      const op = t[i++], w = binary(level + 1);
      v = op === '||' ? +(v || w) : op === '&&' ? +(v && w) : op === '|' ? v | w : op === '^' ? v ^ w : op === '&' ? v & w
        : op === '==' ? +(v === w) : op === '!=' ? +(v !== w) : op === '<' ? +(v < w) : op === '<=' ? +(v <= w) : op === '>' ? +(v > w)
          : op === '>=' ? +(v >= w) : op === '<<' ? v << w : op === '>>' ? v >> w : op === '+' ? v + w : op === '-' ? v - w : op === '*' ? v * w
            : op === '/' ? (w ? Math.trunc(v / w) : fail('a division by 0')) : (w ? v % w : fail('a division by 0'));
    }
    return v;
  };
  const v = binary(0);
  if (i < t.length) fail(`cannot read '${t.slice(i).join(' ')}' in ${text}`);
  return v;
}
