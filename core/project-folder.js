// A Silinx project imported from its folder (#3965): Import Project (.zip)…'s Project folder: row (web/js/wizards.js
// zipFolderSelection) and the MCP server's import_project (server/mcp-transfer.js) take a folder's files as the .zip
// Export Project (.zip)… makes of the same project (server/project-zip.js exportProjectZip: silinx.json and the
// project's file tree, server/projects.js walk): every file but the hidden ones and the project's build folder (build/,
// Silinx's own outputs, which the import gate refuses anyway, #3405). What is taken goes through the import gate as a
// zip's entries (core/import-gate.js), with the zip's checks and messages. Isomorphic module (browser + Node).
//
//   silinxFolderSkips(rel) -> bool               a file (or a folder) of the project folder left out of its import
//   silinxFolderError(rels, folder) -> msg|null  why a folder's files are no Silinx project's: no silinx.json at its root

/** Whether a Silinx project folder's file or folder (its path relative to the project folder, '/'-separated) is left
 *  out of its import: a hidden one (.git, .DS_Store) or the build folder, build/ at the folder's root. */
export function silinxFolderSkips(rel) {
  const parts = String(rel).split('/').filter(Boolean);
  return parts.some(p => p.startsWith('.')) || (parts[0] || '').toLowerCase() === 'build';
}

/** Why the files of the folder `folder` (their paths relative to it) are no Silinx project's, or null. */
export function silinxFolderError(rels, folder) {
  return [...rels].some(r => /^silinx\.json$/i.test(r)) ? null : `no silinx.json project file in the folder '${folder}'`;
}
