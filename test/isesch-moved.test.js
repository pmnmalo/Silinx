// Unit tests (#4765): core/isesch-parse.js, ISE's schematic and symbol files read into the neutral model, moved out of
// core/isesch.js, loaded on its own: the names core/isesch.js exported before still exported by it (the same functions),
// the XML reader, schematics of version 7 and of the text format of older versions, the symbols in both formats, the errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseXml, parseIseSch, parseIseSym } from '../core/isesch-parse.js';
import * as isesch from '../core/isesch.js';

test('core/isesch.js still exports the moved names, the same functions (#4765)', () => {
  assert.equal(isesch.parseXml, parseXml);
  assert.equal(isesch.parseIseSch, parseIseSch);
  assert.equal(isesch.parseIseSym, parseIseSym);
});

test('parseXml: elements, attributes in either quote, entities, comments, CDATA, self-closing and stray close tags', () => {
  const root = parseXml('<?xml version="1.0"?><!-- c --><A x="1 &amp; 2" y=\'&#x41;\'><b/>t&lt;u<![CDATA[<v>]]></c></A>');
  assert.equal(root.children.length, 1);
  const a = root.children[0];
  assert.deepEqual({ tag: a.tag, attrs: a.attrs, text: a.text }, { tag: 'a', attrs: { x: '1 & 2', y: 'A' }, text: 't<u<v>' });
  assert.deepEqual(a.children.map(c => c.tag), ['b']);
  assert.equal(parseXml('&#x110000;').text, '�');
});

for (const [file, version] of [['Mux4to1b4.sch', 7], ['Counter_2b.sch', 6]]) {
  test(`parseIseSch: the fixture ${file} (version ${version}) into the neutral model`, () => {
    const m = parseIseSch(fs.readFileSync(new URL(`./fixtures/ise-sch/${file}`, import.meta.url), 'utf8'));
    assert.equal(m.version, version);
    assert.ok(m.signals.length > 0 && m.blocks.length > 0 && m.sheets.length === 1);
    assert.ok(m.blockdefs instanceof Map && m.blockdefs.size > 0);
    for (const b of m.blocks) assert.ok(m.blockdefs.has(b.symbol.toLowerCase()), b.symbol);
    const sheet = m.sheets[0];
    assert.ok(sheet.instances.length === m.blocks.length && sheet.branches.length > 0);
    assert.deepEqual(m.ports.filter(p => !['Input', 'Output', 'BiDirectional'].includes(p.polarity)), []);
  });
}

test('parseIseSch: a small schematic by hand; the text format of ISE 6; not a schematic', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><drawing version="7"><attr value="spartan3e" name="DeviceFamilyName"/>
    <netlist><signal name="a"/><signal name="y"/><port polarity="Input" name="a"/><port polarity="Output" name="y"/>
    <blockdef name="inv"><timestamp>2000-1-1T10:10:10</timestamp><line x2="64" y1="-32" y2="-32" x1="0"/>
      <circle r="16" cx="144" cy="-32"/></blockdef>
    <block symbolname="inv" name="XLXI_1"><blockpin signalname="a" name="I"/><blockpin signalname="y" name="O"/></block></netlist>
    <sheet sheetnum="1" width="3520" height="2720"><instance x="400" y="300" name="XLXI_1" orien="R0"/>
      <branch name="a"><wire x2="400" y1="268" y2="268" x1="300"/></branch><iomarker fontsize="28" x="300" y="268" name="a" orien="R180"/>
    </sheet></drawing>`;
  const m = parseIseSch(xml);
  assert.deepEqual(m.attrs, { DeviceFamilyName: 'spartan3e' });
  assert.deepEqual(m.ports, [{ name: 'a', polarity: 'Input' }, { name: 'y', polarity: 'Output' }]);
  assert.deepEqual(m.blockdefs.get('inv'), { name: 'inv', timestamp: '2000-1-1T10:10:10', shapes: [
    { kind: 'line', x1: 0, y1: -32, x2: 64, y2: -32, bus: false }, { kind: 'circle', cx: 144, cy: -32, r: 16 }] });
  assert.deepEqual(m.blocks, [{ symbol: 'inv', name: 'XLXI_1', attrs: {}, pins: [{ name: 'I', signal: 'a' }, { name: 'O', signal: 'y' }] }]);
  assert.deepEqual(m.sheets[0].instances, [{ name: 'XLXI_1', x: 400, y: 300, orien: 'R0' }]);
  assert.deepEqual(m.sheets[0].branches, [{ name: 'a', wires: [[300, 268, 400, 268]], labels: [] }]);
  assert.deepEqual(m.sheets[0].iomarkers, [{ name: 'a', x: 300, y: 268, orien: 'R180' }]);
  assert.equal(parseIseSch('VERSION 6\nBEGIN SCHEMATIC\nEND SCHEMATIC\n').version, 6);
  assert.throws(() => parseIseSch('<html></html>'), /not an ISE schematic/);
});

test('parseIseSym: a symbol in XML and in the text format; not a symbol', () => {
  const xml = '<symbol version="7" name="and2b"><pin polarity="Input" x="0" y="-64" name="I0"/>'
    + '<pin polarity="Output" x="256" y="-96" name="O"/><pin polarity="BiDirectional" x="0" y="-128" name="IO"/></symbol>';
  assert.deepEqual(parseIseSym(xml), { name: 'and2b', pins: [{ name: 'I0', dir: 'in', x: 0, y: -64 }, { name: 'O', dir: 'out', x: 256, y: -96 },
    { name: 'IO', dir: 'inout', x: 0, y: -128 }] });
  const v5 = 'VERSION 5\nBEGIN SYMBOL mux2\nSYMBOLTYPE BLOCK\n\nSYMPIN 0 -32 Input S\nSYMPIN 256 -64 Output O\nEND SYMBOL\n';
  assert.deepEqual(parseIseSym(v5), { name: 'mux2', pins: [{ name: 'S', dir: 'in', x: 0, y: -32 }, { name: 'O', dir: 'out', x: 256, y: -64 }] });
  assert.throws(() => parseIseSym('<drawing/>'), /not an ISE symbol/);
});
