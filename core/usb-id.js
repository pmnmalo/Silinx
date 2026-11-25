// Silinx - a USB id and a System node's `usb` ({ vendor, product, serial }: its board told apart by its USB id, #5489's
// part 2): read, written and checked, for the System document (core/system-doc.js), its edits (core/system-edit.js), its
// check and the boards' match (core/system-usb.js). Isomorphic ES module, no DOM, no imports.

const HEX4 = /^[0-9a-f]{4}$/;

/** A USB id written `vvvv:pppp` (hexadecimal), or `vvvv` alone, read: { vendor, product } (lower case; product null), or
 *  null when it is not one. */
export function readUsbId(text) {
  const m = /^\s*(?:0x)?([0-9a-f]{4})(?:\s*:\s*(?:0x)?([0-9a-f]{4}))?\s*$/i.exec(String(text ?? ''));
  return m ? { vendor: m[1].toLowerCase(), product: m[2]?.toLowerCase() ?? null } : null;
}

/** An id as written: `vvvv:pppp`, or `vvvv` (any product). */
export const usbIdText = id => (id.product ? `${id.vendor}:${id.product}` : id.vendor);

/** Why a node's `usb` ({ vendor, product, serial }) is not one, or null. */
export function usbError(usb) {
  if (usb == null) return null;
  if (typeof usb !== 'object' || Array.isArray(usb)) return 'its usb is { vendor, product, serial }';
  for (const k of Object.keys(usb)) if (!['vendor', 'product', 'serial'].includes(k)) return `its usb has no field '${k}' (vendor, product, serial)`;
  for (const k of ['vendor', 'product']) if (usb[k] != null && !HEX4.test(String(usb[k]).toLowerCase())) return `its USB ${k} id '${usb[k]}' is not 4 hexadecimal digits`;
  if (usb.product != null && usb.vendor == null) return 'its USB product id needs its vendor id';
  if (usb.serial != null && (typeof usb.serial !== 'string' || !usb.serial.trim() || usb.serial.length > 64)) return 'its USB serial number is a text of 1 to 64 characters';
  return null;
}

/** The node's `usb` as written: its fields given, the ids in lower case, the serial trimmed; null when none is. */
export function normalUsb(usb) {
  if (!usb || typeof usb !== 'object') return null;
  const out = {};
  if (usb.vendor != null) out.vendor = String(usb.vendor).toLowerCase();
  if (usb.product != null) out.product = String(usb.product).toLowerCase();
  if (usb.serial != null) out.serial = String(usb.serial).trim();
  return Object.keys(out).length ? out : null;
}
