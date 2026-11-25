// Silinx - the USB devices connected to the local server's computer (#5489's part 2, docs/SYSTEMS.md): what a System's
// nodes are matched to by their USB id (core/system-usb.js), for the System row's Connected Boards (GET
// /projects/:p/boards) and the MCP's check_system (boards). Listed by the operating system, read only, nothing opened:
// macOS's system_profiler (SPUSBHostDataType, SPUSBDataType before macOS 15), Linux's /sys/bus/usb/devices, Windows's
// Get-PnpDevice; a board's serial port (an Arduino's, an FTDI's) added by arduino-cli's board list when it is installed
// (#5503), its port the one an upload uses. config.json's paths['usb-devices'] names a command of the user's (or a
// test's stand-in) printing them as JSON instead of the system's own listing: [{ vendor, product, serial, name }].
import fs from 'node:fs/promises';
import path from 'node:path';
import { capture } from './jobs.js';
import { loadConfig, which } from './toolchain.js';
import { projectSystemOf } from './system-plan.js';
import { boardLines, matchBoards } from '../core/system-usb.js';

const hex4 = v => {
  const m = /^(?:0x)?([0-9a-f]{1,4})\b/i.exec(String(v ?? '').trim());
  return m ? m[1].toLowerCase().padStart(4, '0') : null;
};
const device = (vendor, product, serial, name, port) => {
  const d = { vendor: hex4(vendor), product: hex4(product) };
  if (!d.vendor || !d.product) return null;
  const s = String(serial ?? '').trim();
  if (s) d.serial = s;
  if (name) d.name = String(name).trim();
  if (port) d.port = String(port);
  return d;
};

/** system_profiler's JSON (`-json SPUSBHostDataType` or `SPUSBDataType`) read: its devices, at any depth of the tree. */
export function readSystemProfiler(text) {
  let j;
  try { j = JSON.parse(text); } catch { return []; }
  const out = [];
  const key = (o, re) => Object.keys(o).find(k => re.test(k));
  const walk = items => {
    for (const o of Array.isArray(items) ? items : []) {
      if (!o || typeof o !== 'object') continue;
      const v = key(o, /vendor_?id$/i), p = key(o, /product_?id$/i), s = key(o, /serial/i);
      const d = v && p && device(o[v], o[p], s && o[s], o._name);
      if (d) out.push(d);
      walk(o._items);
    }
  };
  for (const k of Object.keys(j || {})) walk(j[k]);
  return out;
}

/** Windows's Get-PnpDevice InstanceIds (`USB\VID_2341&PID_0043\85735313…`), one a line, read: its devices (a composite
 *  device's interfaces, `&MI_`, left out; a serial number with `&` is Windows's own, not the board's). */
export function readPnpIds(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})(&MI_\w+)?\\(.*)$/i.exec(line.trim());
    if (!m || m[3]) continue;
    const d = device(m[1], m[2], /&/.test(m[4]) ? '' : m[4]);
    if (d) out.push(d);
  }
  return out;
}

/** arduino-cli's `board list --format json` read: its USB serial ports ({ vendor, product, serial, port, name }). */
export function readArduinoPorts(text) {
  let j;
  const t = String(text), at = t.search(/[[{]/);
  try { j = JSON.parse(t.slice(Math.max(0, at))); } catch { return []; }
  const ports = Array.isArray(j) ? j : j?.detected_ports || [];
  const out = [];
  for (const x of ports) {
    const p = x?.port || {}, q = p.properties || {};
    const d = q.vid && q.pid && device(q.vid, q.pid, q.serialNumber, x.matching_boards?.[0]?.name, p.address);
    if (d) out.push(d);
  }
  return out;
}

// Linux: /sys/bus/usb/devices/<bus-port>/{idVendor, idProduct, serial, product}
async function sysfsDevices(root = '/sys/bus/usb/devices') {
  const out = [];
  for (const e of await fs.readdir(root).catch(() => [])) {
    const read = f => fs.readFile(path.join(root, e, f), 'utf8').then(t => t.trim(), () => '');
    const d = device(await read('idVendor'), await read('idProduct'), await read('serial'), await read('product'));
    if (d) out.push(d);
  }
  return out;
}

// the system's own listing
async function systemDevices() {
  if (process.platform === 'darwin') {
    for (const t of ['SPUSBHostDataType', 'SPUSBDataType']) {
      const r = await capture('system_profiler', ['-json', t], { timeoutMs: 20000 });
      const ds = r.code === 0 ? readSystemProfiler(r.out) : [];
      if (ds.length) return ds;
    }
    return [];
  }
  if (process.platform === 'linux') return sysfsDevices();
  if (process.platform === 'win32') {
    const r = await capture('powershell', ['-NoProfile', '-Command', 'Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like "USB\\VID_*" } | ForEach-Object { $_.InstanceId }'], { timeoutMs: 30000 });
    return r.code === 0 ? readPnpIds(r.out) : [];
  }
  return [];
}

// the user's own listing (config.json's paths['usb-devices']): its JSON
async function listedDevices(bin) {
  const r = await capture(bin, [], { timeoutMs: 20000 });
  let j;
  try { j = JSON.parse(r.out); } catch { throw new Error(`${path.basename(bin)}: not a list of USB devices as JSON`); }
  return (Array.isArray(j) ? j : []).map(d => device(d.vendor, d.product, d.serial, d.name, d.port)).filter(Boolean);
}

/**
 * The connected USB devices: [{ vendor, product, serial, name, port }], each once (the system's, a serial port's
 * address added from arduino-cli's list). `cfg`: config.json's (loaded when not given).
 */
export async function listUsbDevices(cfg = null) {
  cfg = cfg ?? await loadConfig();
  const own = cfg?.paths?.['usb-devices'];
  const devices = own ? await listedDevices(String(own)) : await systemDevices();
  const cli = cfg?.paths?.['arduino-cli'] ? (which(String(cfg.paths['arduino-cli'])) ? String(cfg.paths['arduino-cli']) : null) : which('arduino-cli', ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']);
  if (cli) {
    const r = await capture(cli, ['board', 'list', '--format', 'json'], { timeoutMs: 30000 });
    for (const p of r.code === 0 ? readArduinoPorts(r.out) : []) {
      const same = devices.find(d => d.vendor === p.vendor && d.product === p.product && (d.serial ?? '') === (p.serial ?? '') && !d.port);
      if (same) { same.port = p.port; if (!same.name && p.name) same.name = p.name; } else devices.push(p);
    }
  }
  return devices;
}

/** The project `name`'s System's nodes matched to the connected boards: { devices, nodes (matchBoards's), lines }. */
export async function connectedBoards(name) {
  const { model } = await projectSystemOf(name);
  const devices = await listUsbDevices();
  const m = matchBoards(model, devices);
  return { devices, nodes: m.nodes, lines: boardLines(m, devices) };
}
