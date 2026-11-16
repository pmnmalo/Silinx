// std_logic's resolution (#3926): a signal with several drivers resolves them as IEEE 1164's `resolved` does, the
// weak values ('W', 'L', 'H') included: a strong value wins over a weak one, and a weak one stays weak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, outW, vhd } from './lang-util.js';

const CH = ['U', 'X', '0', '1', 'Z', 'W', 'L', 'H', '-'];
// IEEE 1164's resolution_table, as the standard writes it (rows and columns in CH's order).
const IEEE = [
  'UUUUUUUUU',
  'UXXXXXXXX',
  'UX0X0000X',
  'UXX11111X',
  'UX01ZWLHX',
  'UX01WWWWX',
  'UX01LWLWX',
  'UX01HWWHX',
  'UXXXXXXXX',
];
// The simulator's std_logic has no 'U' nor '-' of its own: both are 'X' (its values are 0 1 X Z, and W L H their
// weak strength), so the table is compared with 'U' and '-' read as 'X', in the drivers and in the result.
const simulated = c => (c === 'U' || c === '-' ? 'X' : c);

test('std_logic resolution: the whole 9×9 table of IEEE 1164 (U and - simulated as X)', () => {
  const name = (i, j) => `r${i}${j}`;
  const sigs = CH.flatMap((_, i) => CH.map((_, j) => name(i, j)));
  const body = CH.flatMap((a, i) => CH.map((b, j) => `  ${name(i, j)} <= '${a}';\n  ${name(i, j)} <= '${b}';`)).join('\n');
  const reports = CH.map((_, i) => `    report ${CH.map((_, j) => `std_logic'image(${name(i, j)})`).join(' & ')};`).join('\n');
  const r = outW(vhd(`${body}
  process begin
    wait for 1 ns;
${reports}
    wait;
  end process;`, `  signal ${sigs.join(', ')} : std_logic;`));
  const expected = IEEE.map(row => [...row].map(c => `'${simulated(c)}'`).join(''));
  assert.deepEqual(r, expected);
});

test('std_logic resolution: a pull-up (H) and an open collector (0 or Z), as in the issue', () => {
  const r = outW(vhd(`
  n <= 'H';
  n <= '0' when d = '1' else 'Z';
  process begin
    wait for 1 ns; report std_logic'image(n);
    d <= '1';
    wait for 1 ns; report std_logic'image(n);
    d <= '0';
    wait for 1 ns; report std_logic'image(n) & " " & boolean'image(n = '1') & " " & std_logic'image(to_x01(n));
    wait;
  end process;`, `  signal n : std_logic := 'Z';
  signal d : std_logic := '0';`));
  // ('H' is a 1 to the operators, as to_x01 says: the simulator's = compares the levels)
  assert.deepEqual(r, ["'H'", "'0'", "'H' true '1'"]);
});

test('std_logic_vector resolution: weak bits per bit, kept through a slice, a copy and to_string; an event from H to 1', () => {
  const r = outW(vhd(`
  nb <= "HHHH";
  nb <= "0Z1L";
  copy <= nb;
  w <= 'L';
  w <= 'H' after 2 ns, '1' after 4 ns;
  process begin
    wait for 1 ns;
    report to_string(nb) & " " & std_logic'image(nb(2)) & " " & std_logic'image(nb(0)) & " " & to_string(copy);
    report std_logic'image(w);
    wait;
  end process;
  process (w) begin
    if now > 0 ns then report "w " & std_logic'image(w) & " at " & time'image(now); end if;
  end process;`, `  signal nb, copy : std_logic_vector(3 downto 0);
  signal w : std_logic := 'Z';`));
  assert.deepEqual(r, ["0H1W 'H' 'W' 0H1W", "'L'", "w 'W' at 2 ns", "w '1' at 4 ns"]);
});

test('std_logic: a signal with one driver keeps its weak value; the operators give strong values', () => {
  const r = out(vhd(`
  p <= 'H';
  q <= not p;
  s <= p and '1';
  process begin
    wait for 1 ns;
    report std_logic'image(p) & std_logic'image(q) & std_logic'image(s);
    wait;
  end process;`, '  signal p, q, s : std_logic;'));
  assert.deepEqual(r, ["'H''0''1'"]);
});

test('std_logic: to_x01, to_bit and to_bitvector make the weak values strong; a literal of L H W keeps them', () => {
  const r = out(vhd(`
  process
    variable v : std_logic_vector(3 downto 0) := "LHW1";
    constant c : bit_vector(1 downto 0) := to_bitvector("HL");
  begin
    report to_string(v) & " " & to_string(to_x01(v)) & " " & to_string(to_bitvector(v(3 downto 2))) & " " & to_string(c);
    report std_logic'image(to_x01(v(2))) & " " & bit'image(to_bit(v(3)));
    wait;
  end process;`));
  assert.deepEqual(r, ['LHW1 01X1 01 10', "'1' '0'"]);
});
