// The local server's HTTP API, its answers to a request it refuses (#4753): one envelope for every router,
// { error, hint?, …its details }, and the bodies checked against a schema as the MCP server checks a tool's arguments
// (server/mcp-args.js schemaErrors), with the same messages ("toolchain: one of silinx, open, ise, vivado").
// A file system's or Node's own error names the server's paths: never sent (the final handler's "internal server
// error", #3537); pathFree is the message of one rewrapped as a client's error.
import { schemaErrors } from './mcp-args.js';

// the details an error carries to the page besides its message (git's conflicts, a clash's projects…)
const DETAILS = ['hint', 'files', 'projects', 'drawings', 'texts', 'resolvable', 'existing'];

/** Is e the system's or Node's own (its message may name a path of the server)? */
export const systemError = e => !e?.status && !!(e?.syscall || /^(E[A-Z]+|ERR_\w+)$/.test(e?.code || ''));

/** e's message, or, for the system's own, what failed and its code with no path ("open failed (ENOENT)"). */
export const pathFree = e => (systemError(e) ? `${e.syscall || 'the file system'} failed (${e.code})` : String(e?.message ?? e));

/** The answer to a request refused with e: { status, body: { error, hint?, …details } }. */
export function errorBody(e) {
  const status = e?.status || 500;
  const body = { error: systemError(e) ? 'internal server error' : String(e?.message ?? e) };
  for (const k of DETAILS) if (e?.[k] !== undefined && e[k] !== null) body[k] = e[k];
  return { status, body };
}

/** res answered with e's status and envelope. */
export function sendError(res, e) {
  const { status, body } = errorBody(e);
  res.status(status).json(body);
}

/** What is wrong with a request's body against schema: null, or the message ("toolchain: one of …; timeoutS: at most 600"). */
export function bodyError(body, schema) {
  const errors = schemaErrors(body ?? {}, schema, '');
  return errors.length ? errors.join('; ') : null;
}

/** Express middleware: a body that is not schema's answered 400 with bodyError's message, before the route runs. */
export const checkBody = schema => (req, res, next) => {
  const why = req.body !== undefined && req.body !== null && (typeof req.body !== 'object' || Array.isArray(req.body)) ? 'the body: a JSON object' : bodyError(req.body, schema);
  if (why) return sendError(res, Object.assign(new Error(why), { status: 400 }));
  next();
};

/** The bodies of the routes that start a run, as the MCP's tools take them. */
export const CAPTURE_TIMEOUT_S = 600;
export const IMPLEMENT_BODY = {
  type: 'object', additionalProperties: false,
  properties: {
    steps: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    toolchain: { type: 'string', enum: ['silinx', 'open', 'ise', 'vivado', 'quartus'] },   // ('open': the Silinx toolchain's older name)
    synthUpToDate: { type: 'boolean' },
    generateOnly: { type: 'boolean' },
    node: { type: 'string' },   // (a System's FPGA node, its id, or '*' every one: server/system-implement.js, #5446)
  },
};
export const FIRMWARE_BODY = {
  type: 'object', additionalProperties: false, required: ['node'],
  properties: { node: { type: 'string' } },   // (a System's microcontroller node, its id, or '*' every Arduino one: server/avr-compile.js, #5503; a node to build, or '*' all: server/system-build-all.js, #5489)
};
export const PS_BODY = {
  type: 'object', additionalProperties: false,
  properties: { node: { type: 'string' } },   // (a System's Zynq node, its id; none in a Board project: server/zynq-ps-compile.js, #4687)
};
export const PROGRAM_SYSTEM_BODY = {
  type: 'object', additionalProperties: false, required: ['node'],
  // (a System's node, or '*' every one; the boards chosen by hand, a node's serial number or port: server/system-program.js, #5489)
  properties: { node: { type: 'string' }, chosen: { type: 'object', additionalProperties: { type: 'string' } } },
};
export const CAPTURE_BODY = {
  type: 'object', additionalProperties: false,
  properties: {
    arm: { type: 'boolean' },
    timeoutS: { type: 'number', minimum: 0.1, maximum: CAPTURE_TIMEOUT_S },
    device: { type: 'integer', minimum: 0 },
  },
};
