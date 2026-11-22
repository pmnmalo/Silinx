// Usability tests (#5206, phase 2): a project's lifecycle through the interface, a person's way: File ▸ New Project…
// (its wizard's pages, a board chosen), Project ▸ New Source… (a type, its name and language, its pages to Finish), a
// module's row of the Design pane right-clicked (Set as Top Module, Rename…, Remove from Project), Edit ▸ Undo / Redo,
// File ▸ Export Project (.zip)… and Import Project… (the zip picked), File ▸ Close Project and Open Project… (its row
// double-clicked). Its readers: what the Design pane, the documents' tabs and the console show.
import { pickSourceType, waitNewSourcePage } from '../../ui/new-source-helpers.js';
import { waitDownload } from '../../ui/harness.js';
import { tr } from './hdl-actions.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Design pane's module rows, as a person reads them: "label [Badge*] [Badge] (meta)" (* the base; the top's
 *  label marked "▲"), indented by their depth under the device's row. */
export const designRows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].slice(2).map((r) => {
  let d = 0;
  for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}${x.classList.contains('warn') ? '!' : ''}]`);
  const meta = r.querySelector('.meta')?.textContent;
  return `${'  '.repeat(Math.max(0, d - 3))}${r.classList.contains('top-mod') ? '▲' : ''}${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${meta ? ` ${meta}` : ''}`;
}));

/** The documents open (their tabs' ids, in their order), the one in front, and those with unsaved changes. */
export const openDocs = (page) => page.eval(() => ({
  ids: window.Silinx.docs.map((d) => d.id), active: window.Silinx.active?.id ?? null,
  dirty: window.Silinx.docs.filter((d) => d.dirty || d.modified).map((d) => d.id),
}));

/** The Errors and the Warnings tabs' rows: their messages (their fixes' buttons left out). */
export const diagRows = (page) => page.eval(() => Object.fromEntries(['errors', 'warnings'].map((k) => [k, [...document.querySelectorAll(`#console-${k} .diag`)]
  .map((d) => [...d.children].filter((e) => e.tagName === 'SPAN' && e.getAttribute('role') !== 'button').map((e) => e.textContent).join(''))])));

/** The console's lines (the empty ones left out), from line `from` on. */
export const consoleLines = (page, from = 0) => page.eval((k) => [...document.querySelectorAll('#console-log .ln')].slice(k).map((l) => l.textContent).filter((t) => t.trim()), from);
export const consoleCount = (page) => page.eval(() => document.querySelectorAll('#console-log .ln').length);

/** The project's state as the page has it, once it stops changing (a reload after a write, the HDL made again). */
export async function pageState(page) {
  const read = async () => ({ name: await page.eval(() => window.Silinx.project?.name ?? null), top: await page.eval(() => window.Silinx.project?.top ?? null), rows: await designRows(page).catch(() => []), docs: await openDocs(page), diags: await diagRows(page) });
  let a = await read();
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    const b = await read();
    if (JSON.stringify(a) === JSON.stringify(b) && await page.eval(() => !document.querySelector('.dlg-overlay'))) return b;
    a = b;
  }
  return a;
}

export function projectActions(page, env) {
  const L = (list) => tr(page, list);
  const a = {
    /** File ▸ New Project…: With an FPGA, its name, the board, the preferred language, Finish. */
    async newProject({ name, board, lang = 'vhdl' }) {
      const [fileL, itemL, wizL, nextL, finishL, settingsL, summaryL] = await L(['File', 'New Project…', 'New Project Wizard', 'Next >', 'Finish', 'Project Settings', 'Project Summary']);
      await page.menu(fileL, itemL);
      await page.waitDialog(wizL);
      await page.dialogButton(nextL);   // (its kind: With an FPGA, #5041)
      await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
      await page.dialogButton(nextL);
      await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [settingsL], { what: settingsL });
      await page.fill('.dlg-overlay .wiz-main select', board, { index: 0 });
      await page.fill('.dlg-overlay .wiz-main select', lang, { index: 9 });
      await page.dialogButton(nextL);
      await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [summaryL], { what: summaryL });
      const summary = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main pre').textContent);
      await page.dialogButton(finishL);
      await page.waitNoDialog();
      await page.waitFor((n) => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `project ${name} open` });
      return summary;
    },

    /** Project ▸ New Source…: the type, Next >, its file name (and language), Next > through its pages (a module's
     *  ports typed in the blank row; a test bench's unit under test clicked), Finish; the file in the project. */
    async newSource({ type, name, lang, ports = [], uut, file, wizard }) {
      const [projL, itemL, dlgL, nextL, finishL, fileL, typeL, uutL, wizL, wizardL] = await L(['Project', 'New Source…', 'New Source', 'Next >', 'Finish', 'File Name and Location', type, 'Associate Source', 'Wizard >', wizard || 'Wizard']);
      await page.menu(projL, itemL);
      await page.waitDialog(dlgL);
      await pickSourceType(page, typeL);
      await page.dialogButton(nextL);
      await waitNewSourcePage(page, fileL);
      await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
      if (lang) await page.fill('.dlg-overlay .wiz-main select', lang);
      // (a wizard's type: Wizard >, its own window, its pages as it proposes them)
      if (wizard) { await page.dialogButton(wizL); await page.waitDialog(wizardL); }
      for (let k = 0; k < 8; k++) {
        const h = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3, .dlg-overlay h3')?.textContent);
        // (Define Module: each port typed in the table's blank last row, its direction chosen)
        if (await page.eval(() => !!document.querySelector('.dlg-overlay .wiz-main table.grid input[type=text]')) && ports.length) {
          for (const [n, dir] of ports) {
            const rows = await page.eval(() => document.querySelectorAll('.dlg-overlay .wiz-main table.grid tr').length);
            await page.fill('.dlg-overlay .wiz-main table.grid tr:last-child input[type=text]', n);
            await page.waitFor((r) => document.querySelectorAll('.dlg-overlay .wiz-main table.grid tr').length === r + 1, [rows], { what: `the port ${n} added` });
            await page.fill('.dlg-overlay .wiz-main table.grid select', dir, { index: rows - 2 });
          }
          ports = [];
        }
        if (uut && h === uutL) {
          // (its row's text after its icon: "alu (src/alu.vhd)")
          const k = await page.eval((u) => [...document.querySelectorAll('.dlg-overlay .wiz-main .src-types .st')].filter((r) => r.getClientRects().length).findIndex((r) => r.lastChild.textContent.startsWith(`${u} (`)), uut);
          await page.click('.dlg-overlay .wiz-main .src-types .st', { index: await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main .src-types .st')].findIndex((r) => r.getClientRects().length)) + k });
          uut = null;
        }
        const done = await page.eval((f) => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].some((b) => b.textContent.trim() === f && !b.disabled && b.getClientRects().length), finishL);
        if (done) { await page.dialogButton(finishL); break; }
        await page.dialogButton(nextL);
        await page.waitFor((x) => document.querySelector('.dlg-overlay .wiz-main h3, .dlg-overlay h3')?.textContent !== x || !document.querySelector('.dlg-overlay'), [h], { what: `${type}: the page after ${h}` });
      }
      await page.waitNoDialog();
      await page.waitFor((f) => (window.Silinx.fileTree || []).includes(f), [file], { what: `${file} in the project`, timeout: 15000 });
    },

    /** A module's row of the Design pane right-clicked, an item of its menu clicked (the Design pane in front). */
    async rowMenu(label, item) {
      const [itemL] = await L([item]);
      await page.leftTab('design');
      const i = await page.waitFor((l) => { const k = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.getClientRects().length && r.querySelector('.lbl').textContent === l); return k >= 0 ? k + 1 : 0; }, [label], { what: `the row ${label}` }) - 1;
      await page.rightClick('#hier .row .lbl', { index: i });
      await page.waitForSelector('body > .menu-popup');
      await page.click('body > .menu-popup .mi', { text: itemL });
    },
    /** A module's row double-clicked: its source opened. */
    async openRow(label) { await page.leftTab('design'); await page.treeRow('#hier', label, { dbl: true, exact: true }); },
    async setTop(label) { await a.rowMenu(label, 'Set as Top Module'); },
    /** Rename… of a module: its new name typed, Rename. */
    async rename(label, to) {
      await a.rowMenu(label, 'Rename…');
      const [dlgL, okL] = await L(['Rename', 'Rename']);
      await page.waitDialog(dlgL);
      await page.eval((t) => { const i = document.querySelector('.dlg-overlay .form-grid input'); i.value = t; i.dispatchEvent(new Event('input')); }, to);
      await page.dialogButton(okL);
      await page.waitNoDialog();
    },
    /** Remove from Project of a module, Yes to its question: the question's text. */
    async remove(label) {
      await a.rowMenu(label, 'Remove from Project');
      const [dlgL, yesL] = await L(['Remove Source', 'Yes']);
      await page.waitDialog(dlgL);
      const text = await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text')?.textContent ?? '');
      await page.dialogButton(yesL);
      await page.waitNoDialog();
      return text;
    },
    /** Edit ▸ the menu's Undo or Redo item (its label names what it undoes): the label clicked. */
    async editMenu(which) {
      const [editL] = await L(['Edit']);
      const items = await page.openMenu(editL);
      const want = await L([which]);
      const it = items.find((x) => x.label.startsWith(want[0]) && !x.disabled);
      if (!it) { await page.closeMenus(); throw new Error(`no ${which} in the Edit menu: ${items.map((x) => x.label).join(' | ')}`); }
      await page.closeMenus();
      await page.menu(editL, it.label);
      return it.label;
    },

    /** File ▸ Export Project (.zip)…, Silinx, Export: the zip downloaded. */
    async exportZip(project) {
      const [fileL, itemL, dlgL, okL] = await L(['File', 'Export Project (.zip)…', 'Export Project', 'Export']);
      await page.menu(fileL, itemL);
      await page.waitDialog(dlgL);
      await page.click('.dlg-overlay input[data-field=software-silinx]');
      await page.dialogButton(okL);
      await page.waitNoDialog();
      return waitDownload(page, `${project}-silinx.zip`, 30000);
    },
    /** File ▸ Import Project…, Silinx, the zip picked, its name typed, Import: the project open. */
    async importZip(zip, name) {
      const [fileL, itemL, dlgL, okL] = await L(['File', 'Import Project…', 'Import Project', 'Import']);
      await page.menu(fileL, itemL);
      await page.waitDialog(dlgL);
      await page.click('.dlg-overlay input[data-field=software-silinx]');
      await page.setFiles('.dlg-overlay input[data-field=file]', [zip]);
      await page.fill('.dlg-overlay input[type=text]', name);
      await page.dialogButton(okL);
      await page.waitFor((n) => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} imported`, timeout: 30000 });
    },
    /** File ▸ Close Project: the Start page. */
    async close() {
      const [fileL, itemL] = await L(['File', 'Close Project']);
      await page.menu(fileL, itemL);
      await page.waitFor(() => window.Silinx.project === null, [], { what: 'the project closed' });
    },
    /** File ▸ Open Project…, the project's row double-clicked. */
    async open(name) {
      const [fileL, itemL, dlgL] = await L(['File', 'Open Project…', 'Open Project']);
      await page.menu(fileL, itemL);
      await page.waitDialog(dlgL);
      await page.waitFor((n) => [...document.querySelectorAll('.dlg-overlay table.grid tr td:first-child')].some((c) => c.textContent === n), [name], { what: `${name} listed` });
      const i = await page.eval((n) => [...document.querySelectorAll('.dlg-overlay table.grid tr')].findIndex((r) => r.cells[0]?.textContent === n), name);
      await page.dblclick('.dlg-overlay table.grid tr', { index: i });
      await page.waitFor((n) => window.Silinx.project?.name === n && document.querySelector('#hier .row') && window.Silinx.startupChecked, [name], { what: `${name} open` });
      await page.waitNoDialog();
    },
  };
  return a;
}
