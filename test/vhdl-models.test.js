// The VHDL models' entities read, one copy (#4772: core/vhdl-models.js, for core/gowin-routed.js and core/xc7-routed.js).
// Its rules on small texts, and on the models it reads for both: the Gowin copy it replaced, as it was, is the reference
// on the Gowin's models; on the UNISIM ones (the 7-series' copy, moved as it was), unisimModels by their names and ports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vhdlModels } from '../core/vhdl-models.js';
import { GOWIN_VHDL } from '../core/gowin-prims.js';
import { UNISIM_VHDL } from '../core/unisim.js';
import { unisimModels } from '../core/xc7-routed.js';

const plain = (m) => ({ generics: [...m.generics], ports: [...m.ports], defaults: [...m.defaults] });

test('vhdlModels: generics, ports and their widths, the inputs with a default', () => {
  const m = vhdlModels(`library ieee;
entity Cell is
  generic (init : bit_vector(15 downto 0) := (others => '0'); Width, depth : integer := 4);
  port (
    a, b : in std_logic;            -- two scalars; a comment's ; ignored
    d    : in std_logic_vector( 7 downto 0 ) := (others => '1');
    q    : out std_logic_vector(17 downto 0);
    io   : inout std_logic
  );
end Cell;
entity bare is
end bare;
`);
  assert.deepEqual([...m.keys()], ['Cell', 'bare']);
  assert.deepEqual(plain(m.get('Cell')), {
    generics: ['INIT', 'WIDTH', 'DEPTH'],
    ports: [['a', 0], ['b', 0], ['d', 8], ['q', 18], ['io', 0]],
    defaults: ['d'],
  });
  assert.deepEqual(plain(m.get('bare')), { generics: [], ports: [], defaults: [] });
  assert.deepEqual(vhdlModels(''), new Map());
});

test('vhdlModels: an entity whose end is not its name\'s, and a port of another range, are not read', () => {
  const m = vhdlModels('entity a is\n  port (x : in bit);\nend b;\nentity c is\n  port (v : in bit_vector(0 to 3); w : in bit);\nend c;\n');
  assert.deepEqual([...m.keys()], ['c']);
  // (a range other than N downto 0: a scalar, as the copies read it; the models have none)
  assert.deepEqual([...m.get('c').ports], [['v', 0], ['w', 0]]);
});

// core/gowin-routed.js's copy, as it was before #4772
function gowinCopy() {
  const PORTS = new Map();
  for (const m of GOWIN_VHDL.matchAll(/^entity\s+(\w+)\s+is\b([\s\S]*?)^end\s+\1\s*;/gim)) {
    const clause = /\bport\s*\(([\s\S]*)\)\s*;\s*$/i.exec(m[2].trim());
    const map = new Map();
    for (const decl of (clause ? clause[1] : '').split(';')) {
      const d = /^\s*([\w\s,]+?)\s*:\s*(?:in|out|inout)\s+(\w+)(?:\((\d+)\s+downto\s+0\))?/i.exec(decl);
      if (!d) continue;
      for (const n of d[1].split(',')) map.set(n.trim(), d[3] !== undefined ? Number(d[3]) + 1 : 0);
    }
    PORTS.set(m[1], map);
  }
  return PORTS;
}

test('the Gowin\'s models: the same ports as gowin-routed\'s copy read', () => {
  const want = gowinCopy(), got = vhdlModels(GOWIN_VHDL);
  assert.ok(want.size > 50, `${want.size} models`);
  assert.deepEqual([...got.keys()], [...want.keys()]);
  for (const [name, ports] of want) assert.deepEqual([...got.get(name).ports], [...ports], name);
});

test('the UNISIM models: xc7-routed\'s unisimModels, each by its name in upper case', () => {
  const last = new Map();
  for (const [name, m] of vhdlModels(UNISIM_VHDL)) last.set(name.toUpperCase(), m);
  const models = unisimModels();
  assert.ok(models.size > 100, `${models.size} models`);
  assert.deepEqual([...models.keys()], [...last.keys()]);
  for (const [name, m] of last) assert.deepEqual(plain(models.get(name)), plain(m), name);
  assert.deepEqual([...models.get('LUT6').ports], ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'O'].map((p) => [p, 0]));
  assert.deepEqual([...models.get('LUT6').generics], ['INIT']);
  assert.equal(models.get('RAMB18E1').ports.get('ADDRARDADDR'), 14);
});
