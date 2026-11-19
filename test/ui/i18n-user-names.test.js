// UI: user data is never translated (#4705): projects named as the examples (clock…) and as words the interface translates
// (Counter, Top, Display, input, enable) keep their names in Portuguese, 'clock' not 'relógio', in Open Project, the
// Start page's Recent Projects, File ▸ Recent Projects, the Design pane, a file's tab and Design Properties; the ports'
// names in the Test Bench Wizard's Clock port; while the interface's own labels around them are translated. No warnings.
// (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the examples' names and words of the interface's dictionary ('clock': relógio, 'Counter': Contador, 'Top': Topo…)
const EXAMPLES = ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80'];
const WORDS = ['Counter', 'Top', 'Display', 'input', 'enable'];
const NAMES = [...EXAMPLES, ...WORDS];
const RECENT = ['clock', 'Counter', 'Top', 'input'];
// a module whose ports are named clock and enable (relógio, habilitação), and a file named Display (Mostrador)
const CLOCKED = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity Display is port (clock, enable : in std_logic; y : out std_logic); end;\n'
  + 'architecture rtl of Display is begin process (clock) begin if rising_edge(clock) then y <= enable; end if; end process; end;\n';

async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
const pt = (page) => page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
const en = (page) => page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));

uiTest('#4705 projects named clock, Counter, Top…: their names untranslated in Portuguese, the labels translated', E, async (page) => {
  for (const name of NAMES) await makeProject(env, { name, template: 'empty', ...(name === 'clock' ? { files: { 'src/Display': 'a file named as a word of the interface\n', 'src/disp.vhd': CLOCKED }, top: 'Display' } : {}) });
  for (const name of RECENT.slice(1).reverse()) await page.openProject(name);   // (the newest first)
  await page.openProject('clock');   // (the last: Recent Projects' first)
  await pt(page);
  try {
    // Open Project: every name as it is, the header translated
    await page.menu('Ficheiro', 'Abrir Projeto…');
    await page.waitDialog('Abrir Projeto');
    const open = await page.eval((ns) => {
      const rows = [...document.querySelectorAll('.dlg-overlay table.grid tr')];
      return { header: rows[0].children[0].textContent, names: rows.slice(1).map((r) => r.children[0].textContent).filter((n) => ns.includes(n)).sort() };
    }, NAMES);
    assert.deepEqual(open, { header: 'Projeto', names: [...NAMES].sort() });
    // (and 'relógio', 'Contador', 'Topo', 'Mostrador', 'entrada', 'habilitação' nowhere in it)
    assert.equal(await page.eval(() => /relógio|Contador|Topo|Mostrador|entrada|habilitação/.test(document.querySelector('.dlg-overlay table.grid').textContent)), false);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    // the Start page's Recent Projects: the names, its title translated
    await page.eval(async () => { window.SilinxApp.showLeftPage('start'); await window.SilinxApp.renderStartPage(); });
    assert.deepEqual(await page.eval(() => {
      const box = [...document.querySelectorAll('.start-box')].find((b) => b.querySelector('[data-recent]'));
      return [box.querySelector('h3').textContent, ...[...box.querySelectorAll('[data-recent] a')].map((a) => a.textContent)];
    }), ['Projetos Recentes', ...RECENT]);
    // File ▸ Recent Projects: the names (its popup, as both interfaces show it)
    await page.openMenu('Ficheiro');
    await page.eval(() => [...document.querySelectorAll('.menu-popup .mi')].find((r) => r.querySelector('.lbl')?.textContent === 'Projetos Recentes')
      .dispatchEvent(new MouseEvent('mouseenter')));
    const recentMenu = () => [...document.querySelectorAll('.menu-popup .menu-popup .mi .lbl')].map((l) => l.textContent);
    await page.waitFor((n) => document.querySelectorAll('.menu-popup .menu-popup .mi .lbl')[n]?.textContent === 'Limpar Projetos Recentes', [RECENT.length], { what: 'the submenu translated' });
    assert.deepEqual(await page.eval(recentMenu), [...RECENT, 'Limpar Projetos Recentes']);
    await page.closeMenus();
    // the Design pane: the project's name; its file's tab
    await page.eval(() => window.SilinxApp.showLeftPage('design'));
    await page.eval(() => window.SilinxApp.openFile('src/Display'));
    await page.waitFor(() => [...document.querySelectorAll('.tab .tlabel')].some((l) => l.textContent === 'Display'), [], { what: 'the tab Display' });
    assert.equal(await page.eval(() => [...document.querySelectorAll('.tab .tlabel')].filter((l) => /Mostrador/.test(l.textContent)).length), 0);
    // Design Properties: the project's name, its labels translated
    await page.eval(async () => { (await import('/js/wizards.js')).projectProperties(); });
    await page.waitDialog('Propriedades do Projeto');
    assert.deepEqual(await page.eval(() => {
      const g = document.querySelector('.dlg-overlay .form-grid');
      return [g.children[0].textContent, g.children[1].textContent];
    }), ['Nome:', 'clock']);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    // the Test Bench Wizard's Clock port: the ports' names (clock, enable), its own option translated
    await page.eval(async () => { (await import('/js/tbwizard.js')).testBenchWizard({ module: 'Display' }); });
    await page.waitDialog('Assistente de Bancada de Teste');
    await page.dialogButton('Seguinte >');   // (its Clock and Reset page)
    await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay select option')].some((o) => o.value === 'clock'), [], { what: 'the clock port' });
    await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay select option')].some((o) => o.textContent === '(nenhum)'), [], { what: 'the options translated' });
    assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay select')].find((x) => [...x.options].some((o) => o.value === 'clock')).options]
      .map((o) => o.textContent)), ['(nenhum)', 'clock', 'enable']);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await en(page);
  }
  await noWarnings(page);
});
