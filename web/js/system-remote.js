// A System's run in a Web Worker (#4701, core/system-host.js): started from its file on the local server
// (web/js/system-worker.js, a module worker), from its embedded text in the browser edition (a Blob, a classic worker:
// a file:// page cannot start a module one, #512), as the Board Emulator's engine (web/js/emulator.js). The page drives it
// by messages, each answered: { nodes, wires, terminals, boards, run(until) -> { report, finished, boards }, send(node,
// bytes), set(node, pin, value) (a board's switch or button, the System Emulator's, #5212), waves() -> { design, now },
// close() }, or { error }.
let workerUrl = null;

function spawn() {
  const src = globalThis.SILINX_SYSTEM_WORKER_SRC;
  if (src) workerUrl ??= URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  return src ? new Worker(workerUrl) : new Worker('/js/system-worker.js', { type: 'module' });
}

/** The run of `system` from its inputs (core/system-run.js systemInputs'), started in its worker. */
export function startSystemRun(system, inputs, { emulate = false, stimulus = null } = {}) {
  let w;
  try { w = spawn(); } catch (e) { return Promise.resolve({ error: `no Web Worker to run it in: ${e.message}` }); }
  let n = 0;
  const waiting = new Map();
  return new Promise((resolve) => {
    let ready = null;
    const ask = (m) => new Promise((ok, fail) => { const id = ++n; waiting.set(id, { ok, fail }); w.postMessage({ ...m, id }); });
    w.onerror = (e) => { const message = e.message || 'the worker stopped'; for (const x of waiting.values()) x.fail(new Error(message)); waiting.clear(); if (!ready) resolve({ error: message }); };
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'failed') { w.terminate(); resolve({ error: m.error }); return; }
      if (m.type === 'ready') {
        ready = { nodes: m.nodes, wires: m.wires, terminals: m.terminals, boards: m.boards,
          run: (until) => ask({ type: 'run', until }), waves: () => ask({ type: 'waves' }),
          send: (node, bytes) => w.postMessage({ type: 'send', node, bytes }), set: (node, pin, value) => w.postMessage({ type: 'set', node, pin, value }),
          close: () => w.terminate() };
        resolve(ready);
        return;
      }
      const x = waiting.get(m.id);
      if (!x) return;
      waiting.delete(m.id);
      if (m.type === 'error') x.fail(new Error(m.message)); else x.ok(m);
    };
    w.postMessage({ type: 'init', system, inputs, emulate, stimulus });
  });
}
