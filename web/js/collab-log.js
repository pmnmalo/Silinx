// The Collaboration tab's messages (#4632): git (clone, commit, push, pull, branches, merges), GitHub (the sign-in, GitHub
// Checks), live sharing (share, follow, the editors' edits, who is in), the relay and Share Project…'s links and short
// links. The tab is the Design pane's: its messages are the console's Design ones (web/js/messages.js), whatever process
// ran last. Every collaboration module writes through collabLog (test/collab-log.test.js checks it); the lines of a
// shared project's runs, mirrored to its followers (web/js/collab-runs.js), keep their processes' sources.
import { log } from './console.js';

/** The console's source of the collaboration's messages: Design's. */
export const COLLAB_SOURCE = 'check';

/** A line of the console from the collaboration (`cls`, `opts` as log's), under Design. */
export const collabLog = (text, cls = '', opts = {}) => log(text, cls, { ...opts, src: COLLAB_SOURCE });
