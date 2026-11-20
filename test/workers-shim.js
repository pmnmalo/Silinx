// A shim of the Cloudflare Workers runtime, as much of it as the Cloudflare relay uses (#4541:
// packages/silinx-relay-cloudflare), on Node: a Worker served on an HTTP server whose WebSockets are `ws`'s, its
// Durable Objects' namespace (one object per name), WebSocketPair, a Response of status 101 that carries its
// WebSocket, and the WebSocket Hibernation API (ctx.acceptWebSocket, getWebSockets, the sockets' attachments, the
// handlers webSocketMessage / webSocketClose). `hibernate()` puts every object to sleep, as Cloudflare does with an
// idle one: its memory lost (a new object made from its class), its sockets kept open with their attachments, given to
// it again as other objects. An object's storage (ctx.storage: get, put, delete) is kept while it sleeps; its events wait
// for what its ctx.blockConcurrencyWhile runs (#4745), and come in their order.
//   serveWorker({ worker, env, objects: { BINDING: ctx => object } }) -> { url (http://127.0.0.1:<port>), env,
//   namespaces, hibernate() (a promise: once every object is awake again), sockets() (the WebSockets of the Node side), close() }
import http from 'node:http';
import { WebSocketServer } from 'ws';

const later = f => setImmediate(f);
const copy = d => (typeof d === 'string' ? d : new Uint8Array(d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : d).slice().buffer);

// one end of a WebSocketPair: what is sent to it goes to its `on.data`, its end to `on.end` (held until it has them)
class End {
  constructor() { this.readyState = 1; this.peer = null; this.on = null; this.held = []; this.attachment = null; }
  accept() { this.listen({ data: () => {}, end: () => {} }); }
  listen(on) { this.on = on; for (const f of this.held.splice(0)) f(); }
  deliver(f) { if (this.on) f(); else this.held.push(f); }
  send(d) {
    if (this.readyState !== 1) throw new Error('the WebSocket is not open');
    const v = copy(d), p = this.peer;
    later(() => { if (p.readyState === 1) p.deliver(() => p.on.data(v)); });
  }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    const p = this.peer;
    later(() => { if (p.readyState === 1) { p.readyState = 3; p.deliver(() => p.on.end(code, reason)); } });
  }
  serializeAttachment(v) { this.attachment = structuredClone(v); }
  deserializeAttachment() { return structuredClone(this.attachment); }
}

class WebSocketPair {
  constructor() { const a = new End(), b = new End(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; }
}

// (a Response that may have status 101 and a WebSocket, as the Workers' does)
const BaseResponse = globalThis.Response;
class WorkerResponse extends BaseResponse {
  constructor(body, init = {}) {
    if (init.status !== 101) { super(body, init); return; }
    super(null, { ...init, status: 200 });
    Object.defineProperty(this, 'status', { value: 101 });
    this.webSocket = init.webSocket;
  }
}

// a Durable Object's state: its sockets accepted for hibernation, as objects of its current generation
function objectState(target) {
  const sockets = new Set();
  let generation = 0, views = new Map();
  // (its storage, kept while it sleeps; its events, in their order, after what blockConcurrencyWhile runs, #4745)
  const stored = new Map();
  let gate = Promise.resolve();
  const later = fn => { gate = gate.then(fn).catch(() => {}); return gate; };
  const view = end => {
    if (!views.has(end)) {
      views.set(end, {
        get readyState() { return end.readyState; },
        send: d => end.send(d), close: (c, r) => end.close(c, r),
        serializeAttachment: v => end.serializeAttachment(v), deserializeAttachment: () => end.deserializeAttachment(),
      });
    }
    return views.get(end);
  };
  return {
    sleep() { generation++; views = new Map(); },
    get generation() { return generation; },
    ctx: {
      acceptWebSocket(end) {
        sockets.add(end);
        end.listen({
          data: v => later(() => target().webSocketMessage(view(end), v)),
          end: (code, reason) => { sockets.delete(end); later(() => target().webSocketClose?.(view(end), code, reason, true)); },
        });
      },
      getWebSockets: () => [...sockets].filter(e => e.readyState === 1).map(view),
      storage: { stored, get: async k => structuredClone(stored.get(k)), put: async (k, v) => { stored.set(k, structuredClone(v)); }, delete: async k => stored.delete(k) },
      blockConcurrencyWhile(fn) { const p = Promise.resolve().then(fn); gate = gate.then(() => p).catch(() => {}); return p; },
    },
    later,
    settled: () => gate,
  };
}

function namespace(make) {
  const objects = new Map();   // name -> { state, obj }
  const of = name => {
    let o = objects.get(name);
    if (!o) {
      o = { state: null, obj: null };
      o.state = objectState(() => o.obj);
      o.obj = make(o.state.ctx);
      objects.set(name, o);
    }
    return o;
  };
  return {
    objects,
    idFromName: name => ({ name: String(name), toString: () => String(name) }),
    get: id => ({ fetch: req => { const o = of(id.name); let r; return o.state.later(async () => { r = await o.obj.fetch(req); }).then(() => r); } }),
    hibernate() { for (const o of objects.values()) { o.state.sleep(); o.obj = make(o.state.ctx); } return Promise.all([...objects.values()].map(o => o.state.settled())); },
  };
}

export async function serveWorker({ worker, env = {}, objects = {} }) {
  const saved = { WebSocketPair: globalThis.WebSocketPair, Response: globalThis.Response };
  Object.assign(globalThis, { WebSocketPair, Response: WorkerResponse });
  const namespaces = Object.fromEntries(Object.entries(objects).map(([k, make]) => [k, namespace(make)]));
  env = { ...env, ...namespaces };
  const nodeSockets = new Set();
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, handleProtocols: ps => (ps.size ? [...ps][0] : false) });
  const requestOf = req => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    return new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers });
  };
  const server = http.createServer(async (req, res) => {
    const r = await worker.fetch(requestOf(req), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  server.on('upgrade', async (req, socket, head) => {
    const r = await worker.fetch(requestOf(req), env);
    if (r.status !== 101) { socket.end(`HTTP/1.1 ${r.status} Refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); return; }
    const end = r.webSocket;
    wss.handleUpgrade(req, socket, head, ws => {
      nodeSockets.add(ws);
      end.listen({
        data: v => { if (ws.readyState === 1) ws.send(typeof v === 'string' ? v : Buffer.from(v), { binary: typeof v !== 'string' }); },
        end: (code, reason) => ws.close(code, reason),
      });
      ws.on('message', (d, binary) => { if (end.readyState === 1) end.send(binary ? new Uint8Array(d) : String(d)); });
      ws.on('close', code => { nodeSockets.delete(ws); end.close(code === 1005 || code === 1006 ? 1000 : code); });
      ws.on('error', () => {});
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`, env, namespaces,
    hibernate: () => Promise.all(Object.values(namespaces).map(n => n.hibernate())),
    sockets: () => [...nodeSockets],
    close: async () => {
      for (const ws of nodeSockets) ws.terminate();
      const closed = new Promise(r => server.close(r));
      server.closeAllConnections();   // (fetch's kept alive)
      await closed;
      Object.assign(globalThis, saved);
    },
  };
}
