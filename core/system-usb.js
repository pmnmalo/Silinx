// Silinx - a System's nodes matched to the boards connected to the computer by their USB id (#5489's part 2, roadmap
// #5479's phase 2, docs/SYSTEMS.md): each FPGA and microcontroller node's USB ids (its board's: an FPGA board's the
// programmer's the browser drives, core/usb-program.js usbTarget; an Arduino's USB serial chips; the Explorer 16/32's
// on-board debugger, Microchip's), or the node's own (`usb`: { vendor, product, serial }, its board's serial number told
// apart from another of the same kind), matched to the devices the computer sees (server/usb-devices.js). A node with no
// board, and a board that could be one of two nodes or two boards that could be one node, are said, their exact messages
// the console's and the MCP's. The plan's order (core/system-plan.js): the FPGA nodes first, then the microcontrollers.
//
//   const m = matchBoards(sys, devices);   // devices: [{ vendor: '2341', product: '0043', serial, name, port }]
//   m.nodes: [{ id, device, message }]; boardLines(m, devices)
//
// Isomorphic ES module, no DOM.
import { mcuBoard } from './system-doc.js';
import { nodeBoard } from './system-node.js';
import { usbTarget } from './usb-program.js';
import { bitstreamExtOf } from '../packages/silinx-fpga/src/parts.js';
import { usbIdText } from './usb-id.js';

const hex4 = v => Number(v).toString(16).padStart(4, '0');

/** The microcontroller boards' USB ids: { vendor, product } (product null: any of the vendor's), as their makers give
 *  them. The Uno's ATmega16U2 (Arduino's two vendor ids) and the CH340 of its clones; the Nano's FT232RL and CH340; the
 *  Explorer 16/32's PKOB4 debugger, a Microchip device. */
export const MCU_USB = {
  'arduino-uno': [{ vendor: '2341', product: '0043' }, { vendor: '2341', product: '0001' }, { vendor: '2341', product: '0243' }, { vendor: '2a03', product: '0043' }, { vendor: '1a86', product: '7523' }],
  'arduino-nano': [{ vendor: '0403', product: '6001' }, { vendor: '1a86', product: '7523' }],
  'explorer-1632': [{ vendor: '04d8', product: null }],
};

/** The USB ids a node's board may have ([{ vendor, product }]): the node's own (its usb's vendor and product) when given,
 *  else its board's; [] when neither is known (a board Silinx has no USB id of). */
export function nodeUsbIds(node) {
  if (node?.usb?.vendor) return [{ vendor: node.usb.vendor, product: node.usb.product ?? null }];
  if (node?.kind === 'mcu') return MCU_USB[node.board] || [];
  if (node?.kind !== 'fpga') return [];
  const b = nodeBoard(node);
  const t = b && usbTarget({ board: b, device: b.device, file: `x${bitstreamExtOf(b.device)}` });
  return (t?.filters || []).map(f => ({ vendor: hex4(f.vendorId), product: f.productId != null ? hex4(f.productId) : null }));
}

// a device matched by an id: its vendor, and its product when the id says one
const fits = (d, id) => d.vendor === id.vendor && (!id.product || d.product === id.product);
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : nodeBoard(n)?.name) || n.board || n.kind;

/** A device as the console says it: `USB vvvv:pppp, serial S (name, port P)`. */
export function deviceText(d) {
  const more = [d.name, d.port && `port ${d.port}`].filter(Boolean);
  return `USB ${d.vendor}:${d.product}${d.serial ? `, serial ${d.serial}` : ', no serial number'}${more.length ? ` (${more.join(', ')})` : ''}`;
}

/**
 * The System `sys`'s FPGA and microcontroller nodes matched to the connected `devices` ([{ vendor, product (4 hex
 * digits, lower case), serial, name, port }]): { nodes: [{ id, device (the matched one, or null), message (a problem,
 * or null) }] } in the plan's order. A node with a serial number takes the device with it; the others a device of their
 * ids that no other node could take. A node with no device (`<id>: no board connected for it (…)`), with two devices
 * that could be it, or one device two nodes could take (`… could be …: give … its board's serial number`), has its
 * message; a node with no known USB id too.
 */
export function matchBoards(sys, devices = []) {
  const all = (sys?.nodes || []).filter(n => n.kind === 'fpga' || n.kind === 'mcu');
  const nodes = [...all.filter(n => n.kind === 'fpga'), ...all.filter(n => n.kind === 'mcu')];
  const out = new Map(nodes.map(n => [n.id, { id: n.id, device: null, message: null }]));
  const taken = new Set();
  const want = n => `${boardName(n)}, USB ${nodeUsbIds(n).map(usbIdText).join(' or ') || '?'}`;
  // (a serial number first: its own device)
  for (const n of nodes.filter(x => x.usb?.serial)) {
    const ids = nodeUsbIds(n);
    const d = devices.find(x => x.serial === n.usb.serial && (!ids.length || ids.some(id => fits(x, id))));
    if (d) { out.get(n.id).device = d; taken.add(d); } else out.get(n.id).message = `${n.id}: no board connected for it (${want(n)}, serial ${n.usb.serial})`;
  }
  // (the others: a node whose one board is no other's alone takes it, until none is left to take; a Nano that can only be
  // the CH340 leaves the Uno its ATmega16U2)
  let rest = nodes.filter(n => !n.usb?.serial && nodeUsbIds(n).length);
  const cands = n => devices.filter(d => !taken.has(d) && nodeUsbIds(n).some(id => fits(d, id)));
  for (let more = true; more;) {
    more = false;
    for (const n of rest) {
      const mine = cands(n);
      if (mine.length !== 1 || rest.some(o => o !== n && cands(o).length === 1 && cands(o)[0] === mine[0])) continue;
      out.get(n.id).device = mine[0];
      taken.add(mine[0]);
      rest = rest.filter(o => o !== n);
      more = true;
      break;
    }
  }
  for (const n of nodes.filter(x => !x.usb?.serial && !nodeUsbIds(x).length)) out.get(n.id).message = `${n.id}: Silinx knows no USB id of its board ${n.board ?? '(none)'}: give it its board's (its usb vendor and product)`;
  for (const n of rest) {
    const r = out.get(n.id), mine = cands(n);
    if (!mine.length) r.message = `${n.id}: no board connected for it (${want(n)})`;
    else if (mine.length > 1) r.message = `${n.id}: ${mine.length} connected boards could be it (${mine.map(deviceText).join('; ')}): give it its board's serial number`;
    else {
      const rivals = rest.filter(o => cands(o).includes(mine[0]));
      r.message = `${rivals.map(o => o.id).join(', ')}: one connected board could be any of them (${deviceText(mine[0])}): give each its board's serial number`;
    }
  }
  return { nodes: [...out.values()] };
}

/** The console's lines of a match (`devices`: those listed): each device, then each node's board, or its problem as a
 *  warning (a problem two nodes share said once). */
export function boardLines(match, devices) {
  const lines = [devices.length ? `Connected USB devices (${devices.length}):` : 'No USB device connected.', ...devices.map(d => `  ${deviceText(d)}`)];
  if (match.nodes.length) lines.push('The System\'s nodes:');
  const said = new Set();
  for (const r of match.nodes) {
    const l = r.device ? `  ${r.id}: ${deviceText(r.device)}` : `WARNING: ${r.message}`;
    if (!said.has(l)) { said.add(l); lines.push(l); }
  }
  return lines;
}
