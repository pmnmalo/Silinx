// What a KiCad part is (#4495, core/part-function.js): KiCad's descriptions shortened to the function by one rule, on
// real descriptions of KiCad's 74xx, 4xxx, Device and SparkFun libraries, and the catalogue's functions made by it; the function in Portuguese by its vocabulary,
// checked against the interface's own translations of Silinx's ICs' titles (an independent reference); the catalogue's
// parts' functions and the search by them (core/kicad-catalogue.js); a project's KiCad part's (core/circuit-parts.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortFunction, functionPt, foldText } from '../core/part-function.js';
import { CATALOGUE, CATALOGUE_FUNCTIONS, catalogueFunction, searchCatalogue } from '../core/kicad-catalogue.js';
import { PARTS, kicadPartFunction } from '../core/circuit-parts.js';
import { CIRCUIT_PT_PATTERNS } from '../web/js/i18n-circuit.js';

test('shortFunction: KiCad\'s descriptions shortened to the function (packages, ratings, notes dropped; a sentence\'s case)', () => {
  for (const [d, want] of [
    // (packages)
    ['3-to-8 line decoder/multiplexer with address latches, DIP-16/SOIC-16/SSOP-16', '3-to-8 line decoder/multiplexer with address latches'],
    ['8-channel analog multiplexer/demultiplexer, DIP-16/SOIC-16/TSSOP-16', '8-channel analog multiplexer/demultiplexer'],
    ['7-stage binary ripple counter, SOIC-14', '7-stage binary ripple counter'],
    ['16-Bit 2.5V to 3.3V or 3.3V to 5V Level-Shifting Transceiver With 3-State Outputs, TSSOP-48', '16-bit to or to level-shifting transceiver with 3-state outputs'],
    // (notes: obsolete, NRND, the family, low voltage, tolerant inputs)
    ['8-bit synchronous up/down counter, parallel load and hold capability (obsolete)', '8-bit synchronous up/down counter'],   // (past 64 characters: its first clause)
    ['quad 2-input NAND gate, open collector outputs NRND', 'Quad 2-input NAND gate, open collector outputs'],
    ['CMOS hex buffer (open drain) with 5V tolerant inputs', 'Hex buffer (open drain)'],
    ['Low-voltage 10-bit FET bus switch', '10-bit FET bus switch'],
    ['20V, CMOS Decade Counter/Divider, 7 Segment Decoder, Ripple Blanking, Lamp Test, 100mW/Output, DIP-16', 'Decade counter/divider, 7 segment decoder, ripple blanking'],
    // (ratings)
    ['0.2A Ic, 40V Vce, Small Signal NPN Transistor, TO-92', 'Small signal NPN transistor'],
    ['Positive 1.5A 35V Linear Regulator, Fixed Output 5V, TO-220/TO-263/TO-252', 'Positive linear regulator, fixed output'],
    ['DC Darlington Optocoupler, Vce 300V, CTR 1000%, DIP4', 'DC Darlington optocoupler'],
    ['BCD to 7-segment Driver, Open Collector, 15V outputs', 'BCD to 7-segment driver, open collector'],
    // (a sentence's case: acronyms and names kept; "Open Collect" read as open collector)
    ['Dual JK Flip-Flop, Set & Reset', 'Dual JK flip-flop, set & reset'], ['Hex inverter schmitt trigger', 'Hex inverter schmitt trigger'],
    ['Hex Schmitt trigger inverter', 'Hex Schmitt trigger inverter'], ['Inverter Open Collect', 'Inverter open collector'], ['Binary Counter 12 stages (Asynchronous)', 'Binary counter 12 stages (asynchronous)'],
    ['8-bit Buffer/Line Driver 3-state Inverting', '8-bit buffer/line driver 3-state inverting'], ['Power Over Ethernet PD Module (SIL), conforming to the IEEE 802.3af/at PoE standard.', 'Power over Ethernet PD module'],
    // (its first sentence; past 64 characters its first clauses that fit, or its first words)
    ['The Ag9200 Power-over-Ethernet (PoE) modules are designed to extract power from a conventional twisted pair Category 5 Ethernet cable, conforming to the IEEE 802.3af PoE standard.',
      'The Ag9200 power-over-Ethernet (PoE) modules are designed to…'],
    ['Light emitting diode PTH 5mm diameter', 'Light emitting diode'], ['Basic 0.1" PTH', 'Basic 0.1" PTH'],
    // (none)
    ['', ''], [null, ''], [undefined, ''], ['DIP-14', ''],
  ]) assert.equal(shortFunction(d), want, d);
});

test('the catalogue\'s functions (scripts/kicad-catalogue.mjs): one line, no package, no rating, under 66 characters; the rule\'s', () => {
  const all = Object.values(CATALOGUE_FUNCTIONS);
  assert.ok(all.length >= 300, `${all.length} functions`);
  assert.ok(Object.keys(CATALOGUE_FUNCTIONS).every((id) => CATALOGUE.some((e) => e.id === id)), 'each one a part\'s');
  for (const d of all) {
    const f = shortFunction(d);
    assert.equal(f, d, 'the rule gives it back as it is');
    assert.ok(f.length > 0 && f.length <= 65, `${d}: '${f}'`);
    assert.doesNotMatch(f, /\b(?:DIP|SOIC|SSOP|TSSOP)-\d|\bTO-(?:92|220)\b|\bNRND\b|\(obsolete\)|\b\d+(?:\.\d+)?[mk]?[AW]\b/, d);
    assert.equal(f[0], f[0].toUpperCase(), d);
  }
});

test('functionPt: the function in Portuguese by its vocabulary; null for a word it does not know', () => {
  for (const [en, pt] of [
    ['Quad 2-input NAND gate', 'Quatro portas NAND de 2 entradas'], ['Hex inverting buffer', 'Seis buffers inversores'], ['Hex Schmitt trigger inverter', 'Seis inversores Schmitt-trigger'],
    ['Dual JK flip-flop, set & reset', 'Dois flip-flops JK, set e reset'], ['8-bit addressable latch', 'Latch endereçável de 8 bits'],
    ['3-to-8 line decoder/multiplexer with address latches', 'Descodificador/multiplexador de 3 para 8 linhas com latches de endereço'],
    ['Dual 4 to 1 line multiplexer, inverter', 'Dois multiplexadores de 4 para 1 linha, inversores'], ['Multiplexer 8 to 1, 3-state outputs', 'Multiplexador de 8 para 1, saídas tri-state'],
    ['8-bit binary counter with output register 3-state outputs', 'Contador binário de 8 bits com registo de saída, saídas tri-state'],
    ['Synchronous 4-bit up/down binary counter', 'Contador binário síncrono crescente/decrescente de 4 bits'], ['Binary counter 14 stages (asynchronous)', 'Contador binário assíncrono de 14 andares'],
    ['BCD to 7-segment decoder open collector active low', 'Descodificador BCD para 7 segmentos, coletor aberto, ativo a 0'], ['Hex buffer (open drain)', 'Seis buffers, dreno aberto'],
    ['Quad analog switches', 'Quatro interruptores analógicos'], ['Arithmetic logic unit', 'Unidade aritmética e lógica'], ['Quad serial adder', 'Quatro somadores série'],
    ['Dual retriggerable monostable multivibrator', 'Dois multivibradores monoestáveis redisparáveis'], ['Monostable multivibrator with Schmitt-trigger inputs', 'Multivibrador monoestável com entradas Schmitt-trigger'],
    ['Priority encoder 3 to 8 cascadable', 'Codificador de prioridade de 3 para 8, em cascata'], ['Unpolarized capacitor', 'Condensador não polarizado'], ['Resistor', 'Resistência'],
    ['Small signal NPN transistor', 'Transístor NPN de pequeno sinal'], ['Positive linear regulator, fixed output', 'Regulador linear positivo, saída fixa'],
  ]) assert.equal(functionPt(en), pt, en);
  // (a word the vocabulary has not: none, the interface shows the English)
  for (const en of ['Phase comp & VCO', 'Logic level translator quad buffer with 3-state outputs', 'Thing plus board outline', 'Quad 2-input NAND gate, lunar phase', 'Basic 0.1" PTH',
    'The Ag9200 power-over-Ethernet (PoE) modules are designed to…', '', null]) assert.equal(functionPt(en), null, en);
});

test('functionPt agrees with the interface\'s own Portuguese of Silinx\'s ICs\' titles where its vocabulary has their words', () => {
  const tr = (s) => { for (const [re, rep] of CIRCUIT_PT_PATTERNS) if (re.test(s)) return s.replace(re, rep); return null; };
  const both = Object.values(PARTS).filter((p) => functionPt(p.title));
  assert.ok(both.length >= 15, `${both.length} titles`);
  for (const p of both) assert.equal(functionPt(p.title), tr(p.title), p.title);
});

test('functionPt covers most of the catalogue\'s logic ICs drawn only', () => {
  const fns = [...new Set(CATALOGUE.filter((e) => /^kicad-(?:74xx|4xxx)$/.test(e.library) && !e.as && CATALOGUE_FUNCTIONS[e.id]).map((e) => CATALOGUE_FUNCTIONS[e.id]))];
  const pt = fns.filter((f) => functionPt(f));
  assert.ok(pt.length / fns.length >= 0.85, `${pt.length} of ${fns.length}: not ${fns.filter((f) => !functionPt(f)).join('; ')}`);
});

test('catalogueFunction: Silinx\'s IC\'s title, else KiCad\'s function, else the library part\'s; the search by it, in English and Portuguese', () => {
  const by = (id) => CATALOGUE.find((e) => e.id === id);
  assert.deepEqual(catalogueFunction(by('kicad-74xx/74HC00')), { text: 'Quad 2-input NAND', pt: null, silinx: true });
  assert.deepEqual(catalogueFunction(by('kicad-74xx/74LS123')), { text: 'Dual retriggerable monostable', pt: 'Dois monoestáveis redisparáveis', silinx: false });
  assert.deepEqual(catalogueFunction(by('kicad-device/R')), { text: 'Resistor', pt: 'Resistência', silinx: false });
  assert.deepEqual(catalogueFunction(by('sparkfun-led/LED_Red_5mm_PTH_NoSilk')), { text: 'Light emitting diode', pt: 'Díodo emissor de luz', silinx: false });
  assert.equal(catalogueFunction(by('kicad-4xxx/4049')).text, PARTS['4049'].title);
  assert.deepEqual(catalogueFunction({ id: 'x/Y', as: 'led' }, {}), { text: 'LED', pt: null, silinx: true });
  assert.deepEqual(catalogueFunction({ id: 'x/Y', as: null }, {}), { text: '', pt: null, silinx: false });
  // (found by what they are)
  const ids = (q) => searchCatalogue(q).map((e) => e.id);
  assert.ok(ids('inverter').includes('kicad-4xxx/40106') && ids('inverter').includes('kicad-74xx/74LS04'), 'inverter');
  assert.ok(ids('flip-flop').length >= 20 && ids('flip-flop').includes('kicad-74xx/74LS109'), 'flip-flop');
  assert.ok(ids('multiplexer').includes('kicad-74xx/74LS251') && ids('multiplexer').includes('kicad-4xxx/4051'), 'multiplexer');
  assert.deepEqual(ids('retriggerable monostable').sort(), ['kicad-74xx/74AHCT123', 'kicad-74xx/74HC123', 'kicad-74xx/74HCT123', 'kicad-74xx/74LS122', 'kicad-74xx/74LS123']);
  // (in Portuguese: KiCad's functions by the vocabulary, accents aside; Silinx's titles as the interface gives them, more)
  assert.deepEqual(ids('monoestaveis redisparaveis').sort(), ['kicad-74xx/74AHCT123', 'kicad-74xx/74HC123', 'kicad-74xx/74HCT123', 'kicad-74xx/74LS123']);
  assert.ok(ids('descodificador').includes('kicad-74xx/74LS42'));
  assert.deepEqual(searchCatalogue('quatro portas nand hct', undefined, { more: (e) => (e.as === '7400' ? 'Quatro portas NAND de 2 entradas' : null) }).map((e) => e.id), ['kicad-74xx/74HCT00']);
  assert.deepEqual(searchCatalogue('quatro portas nand hct').map((e) => e.id), []);
  assert.equal(foldText('Endereçável ÂB'), 'enderecavel ab');
});

test('kicadPartFunction: a project\'s KiCad part: the IC\'s title, its description shortened, the library part\'s', () => {
  assert.deepEqual(kicadPartFunction({ kind: 'ic', behaves: '7400', kicad: { description: 'quad 2-input NAND gate, HCMOS' } }), { text: 'Quad 2-input NAND', silinx: true });
  assert.deepEqual(kicadPartFunction({ kind: 'drawn', behaves: null, kicad: { description: '8-bit addressable latch, DIP-16' } }), { text: '8-bit addressable latch', silinx: false });
  assert.deepEqual(kicadPartFunction({ kind: 'led', behaves: 'led', kicad: { description: '' } }), { text: 'LED', silinx: true });
  assert.deepEqual(kicadPartFunction({ kind: 'led', behaves: 'led', kicad: { description: 'Light emitting diode PTH' } }), { text: 'Light emitting diode', silinx: false });
  assert.deepEqual(kicadPartFunction({ kind: 'drawn', behaves: null, kicad: {} }), { text: '', silinx: false });
});
