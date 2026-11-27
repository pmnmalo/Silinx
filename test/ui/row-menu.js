// The UI tests' rows' menus (#5939): the Tasks interface's side panels have no bars above their trees, their commands
// in the project's and the device's rows' menus (web/js/device-menu.js).

// the row labelled `label` (its name's, as shown) under `host`
const lbl = (host) => `${host} .row .lbl`;

/** The items of the menu of the row labelled `label` under `host`, each its label and ' (disabled)' when it is; closed. */
export async function rowItems(page, host, label) {
  await page.rightClick(lbl(host), { text: label });
  const m = await page.waitFor(() => { const x = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => `${i.textContent.trim()}${i.classList.contains('disabled') ? ' (disabled)' : ''}`); return x.length ? x : null; }, [], { what: `${label}'s menu` });
  await page.closeMenus();
  return m;
}

/** The item `item` of the menu of the row labelled `label` under `host`, run (the menu waited for: it may come after a
 *  module is loaded). */
export async function runRowItem(page, host, label, item) {
  await page.rightClick(lbl(host), { text: label });
  await page.waitFor((t) => [...document.querySelectorAll('body > .menu-popup .mi')].some((i) => i.textContent.trim() === t), [item], { what: item });
  await page.click('body > .menu-popup .mi', { text: item });
}

/** The open project's device's row's label (xc3s250e-4-cp132), as the trees show it. */
export const deviceLabel = (page) => page.eval(() => { const d = window.Silinx.project.device; return `${d.part}${d.speed}-${d.package}`; });
