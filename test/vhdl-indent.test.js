// VHDL's indentation as the HDL editor gives it (#5218, core/vhdl/indent.js): against the examples' own (every line of
// their VHDL files, each indented from the lines before it, but the continued statements aligned by hand), and the
// cases of a person typing: a line after a declaration, after 'end if;', a closing word brought back, an open '('.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { vhdlIndent, VHDL_ELECTRIC, scan } from '../core/vhdl/indent.js';

// each line of `text` (but `|`'s, the cursor's: Enter there) indented from the lines before it
const indents = (text, unit = 2) => { const lines = text.split('\n'); return lines.map((l, i) => vhdlIndent(lines.slice(0, i), l, unit)); };
const asIs = (text) => text.split('\n').map((l) => l.match(/^ */)[0].length);

test('vhdl indent: the examples\' VHDL files, each line as indented by hand (but statements continued, aligned by hand)', () => {
  const files = execFileSync('git', ['ls-files', 'examples/*.vhd', 'examples/*.vhdl'], { encoding: 'utf8' }).trim().split('\n')
    .filter((f) => !/light8080/.test(f));   // (the light8080 core, kept as it is, #2544)
  assert.ok(files.length > 40);
  const off = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    const unit = Math.min(...lines.filter((l) => /^ +\S/.test(l)).map((l) => l.match(/^ */)[0].length));
    lines.forEach((l, i) => {
      if (!l.trim() || /^\s*--/.test(l)) return;
      const got = vhdlIndent(lines.slice(0, i), l, unit), want = l.match(/^ */)[0].length;
      if (got !== want) off.push(`${f}:${i + 1}: ${got} ${want}`);
    });
  }
  assert.deepEqual(off, [
    'examples/breadboard/sim/tb_breadboard.vhd:46: 15 17',
    'examples/gates/sim/tb_gates.vhd:39: 15 17',
    'examples/gates/sim/tb_gates.vhd:44: 15 17',
    'examples/stopwatch/src/stopwatch.vhd:124: 8 11',
    'examples/traffic/sim/tb_traffic.vhd:88: 18 20',
    'examples/traffic/src/timer.vhd:101: 8 13',
    'examples/traffic/src/timer.vhd:102: 8 13',
  ]);
});

test('vhdl indent: a counter as a person types it: the block\'s indentation, \'end\', \'begin\', \'elsif\' back to their opening\'s', () => {
  const text = `library ieee;
use ieee.numeric_std.all;

entity counter is
  port (clk : in std_logic;
        q   : out std_logic_vector(3 downto 0));
end counter;

architecture rtl of counter is
  signal r : unsigned(3 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        r <= (others => '0');
      elsif en = '1' then
        r <= r + 1;
      else
        null;
      end if;
    end if;
  end process;
  q <= std_logic_vector(r);
end rtl;`;
  assert.deepEqual(indents(text), asIs(text));
});

test('vhdl indent: Enter: the line after a statement, a declaration, \'end if;\', at their block\'s level; after an opening one deeper', () => {
  const at = (before, after = '') => vhdlIndent(before.split('\n'), after);
  assert.equal(at('architecture rtl of c is\n  signal r : bit;'), 2);
  assert.equal(at('architecture rtl of c is\nbegin\n  process (clk)\n  begin\n    if a then\n      x <= 1;\n    end if;'), 4);
  assert.equal(at('entity c is'), 2);
  assert.equal(at('process (clk) begin'), 2);
  const inP = (s) => at(`  process\n  begin\n${s}`);
  assert.equal(inP('    if a then x <= 1; end if;'), 4);
  assert.equal(at('  for i in 0 to 3 loop'), 4);
  assert.equal(at('  while i < 3 loop'), 4);
  assert.equal(at('g : for i in 0 to 3 generate'), 2);
  assert.equal(at('  type r_t is record'), 4);
  assert.equal(at('architecture a of c is\n  type s_t is (IDLE, RUN);'), 2);
  assert.equal(at('  case s is'), 4);
  assert.equal(at('  case s is\n    when IDLE =>'), 6);
  assert.equal(at('  case s is\n    when IDLE => x <= 1;'), 6);
  // not blocks: a function's declaration, a wait for, an instantiation's 'entity', an attribute's 'is'
  assert.equal(at('package p is\n  function f (a : integer) return integer;'), 2);
  assert.equal(inP('    wait for 10 ns;'), 4);
  assert.equal(at('architecture a of c is\nbegin\n  u1 : entity work.c port map (a => b);'), 2);
  assert.equal(at('architecture a of c is\n  attribute keep of s : signal is true;'), 2);
  // a statement continued: one level deeper than its start; an instantiation's port map
  assert.equal(at('  x <= a when s = \'1\' else'), 4);
  assert.equal(at('begin\n  u1 : entity work.c'), 4);
  // a function's body; a process's declarations
  assert.equal(at('  pure function f (a : integer) return integer is'), 4);
  assert.equal(at('  p : process (clk)'), 4);
  assert.equal(at('  p : process (clk)\n    variable v : integer;'), 4);
  // keywords in a comment or a string are not
  assert.equal(inP('    x <= 1; -- if a then'), 4);
  assert.equal(inP('    report "begin loop is";'), 4);
  // nothing open: column 0; an 'end' too many stays at 0
  assert.equal(at(''), 0);
  assert.equal(at('end;\nend;'), 0);
  assert.equal(vhdlIndent([], 'end'), 0);
});

test('vhdl indent: a line typed with a closing word: back to its block\'s opening', () => {
  const body = 'architecture a of c is\n  signal s : bit;\nbegin\n  process (clk)\n  begin\n    if a then\n      x <= 1;'.split('\n');
  assert.equal(vhdlIndent(body, 'end if;'), 4);
  assert.equal(vhdlIndent(body, 'elsif b then'), 4);
  assert.equal(vhdlIndent(body, 'else'), 4);
  assert.equal(vhdlIndent(body.slice(0, 2), 'begin'), 0);
  assert.equal(vhdlIndent(body.slice(0, 4), 'begin'), 2);
  assert.equal(vhdlIndent([...body, '    end if;'], 'end process;'), 2);
  // a ';' left out before it: the 'end' all the same
  assert.equal(vhdlIndent([...body, '      y <= 2'], 'end if;'), 4);
  assert.equal(vhdlIndent([...body, '      y <= 2', '    end if;'], 'end process;'), 2);
  // a case's when, one level under it; its 'end case' back to the case
  const cs = ['  case s is', '    when A =>', '      x <= 1;'];
  assert.equal(vhdlIndent(cs, 'when B =>'), 4);
  assert.equal(vhdlIndent(cs, 'end case;'), 2);
  assert.equal(vhdlIndent(cs.slice(0, 1), 'when A =>'), 4);
  // 'else' and 'when' of an assignment continued are not
  assert.equal(vhdlIndent(['begin', '  y <= a'], 'when s = \'1\' else b;'), 4);
  assert.equal(vhdlIndent(['begin', '  y <= a when s = \'1\''], 'else b;'), 4);
});

test('vhdl indent: an open \'(\': under its first item (the \')\' the editor closed carried with the line); one level deeper when it ends its line, its \')\' back', () => {
  assert.equal(vhdlIndent(['entity c is', '  port (clk : in std_logic;'], ')'), 8);
  assert.equal(vhdlIndent(['entity c is', '  Port ( clk : in std_logic;', '         rst : in std_logic;'], ''), 9);
  assert.equal(vhdlIndent(['entity c is', '    port ('], '', 4), 8);
  assert.equal(vhdlIndent(['entity c is', '    port (', '        a : in bit'], ');', 4), 4);
  assert.equal(vhdlIndent(['entity c is', '    port (  -- the ports'], '', 4), 8);
  // closed: the statement's level
  assert.equal(vhdlIndent(['entity c is', '  port (clk : in std_logic;', '        q : out bit);'], ''), 2);
  assert.equal(vhdlIndent(['entity c is', '  port (clk : in std_logic;', '        q : out bit);'], 'end c;'), 0);
  // a ')' too many does not throw
  assert.equal(vhdlIndent(['architecture a of c is', 'begin', '  x <= y);'], ''), 2);
});

test('vhdl indent: the blocks open, as scanned', () => {
  const { stack, parens, stmt } = scan(['architecture a of c is', 'begin', '  process (clk)', '  begin', '    case s is', '      when A =>']);
  assert.deepEqual(stack.map((b) => [b.kind, b.indent]), [['architecture', 0], ['process', 2], ['case', 4], ['when', 6]]);
  assert.deepEqual([parens, stmt], [[], null]);
});

test('vhdl indent: the closing words typed that bring a line back (indentOnInput), not a name that starts with one', () => {
  for (const s of ['end ', '  end;', '    end ', '  END ', '  elsif ', '  else', '  when ', 'begin', '  Begin']) assert.ok(VHDL_ELECTRIC.test(s), s);
  for (const s of ['  end', '  endereco', '  ending ', '  elsewhere', '  whenever', '  beginning', '  x <= a when ', '  else_x']) assert.ok(!VHDL_ELECTRIC.test(s), s);
});
