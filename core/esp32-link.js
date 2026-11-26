// Silinx - the shared memory between an ESP32 node and its MicroPython's Worker (#5495, the Worker + Atomics back end):
// a SharedArrayBuffer with a command's and an answer's sequence numbers, the target time and the time reached, and two
// mailboxes of JSON (the inputs and the program to the engine, what the program did back). One side writes its box,
// stores its sequence number and notifies; the other wakes (Atomics.wait), reads it and answers the same way. The
// scheduler's side waits with a time limit, so that an engine that died is said, not waited for.
//
//   const sab = esp32Buffer(); const link = hostLink(sab); link.command(t, { inputs, program }) -> { vt, out }
//   const box = mailbox(sab); box.target(); box.handOver({ vt, out }) -> { inputs, program }   (the engine's side)
//
// Isomorphic ES module, no DOM, no imports.

const BOX = 1 << 20;   // (a mailbox's bytes)
const HEAD = 32;       // (the sequence numbers and the two times)

/** A new buffer for one node's link (SharedArrayBuffer: the page cross-origin isolated, #5648). */
export const esp32Buffer = () => new SharedArrayBuffer(HEAD + 2 * BOX);

// a mailbox's JSON written and read (its length first)
function put(sab, at, value) {
  const b = new TextEncoder().encode(JSON.stringify(value));
  if (b.length + 4 > BOX) throw new Error(`the ESP32's link: ${b.length} bytes at once, more than its ${BOX}`);
  new DataView(sab, at).setUint32(0, b.length);
  new Uint8Array(sab, at + 4, b.length).set(b);
}
function get(sab, at) {
  const n = new DataView(sab, at).getUint32(0);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(sab, at + 4, n).slice()));
}

/** The engine's side: the target time, and handOver(answer) -> the next command (blocking until it comes). */
export function mailbox(sab) {
  const seq = new Int32Array(sab, 0, 2), times = new Float64Array(sab, 16, 2);
  let n = 0;
  return {
    target: () => times[0],
    handOver({ vt, out }) {
      put(sab, HEAD + BOX, { vt, out });
      times[1] = vt;
      Atomics.store(seq, 1, n);
      Atomics.notify(seq, 1);
      Atomics.wait(seq, 0, n);
      n = Atomics.load(seq, 0);
      return get(sab, HEAD);
    },
  };
}

/** The scheduler's side: command(t, { inputs, program }) -> the engine's answer { vt, out } once it reached t (it waits
 *  at most `limit` ms of the wall clock for it: an engine that does not answer, an error). */
export function hostLink(sab, { limit = 30000 } = {}) {
  const seq = new Int32Array(sab, 0, 2), times = new Float64Array(sab, 16, 2);
  let n = 0;
  return {
    command(t, cmd) {
      put(sab, HEAD, cmd);
      times[0] = t;
      n++;
      Atomics.store(seq, 0, n);
      Atomics.notify(seq, 0);
      const end = Date.now() + limit;
      while (Atomics.load(seq, 1) !== n) {
        const left = end - Date.now();
        if (left <= 0 || Atomics.wait(seq, 1, Atomics.load(seq, 1), left) === 'timed-out' && Atomics.load(seq, 1) !== n) throw new Error(`its MicroPython did not answer in ${limit / 1000} s`);
      }
      return get(sab, HEAD + BOX);
    },
  };
}
