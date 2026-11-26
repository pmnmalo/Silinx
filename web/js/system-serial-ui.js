// A System terminal joined to a real board (#5449, docs/SYSTEMS.md, Real boards): the System Emulator's terminal's Real
// Board button opens a board's USB serial port through Web Serial (an Arduino's chosen among its boards' USB ids; an FPGA
// board's USB-UART among every port), at the terminal's link's baud and frame (core/serial-line.js). While joined the
// terminal shows what the board sends, as the simulation's text, and its line goes to the board; Disconnect, or the board
// unplugged, gives it back to the emulation. Its messages in the console; a browser with no Web Serial (Safari, the
// iPad) said there.
//
//   const rb = realBoardControl({ id, system, out, say });   // rb.el: its button; rb.connected(); rb.send(bytes); rb.close()
import { h } from './ui.js';
import { SerialLine, portFilters, portText, terminalPeer, webSerialMissing } from '/core/serial-line.js';

const LABEL = 'Real Board…', TITLE = 'Join this terminal to a real board\'s USB serial port (Web Serial), at its link\'s baud and frame';

/** The Real Board button of the terminal `id` (system(): the System; out: its text's element; say(text, level): the
 *  console; nav: the browser's navigator). */
export function realBoardControl({ id, system, out, say, nav = globalThis.navigator }) {
  let line = null, busy = false;
  const el = h('button', { type: 'button', class: 'asm-btn sys-term-real', title: TITLE, onclick: () => (line ? close() : connect()) }, LABEL);
  const show = () => { out.textContent = line.text(); out.scrollTop = out.scrollHeight; };
  const settle = () => { el.textContent = line ? 'Disconnect' : LABEL; el.title = line ? 'Give the terminal back to the emulation' : TITLE; out.classList.toggle('sys-term-real-on', !!line); };

  async function connect() {
    if (busy) return;
    const missing = webSerialMissing(nav);
    if (missing) { say(`ERROR: Serial terminal ${id}: ${missing}.`, 'error'); return; }
    const sys = system(), { node, link } = terminalPeer(sys, id);
    const u = (sys.nodes || []).find(n => n.id === id)?.interfaces?.[0] || {};
    const at = { baud: u.baud ?? 9600, frame: u.frame ?? '8N1' };
    busy = true;
    let port;
    try { port = await nav.serial.requestPort({ filters: portFilters(node) }); } catch (e) {
      busy = false;
      if (e?.name !== 'NotFoundError') say(`ERROR: Serial terminal ${id}: ${e.message}`, 'error');   // (none chosen: nothing said)
      return;
    }
    const l = new SerialLine(port, at, {
      onBytes: () => { if (line === l) show(); },
      onClose: (e) => { if (line !== l) return; line = null; settle(); if (e) say(`ERROR: Serial terminal ${id}: the real board's serial port was lost (${e.message}): the terminal shows the emulation again.`, 'error'); },
    });
    try { await l.open(); } catch (e) { busy = false; say(`ERROR: Serial terminal ${id}: ${portText(port.getInfo?.())} did not open: ${e.message}`, 'error'); return; }
    busy = false;
    line = l;
    out.textContent = '';
    settle();
    say(`Serial terminal ${id}: joined to the real board${node ? ` of ${node.id}` : ''} (${portText(port.getInfo?.())}, link ${link?.id ?? '?'}) at ${at.baud} baud, ${at.frame}, through Web Serial.`);
  }

  async function close() {
    const l = line;
    if (!l) return;
    line = null;
    settle();
    try { await l.close(); } catch (e) { say(`WARNING: Serial terminal ${id}: the serial port did not close: ${e.message}`, 'warn'); }
    say(`Serial terminal ${id}: the real board's serial port closed: the terminal shows the emulation again.`);
  }

  return {
    el,
    connected: () => !!line,
    /** The bytes typed, written on the board's port. */
    send(bytes) { line.write(bytes).catch(e => say(`ERROR: Serial terminal ${id}: ${e.message}`, 'error')); },
    close,
  };
}
