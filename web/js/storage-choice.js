// The browser edition's first run (#4962): whether to offer a workspace folder on the disk, and the texts of the offer
// and of the browser's projects moved into the folder (web/js/storage-offer.js says them). No DOM: unit-tested in Node.

/** The console's line of the offer. */
export const OFFER = 'This browser can keep the projects in a folder on the disk, where clearing the browser\'s data does not lose them: choose a workspace folder, or keep them in this browser\'s storage.';
/** The line once the browser's storage is kept. */
export const KEPT = 'Projects stay in this browser\'s storage (File > Open Workspace Folder… keeps them in a folder on the disk).';

/** Whether to offer (st: api.storage(); answer: the one remembered): a folder possible (Chrome, Edge), none in use,
 *  remembered or waiting for its permission, and the offer not answered. */
export const shouldOffer = (st, answer) => !!st && !!st.supported && st.kind !== 'folder' && !st.remembered && !st.needsPermission && !answer;

/** The question of the browser's projects, a folder now in use. */
export const copyQuestion = (names, folder) => `This browser's storage has ${names.length} project(s): ${names.join(', ')}. Copy them into the folder '${folder}'? Move… copies them, then deletes them from this browser's storage once you confirm.`;
/** The confirmation of a move: the projects copied deleted from the browser's storage. */
export const deleteQuestion = (names, folder) => `Delete ${names.length} project(s) from this browser's storage: ${names.join(', ')}? They are now in the folder '${folder}'; this cannot be undone.`;
/** The console's lines of a move: kept (not confirmed), deleted. */
export const keptLine = names => `Kept ${names.length} project(s) in this browser's storage too: ${names.join(', ')}.`;
export const deletedLine = (names, folder) => `Deleted ${names.length} project(s) from this browser's storage: ${names.join(', ')} (now in the folder '${folder}').`;
