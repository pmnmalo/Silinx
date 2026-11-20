// A page left open across an upgrade of its server (#4754): the server says its version (X-Silinx-Version) to a page
// of another one (web/js/api.js staleCheck, a 'silinx-stale' event), whose requests it may refuse (its token is the
// server's former one): said once in the console, and a reload offered (the page's unsaved documents asked about
// by the browser's own beforeunload).
export const staleText = ({ page, server }) => `This page is Silinx ${page}, the server Silinx ${server}: reload the page to use it (its requests may be refused until then).`;

/** Watch for a server of another version: logWarning(text) once (its WARNING line), then confirm (a dialog) and reload on yes. */
export function watchStale({ logWarning, confirmDlg, reload = () => location.reload(), target = globalThis }) {
  const on = async (e) => {
    const d = e.detail || {};
    logWarning(staleText(d));
    if (await confirmDlg('Silinx was updated', `This page is Silinx ${d.page}; the server is Silinx ${d.server}. Reload the page?`, { yes: 'Reload', no: 'Later' })) reload();
  };
  target.addEventListener('silinx-stale', on);
  return () => target.removeEventListener('silinx-stale', on);
}
