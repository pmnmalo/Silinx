// Import Project… and Export Project (.zip)… (#3703): their window opened from the File menu, the software
// chosen in it (web/js/project-zip-dialogs.js).
export const FILE = '.dlg-overlay input[data-field=file]', FOLDER = '.dlg-overlay input[data-field=folder]';

// a try at giving a folder (Firefox, WebKit): a small project's folder listed takes a moment (#4233)
export const SET_FOLDER_TIMEOUT = 15000;

/**
 * The project's folder `dir` given to Import Project…'s folder input (`sel`). In Firefox and WebKit (Playwright),
 * setInputFiles waits for the input's 'input' event, which WebKit's folder listing (done apart, then given to the
 * input) now and then never sends (#4233): each try bounded, and after one that timed out the input emptied and the
 * folder given again (three tries). Chrome (the DevTools protocol) as any input's files.
 */
export async function setFolder(page, dir, sel = FOLDER) {
  if (!page.page?.locator) return page.setFiles(sel, [dir]);
  const input = page.page.locator(sel).first();
  page.lastAction = `setFolder ${sel}`;
  for (let attempt = 1; ; attempt++) {
    try { return await input.setInputFiles([dir], { timeout: SET_FOLDER_TIMEOUT }); } catch (e) {
      if (!/Timeout \d+ms exceeded/.test(e.message) || attempt === 3) throw e;
      await input.evaluate((el) => { el.value = ''; });
    }
  }
}

const software = (page, id) => page.click(`.dlg-overlay input[data-field=software-${id}]`);

/** Export Project (.zip)… to `id` (silinx, xilinx): the window closed, the download started. */
export async function exportZip(page, id) {
  await page.menu('File', 'Export Project (.zip)…');
  await page.waitDialog('Export Project');
  await software(page, id);
  await page.dialogButton('Export');
  await page.waitNoDialog();
}

/** Import Project…'s window, `id` (silinx, xilinx) chosen in it. */
export async function openImport(page, id) {
  await page.menu('File', 'Import Project…');
  await page.waitDialog('Import Project');
  await software(page, id);
}
