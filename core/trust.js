// Trust for outside projects (#2830), the third layer of SECURITY.md's "Files and projects from outside": a project that
// came from outside (a zip, an ISE project, a design link, the MCP's import_project) is marked `trusted: false` in its
// silinx.json by the import. It opens, is edited, checked, simulated and implemented with the Silinx toolchain, in the
// browser's sandbox; what runs outside it (Xilinx ISE over Docker or ssh, programming a board or a PROM) waits until the
// user trusts it: the console's line with its Trust Project button, said when the project opens. A project the user
// made is trusted from the start (no `trusted` field), and recorded as such outside it (#4735): a project with no record
// (a folder unzipped by hand, cloned by command-line git, restored from the .trash) is untrusted whatever it says. Only the user trusts a project, in the interface: the MCP server
// has no tool for it, so that an assistant led astray by what it read cannot. A project the MCP server makes holds what an
// assistant wrote: untrusted from the start too, `madeBy: "mcp"` saying so (#2981). A shared project an editor of its
// link changed (#3355): untrusted from that editor's first change written, `madeBy: "editor"` saying so. Isomorphic
// (browser and server).

/** Whether a project's description lets it run what is outside the browser's sandbox. */
export const isTrusted = pj => pj?.trusted !== false;

// where an untrusted project came from, as its messages say it (pj: its description, #2981)
/** A project with no trust record outside it (#4735: server/trust-store.js, web/js/trust-records.js): its folder reached
 *  the workspace other than through Silinx (madeBy as the server reads it, never written into its silinx.json). */
export const UNRECORDED = 'unrecorded';
const ORIGINS = { mcp: 'was made through the MCP server (by an assistant)', editor: 'was changed by an editor of its shared link', merge: 'had a contribution merged into it (Merge Contribution)',
  [UNRECORDED]: 'was not made in Silinx nor trusted here (its folder reached the workspace outside Silinx)' };
const origin = pj => ORIGINS[pj?.madeBy] || 'came from outside (imported)';

/** The refusal of `what` (Xilinx ISE, programming the board…) for an untrusted project. */
export const untrustedMessage = (name, what, pj = null) => `project '${name}' ${origin(pj)}: ${what} runs only once you trust it (Trust Project, in the console when the project opens)`;

// a refusal's text (untrustedMessage's), its project's name first
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const REFUSAL = new RegExp(`project '(.+?)' (?:${[...Object.values(ORIGINS), 'came from outside (imported)'].map(esc).join('|')}): .+ runs only once you trust it`);

/** The project a refusal for an untrusted project names (untrustedMessage's, in a console's line: the error itself or
 *  its "… failed:" line, #4583); null for any other text. */
export const refusedProject = text => REFUSAL.exec(String(text))?.[1] ?? null;

/** The console's line of an untrusted project opened. */
export const untrustedNotice = (name, pj = null) => `Project "${name}" ${origin(pj)}: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.`;

/** A project description marked as from outside (the import's last step): an imported one, whoever made it before. */
export const markUntrusted = pj => { const { madeBy, ...rest } = pj; return { ...rest, trusted: false }; };   // eslint-disable-line no-unused-vars

/** A project description the MCP server makes (#2981): untrusted, made by an assistant. */
export const markMadeByMcp = pj => ({ ...pj, trusted: false, madeBy: 'mcp' });

/** A shared project's description once an editor of its link changes a file of it (#3355): untrusted, changed by an
 *  editor; one untrusted already kept as it is (who made it said as before). */
export const markEditedByEditor = pj => (isTrusted(pj) ? { ...pj, trusted: false, madeBy: 'editor' } : pj);

/** A project's description once a contribution's files are merged into it (#4206): untrusted, a merge's; one untrusted
 *  already kept as it is (who made it said as before). */
export const markMerged = pj => (isTrusted(pj) ? { ...pj, trusted: false, madeBy: 'merge' } : pj);
