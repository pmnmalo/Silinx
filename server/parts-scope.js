// Each server call's own project parts (#4294, #4280): a project's KiCad parts (core/circuit-kicad.js) are set for the
// call that reads its circuits (core/circuit-parts.js setProjectParts), and two calls on two projects run at once, an
// MCP tool's or an HTTP request's, each one's awaits between the other's: each one runs in a store of its own.
import { AsyncLocalStorage } from 'node:async_hooks';
import { setPartsScope } from '../core/circuit-parts.js';

const store = new AsyncLocalStorage();
setPartsScope(() => store.getStore() ?? null);

/** `fn` run with a project parts' store of its own (its result). */
export const inPartsScope = (fn) => store.run({}, fn);
/** An HTTP request handled with a store of its own (an express middleware). */
export const partsScope = (req, res, next) => store.run({}, next);
