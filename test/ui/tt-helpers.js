// UI tests' helpers for the truth table editor (#4057): its Karnaugh map shown under its result by the result's
// Show K-map button (hidden when a table opens, each editor its own), its groups the result's SOP or POS.

// the map of the editor `T` (a selector) shown: its result's Show K-map pressed if it is not, then its map waited for (drawn: flat, 3D or a surface)
export const showKmap = async (page, T) => {
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`), [T], { what: 'the Show K-map button' });
  await page.eval((t) => { const b = document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`); if (!b.classList.contains('active')) b.click(); }, T);
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-box .tt-kmap-host`)?.childElementCount, [T], { what: 'the Karnaugh map' });
};
// the map hidden again (its result's Hide K-map pressed)
export const hideKmap = async (page, T) => {
  await page.eval((t) => { const b = document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`); if (b?.classList.contains('active')) b.click(); }, T);
  await page.waitFor((t) => !document.querySelector(`${t} svg.tt-kmap`), [T], { what: 'the Karnaugh map hidden' });
};
// the map's groups: the K-map result's SOP or POS ('sop' | 'pos') clicked
export const groupsOf = async (page, T, k) => {
  await page.eval((t, x) => document.querySelector(`${t} .tt-kmap-res .tt-kind-${x}`).click(), T, k);
  await page.waitFor((t, x) => document.querySelector(`${t} .tt-kmap-res .tt-kind-${x}`)?.classList.contains('active'), [T, k], { what: `the K-map's ${k.toUpperCase()}` });
};
