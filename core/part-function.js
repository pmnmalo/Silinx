// What a KiCad part is, in a few words (#4495): its symbol's Description shortened to its function by a rule, the same
// for every part ("74LS259: 8-bit addressable latch", not "…, DIP-16/SOIC-16, obsolete"), and that function in
// Portuguese by a small vocabulary of the logic ICs' words (hex, quad, inverter, flip-flop, counter, decoder…), applied
// by rule; a description the vocabulary does not cover has none (the interface shows it in English). Isomorphic module.

// a clause that is only a package, a rating or a note: dropped (DIP-16/SOIC-16, TO-92, 100mW/Output, NRND, small symbol)
const PACKAGE = /^(?:(?:P?DIP|SOIC|SSOP|TSSOP|SO|TO|SOT|QFN|PLCC|SIL)[-\d]*W?(?:\/|$))+|^(?:small symbol|NRND|obsolete|PTH|outputs?|inputs?)$/i;
const RATING = /^-?\d+(?:\.\d+)?\s*(?:[mkµu]?(?:A|V|W|Hz)|%)(?:\s*(?:Ic|Vce|Vds|\/output))?$/i;
// words dropped anywhere: a family, a voltage's or a package's note, a rating
const NOISE = [/\((?:obsolete|SIL)\)/gi, /\bNRND\b/g, /(?<!"\s*)\bPTH\b/g, /(?:^|(?<=,)\s*)(?:CMOS|Single Supply)\s+/gi, /\blow-voltage\s*/gi,
  /\bwith \d+(?:\.\d+)?V tolerant inputs\b/gi, /\b\d+(?:\.\d+)?mm\s+dia(?:meter|\.)?/gi, /\b(?:Vce|CTR)\s+\d+(?:\.\d+)?\s*[V%]/g,
  /(?:^|\s)-?\d+(?:\.\d+)?[mk]?[AVW](?=[\s,]|$)(?:\s+(?:Ic|Vce))?/g];
// names kept with their capital
const PROPER = new Set(['Schmitt', 'Johnson', 'Darlington', 'Ethernet']);
const MAX = 64;

/** A word in a sentence's case: one of capitals and lower case letters (Flip-Flop, Shift) in lower case; an acronym (NAND,
 *  BCD, JK, FET, D, I2C, PoE) as it is. */
const lowerWord = (w) => w.replace(/(?<![A-Za-z0-9])[A-Z][a-z]+(?![A-Za-z0-9])/g, (x) => (PROPER.has(x) ? x : x.toLowerCase()));

/**
 * A KiCad description shortened to the part's function (#4495): its first sentence; its clauses (between commas) that
 * are only a package, a rating or a note dropped, and those words where they are among others (CMOS, low-voltage, 5V,
 * TO-92); its words in a sentence's case (Shift Register: shift register; acronyms kept); "3-State" as 3-state and "Open
 * Collect" as open collector; past MAX characters, its first clauses that fit (or its first words, with …). '' for none.
 */
export function shortFunction(description) {
  let s = String(description ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(.+?[a-z)])\.\s.*$/, '$1').replace(/\.$/, '');   // (its first sentence)
  for (const re of NOISE) s = s.replace(re, ' ');
  s = s.replace(/\bopen[- ]collect(?:or)?\b/gi, 'open collector').replace(/\b3-state\b/gi, '3-state').replace(/\s+/g, ' ');
  const clauses = s.split(/\s*,\s*/).map((c) => c.trim()).filter((c) => c && !PACKAGE.test(c) && !RATING.test(c));
  const out = clauses.map((c) => c.split(' ').map(lowerWord).join(' '));
  let text = out.join(', ');
  if (text.length > MAX) {
    let k = out.length;
    while (k > 1 && out.slice(0, k).join(', ').length > MAX) k--;
    text = out.slice(0, k).join(', ');
    if (text.length > MAX) text = `${text.slice(0, MAX).replace(/\s+\S*$/, '')}…`;
  }
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

// ---------------------------------------------------------------- Portuguese
// the nouns: English (lower case) → [Portuguese singular, plural, gender]; the longest found first
const NOUNS = Object.entries({
  'nand gate': ['porta NAND', 'portas NAND', 'f'], 'nor gate': ['porta NOR', 'portas NOR', 'f'], 'and gate': ['porta AND', 'portas AND', 'f'], 'or gate': ['porta OR', 'portas OR', 'f'],
  'xor gate': ['porta XOR', 'portas XOR', 'f'], 'xnor gate': ['porta XNOR', 'portas XNOR', 'f'], gate: ['porta', 'portas', 'f'],
  'buffer/line driver': ['buffer/driver de linha', 'buffers/drivers de linha', 'm'], 'line driver': ['driver de linha', 'drivers de linha', 'm'],
  'buffer inverter': ['inversor buffer', 'inversores buffer', 'm'], inverter: ['inversor', 'inversores', 'm'], buffer: ['buffer', 'buffers', 'm'],
  'flip-flop': ['flip-flop', 'flip-flops', 'm'], 'shift/storage register': ['registo de deslocamento/armazenamento', 'registos de deslocamento/armazenamento', 'm'],
  'shift registers': ['registo de deslocamento', 'registos de deslocamento', 'm'], 'shift register': ['registo de deslocamento', 'registos de deslocamento', 'm'],
  'register files': ['banco de registos', 'bancos de registos', 'm'], register: ['registo', 'registos', 'm'],
  'latch/decoder/driver': ['latch/descodificador', 'latches/descodificadores', 'm'], 'decoder/demultiplexer': ['descodificador/desmultiplexador', 'descodificadores/desmultiplexadores', 'm'],
  'decoder/multiplexer': ['descodificador/multiplexador', 'descodificadores/multiplexadores', 'm'], 'decoder/driver': ['descodificador', 'descodificadores', 'm'],
  'multiplexer/demultiplexer': ['multiplexador/desmultiplexador', 'multiplexadores/desmultiplexadores', 'm'], 'counter/divider': ['contador/divisor', 'contadores/divisores', 'm'],
  decoder: ['descodificador', 'descodificadores', 'm'], encoder: ['codificador', 'codificadores', 'm'], driver: ['driver', 'drivers', 'm'],
  multiplexer: ['multiplexador', 'multiplexadores', 'm'], demultiplexer: ['desmultiplexador', 'desmultiplexadores', 'm'],
  counter: ['contador', 'contadores', 'm'], 'up-counter': ['contador crescente', 'contadores crescentes', 'm'], latch: ['latch', 'latches', 'm'],
  comparator: ['comparador', 'comparadores', 'm'], adder: ['somador', 'somadores', 'm'],
  'arithmetic logic unit': ['unidade aritmética e lógica', 'unidades aritméticas e lógicas', 'f'], 'carry generator': ['gerador de carry', 'geradores de carry', 'm'],
  'parity generator/checker': ['gerador/verificador de paridade', 'geradores/verificadores de paridade', 'm'],
  'monostable/astable multivibrator': ['multivibrador monoestável/astável', 'multivibradores monoestáveis/astáveis', 'm'],
  'monostable multivibrator': ['multivibrador monoestável', 'multivibradores monoestáveis', 'm'], monostable: ['monoestável', 'monoestáveis', 'm'],
  oscillator: ['oscilador', 'osciladores', 'm'], 'voltage-controlled oscillator': ['oscilador controlado por tensão', 'osciladores controlados por tensão', 'm'],
  'bus switch': ['interruptor de barramento', 'interruptores de barramento', 'm'], switches: ['interruptor', 'interruptores', 'm'], switch: ['interruptor', 'interruptores', 'm'],
  transceiver: ['transceptor', 'transceptores', 'm'], 'voltage-level shifter': ['conversor de níveis de tensão', 'conversores de níveis de tensão', 'm'],
  'light emitting diode': ['díodo emissor de luz', 'díodos emissores de luz', 'm'], diode: ['díodo', 'díodos', 'm'], led: ['LED', 'LEDs', 'm'],
  capacitor: ['condensador', 'condensadores', 'm'], resistor: ['resistência', 'resistências', 'f'], potentiometer: ['potenciómetro', 'potenciómetros', 'm'],
  transistor: ['transístor', 'transístores', 'm'], 'linear regulator': ['regulador linear', 'reguladores lineares', 'm'], relay: ['relé', 'relés', 'm'],
  optocoupler: ['optoacoplador', 'optoacopladores', 'm'], 'test point': ['ponto de teste', 'pontos de teste', 'm'], jumper: ['jumper', 'jumpers', 'm'],
}).sort((a, b) => b[0].length - a[0].length);
// the adjectives: English → Portuguese, masculine singular (inflected: -o -a, -or -ora, -l -is, -r -res; "de …", "não …" and
// names as they are)
const ADJ = {
  synchronous: 'síncrono', asynchronous: 'assíncrono', binary: 'binário', decimal: 'decimal', decade: 'de década', programmable: 'programável', presettable: 'pré-carregável',
  universal: 'universal', bidirectional: 'bidirecional', addressable: 'endereçável', retriggerable: 'redisparável', static: 'estático', serial: 'série', analog: 'analógico',
  inverting: 'inversor', 'non-inverting': 'não inversor', 'up/down': 'crescente/decrescente', priority: 'de prioridade', magnitude: 'de magnitude', johnson: 'Johnson',
  positive: 'positivo', polarized: 'polarizado', unpolarized: 'não polarizado', 'small signal': 'de pequeno sinal', solder: 'de solda', darlington: 'Darlington', axial: 'axial',
  'schmitt trigger': 'Schmitt-trigger', 'serial in/out': 'de entrada/saída série', 'divide by': 'divisor por',
};
const INVARIABLE = new Set(['série']);
// the counts: Portuguese [masculine, feminine]
const COUNTS = { hex: ['seis', 'seis'], quad: ['quatro', 'quatro'], dual: ['dois', 'duas'], triple: ['três', 'três'], octal: ['oito', 'oito'] };
// what may follow a noun, or be a clause of its own: [English (lower case, whole), its Portuguese (a text or a function of
// the match), kind: post (after the adjectives: a size, a range), adj (an adjective, inflected), tail (a phrase after them)]
const PHRASES = [
  [/^(\d+)-input$/, (m, n) => `de ${n} entradas`, 'post'], [/^(\d+)[- ]bits?$/, (m, n) => `de ${n} bits`, 'post'], [/^(\d+)-channel$/, (m, n) => `de ${n} canais`, 'post'],
  [/^(\d+)-key$/, (m, n) => `de ${n} teclas`, 'post'], [/^\(?(\d+)[- ]stages?\)?$/, (m, n) => `de ${n} andares`, 'post'], [/^\((\d+) states\)$/, (m, n) => `(${n} estados)`, 'post'],
  [/^(\d+) \((\d+\+\d+)\)-bit$/, (m, n, k) => `de ${n} bits (${k})`, 'post'], [/^\((\d+) clk\)$/, (m, n) => `(${n} relógios)`, 'post'], [/^(\d+) x (\d+)$/, (m, a, b) => `${a} x ${b}`, 'post'],
  [/^(\d+)[- ]to[- ](\d+)( lines?| lins)?$/, (m, a, b, l) => `de ${a} para ${b}${l ? ` linha${b === '1' ? '' : 's'}` : ''}`, 'post'], [/^1 of (\d+)$/, (m, n) => `1 de ${n}`, 'post'],
  [/^bcd to 7[- ]segments?$/, 'BCD para 7 segmentos', 'post'], [/^(\d+)$/, (m, n) => n, 'post'], [/^d(?:-type)?$/, 'D', 'pre'], [/^jk$/, 'JK', 'pre'], [/^n-mosfet$/, 'N-MOSFET', 'pre'],
  [/^(npn|pnp|bcd|fet|dc|cbi)$/, (m, n) => n.toUpperCase(), 'pre'], [/^\((\w+)\)$/, (m, a) => ADJ[a] ?? null, 'adj'],
  [/^(?:with )?3-state(?: outputs?)?$/, 'saídas tri-state', 'tail'], [/^(?:with )?open collector(?: outputs?)?$/, 'coletor aberto', 'tail'], [/^\(?open drain\)?$/, 'dreno aberto', 'tail'],
  [/^with schmitt[- ]trigger inputs$/, 'com entradas Schmitt-trigger', 'tail'], [/^schmitt[- ]trigger$/, 'Schmitt-trigger', 'tail'], [/^inverter$/, 'inversor', 'adj'],
  [/^reset$/, 'reset', 'tail'], [/^set$/, 'set', 'tail'], [/^set & reset$/, 'set e reset', 'tail'], [/^common clock & reset$/, 'relógio e reset comuns', 'tail'],
  [/^parallel load$/, 'carga paralela', 'tail'], [/^parallel$/, 'paralelo', 'tail'], [/^\(in\/out\)$/, '(entrada e saída)', 'tail'], [/^cascadable$/, 'em cascata', 'tail'],
  [/^(?:with )?address latches$/, 'com latches de endereço', 'tail'], [/^with storage$/, 'com armazenamento', 'tail'], [/^with output registers?$/, 'com registo de saída', 'tail'],
  [/^active (low|high)(?: outputs)?$/, (m, l) => `ativo a ${l === 'low' ? 0 : 1}`, 'tail'], [/^sign extend$/, 'extensão do sinal', 'tail'], [/^ripple blanking$/, 'apagamento de zeros', 'tail'],
  [/^lamp test$/, 'teste das lâmpadas', 'tail'], [/^strobed-latch function$/, 'latch com strobe', 'tail'], [/^enable control$/, 'controlo de enable', 'tail'],
  [/^range control$/, 'controlo de gama', 'tail'], [/^parallel load and hold capability$/, 'carga paralela e retenção', 'tail'], [/^gate\/drain\/source$/, 'gate/dreno/fonte', 'tail'],
  [/^fixed output$/, 'saída fixa', 'tail'], [/^(\d+)-pole$/, (m, n) => `${n} polos`, 'tail'], [/^closed\/bridged$/, 'fechado', 'tail'], [/^open$/, 'aberto', 'tail'],
  [/^and oscillator$/, 'e oscilador', 'tail'], [/^7 segment decoder$/, 'descodificador de 7 segmentos', 'tail'],
];

// an adjective agreeing with its noun: feminine (f), plural (pl)
const inflect = (w, f, pl) => (/^(?:de|não|divisor) |^[A-Z]/.test(w) || INVARIABLE.has(w) ? w : w.split('/').map((p) => {
  const y = f && /o$/.test(p) ? p.replace(/o$/, 'a') : f && /or$/.test(p) ? `${p}a` : p;
  return !pl ? y : /[aeiouáéíóú]$/.test(y) ? `${y}s` : /l$/.test(y) ? y.replace(/[aeo]?l$/, (x) => (x === 'el' ? 'eis' : x === 'al' ? 'ais' : x === 'ol' ? 'óis' : 'is')) : /r$/.test(y) ? `${y}es` : y;
}).join('/'));

// the words of a phrase read as a sequence of PHRASES (and adjectives), the longest first: [{ text, kind }], or null
function phrases(text) {
  const words = text ? text.split(' ') : [], out = [];
  for (let i = 0; i < words.length;) {
    let found = null;
    for (let k = words.length - i; k > 0 && !found; k--) {
      const w = words.slice(i, i + k).join(' ');
      if (ADJ[w]) { found = { k, text: ADJ[w], kind: 'adj' }; break; }
      const p = PHRASES.find(([re]) => re.test(w));
      const v = p && (typeof p[1] === 'function' ? p[1](...w.match(p[0])) : p[1]);
      if (v) found = { k, text: v, kind: p[2] };
    }
    if (!found) return null;
    out.push(found);
    i += found.k;
  }
  return out;
}

// a clause in Portuguese, or null (a word not known): with a noun, its count, the noun, its sizes and adjectives in
// Portuguese order, the phrases after them; with none, its phrases
function clausePt(clause, agree = { f: false, pl: false }) {
  const s = clause.toLowerCase().replace(/\s+/g, ' ').trim();
  const m = /^(?:(hex|quad|dual|triple|octal)\s+)?(.*)$/.exec(s);
  const rest = m[2];
  // (a clause that is a phrase: 7 segment decoder; else its noun, the first one in it, the longest there)
  const whole = PHRASES.find(([re, , kind]) => (kind === 'tail' || kind === 'adj') && re.test(s));
  const wt = whole && (typeof whole[1] === 'function' ? whole[1](...s.match(whole[0])) : whole[1]);
  if (wt && !m[1]) return { text: whole[2] === 'adj' ? inflect(wt, agree.f, agree.pl) : wt };
  const at = NOUNS.map(([en, pt]) => {
    const i = rest.search(new RegExp(`(?:^| )${en.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?= |$)`));
    return i < 0 ? null : { i: i && i + 1, en, pt };
  }).filter(Boolean).sort((a, b) => a.i - b.i || b.en.length - a.en.length)[0];
  if (!at) {
    if (m[1]) return null;
    // (a clause of phrases or adjectives, these agreeing with the first clause's noun)
    const p = phrases(rest);
    return p && p.every((x) => x.kind !== 'pre') ? { text: p.map((x) => (x.kind === 'adj' ? inflect(x.text, agree.f, agree.pl) : x.text)).join(' ') } : null;
  }
  const before = phrases(rest.slice(0, at.i).trim()), after = phrases(rest.slice(at.i + at.en.length).trim());
  if (!before || !after || before.some((x) => x.kind === 'tail')) return null;
  const [one, many, g] = at.pt, pl = !!m[1], f = g === 'f';
  const of = (kind) => [...before, ...after].filter((x) => x.kind === kind).map((x) => x.text);
  // (the adjectives the other way round, the nearest the noun first: a universal bidirectional register; up/down last)
  const adj = (xs) => xs.filter((x) => x.kind === 'adj').map((x) => inflect(x.text, f, pl));
  const adjs = [...adj(before).reverse(), ...adj(after)].sort((a, b) => /^crescente/.test(a) - /^crescente/.test(b));
  const head = [m[1] ? COUNTS[m[1]][f ? 1 : 0] : '', pl ? many : one, ...of('pre'), ...adjs, ...of('post')].filter(Boolean).join(' ');
  const tail = after.filter((x) => x.kind === 'tail').map((x) => x.text);
  return { text: tail.reduce((a, t) => `${a}${/^(?:com |e |\()/.test(t) ? ' ' : ', '}${t}`, head), f, pl };
}

/**
 * A function in Portuguese (#4495), by a small vocabulary of the logic ICs' words and their order (a count and its noun
 * first, its sizes and adjectives after: "Quad 2-input NAND gate" → "Quatro portas NAND de 2 entradas"), each clause a
 * noun's or known phrases (3-state outputs: saídas tri-state); null when a word is not in the vocabulary.
 */
export function functionPt(fn) {
  const s = String(fn ?? '').trim();
  if (!s || /…$/.test(s)) return null;
  const out = [];
  let agree;
  for (const c of s.split(/\s*,\s*/)) {
    const p = clausePt(c, agree);
    if (!p) return null;
    out.push(p.text);
    agree ??= p.f === undefined ? undefined : p;
  }
  const text = out.join(', ');
  return text[0].toUpperCase() + text.slice(1);
}

/** A text folded for a search: lower case, no accents. */
export const foldText = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
