// UI: Check Syntax's console lines from its two entry points (#5332): Process ▸ Check Syntax (the module selected in the
// Design tree) and the editor toolbar's Check Syntax of the file, in VHDL and in Verilog, with a syntax error and
// without. A file with a syntax error is not elaborated (as ISE's XST: its Check Syntax stops at the parser's errors),
// so neither prints an "Elaborating" line then; the toolbar's printed its file's "Elaborating module" line before the
// error. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const VHDL = (semi) => `library ieee;
use ieee.std_logic_1164.all;

entity counter is
  port (clk : in std_logic;
        q   : out std_logic);
end counter;

architecture rtl of counter is
  signal r : std_logic := '0';
begin
  process (clk)
  begin
    if rising_edge(clk) then
      r <= not r${semi}
    end if;
  end process;
  q <= r;
end rtl;
`;
const VERILOG = (semi) => `module counter(input clk, output reg q);
  initial q = 1'b0${semi}
  always @(posedge clk) q <= ~q;
endmodule
`;
const LANGS = {
  vhdl: { file: 'src/counter.vhd', text: VHDL, parsed: 'Parsing VHDL file "src/counter.vhd" into library work',
    error: 'ERROR:HDLCompiler - "src/counter.vhd" Line 15: expected \';\' after \'r\'', size: '3 signals, 2 processes' },
  verilog: { file: 'src/counter.v', text: VERILOG, parsed: 'Analyzing Verilog file "src/counter.v" into library work',
    error: 'ERROR:HDLCompiler - "src/counter.v" Line 2: expected \';\' after \'1\'b0\'', size: '2 signals, 2 processes' },
};

const consoleLines = (page) => page.eval(() => [...document.getElementById('console-log').children].map((l) => l.textContent.trim()));
async function run(page, start) {
  const n = (await consoleLines(page)).length;
  await start();
  await page.waitFor((k) => [...document.getElementById('console-log').children].slice(k).some((l) => /^Process "Check Syntax" (failed|completed)/.test(l.textContent.trim())), [n], { what: 'Check Syntax done' });
  return (await consoleLines(page)).slice(n).filter(Boolean);
}

for (const [lang, L] of Object.entries(LANGS)) {
  for (const bad of [true, false]) {
    uiTest(`#5332 Check Syntax's lines, Process menu and editor toolbar: ${lang}, ${bad ? 'a syntax error' : 'none'}`, E, async (page) => {
      const name = `CheckLines${lang}${bad ? 'Bad' : 'Ok'}`;
      await makeProject(env, { name, files: { [L.file]: L.text(bad ? '' : ';') }, top: 'counter' });
      await page.openProject(name);
      // Process ▸ Check Syntax, the module selected in the Design tree
      await page.treeRow('#hier', 'counter', { exact: true });
      const menu = await run(page, () => page.menu('Process', 'Check Syntax'));
      assert.deepEqual(menu, ['Started : "Check Syntax".', L.parsed,
        ...(bad ? [L.error, 'Process "Check Syntax" failed (1 error(s), 0 warning(s))']
          : [`Elaborating top module <counter>: ${L.size}.`, 'Process "Check Syntax" completed successfully'])]);
      // the editor toolbar's Check Syntax of the file: the same lines, of the file (its modules elaborated: no error)
      await page.eval((f) => window.SilinxApp.openFile(f), L.file);
      await page.waitFor((f) => window.Silinx.active?.id === `file:${f}` && window.Silinx.active.editor, [L.file], { what: 'the file in its editor' });
      const bar = await run(page, () => page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' }));
      assert.deepEqual(bar, [`Started : "Check Syntax" of ${L.file}.`, L.parsed,
        ...(bad ? [L.error, 'Process "Check Syntax" failed (1 error(s), 0 warning(s))']
          : [`Elaborating module <counter>: ${L.size}.`, 'Process "Check Syntax" completed successfully'])]);
      assert.deepEqual([...menu, ...bar].filter((l) => /^WARNING/.test(l)), []);
    });
  }
}
