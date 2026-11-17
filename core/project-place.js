// Silinx - where a project is kept, in words (#4314): File ▸ Open Project…'s Stored In column and its tip, the MCP's
// list_projects. `stored`: 'folder' (the workspace folder: the server's, or the one the browser edition opened) or
// 'browser' (the browser edition's own storage); `github`: the GitHub repository it is in ('owner/repo'), or none.
// Isomorphic (no DOM, no Node APIs).

export const STORED_LABEL = { folder: 'Workspace Folder', browser: 'Browser Storage' };
const STORED_TEXT = { folder: 'Kept in the workspace folder', browser: 'Kept in this browser\'s storage' };

/** The Stored In cell's lines: the storage, then the GitHub repository (if any). */
export const placeLines = p => [STORED_LABEL[p.stored], p.github ? `GitHub: ${p.github}` : null].filter(Boolean);

/** The place in a sentence: "Kept in the workspace folder, in the GitHub repository owner/repo." */
export const placeText = p => `${STORED_TEXT[p.stored]}${p.github ? `, in the GitHub repository ${p.github}` : ''}.`;
