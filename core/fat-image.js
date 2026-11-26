// Silinx - a FAT12 drive's image (#5697): CircuitPython's CIRCUITPY drive on a Raspberry Pi Pico's flash (the RP2040
// node, core/system-sim-rp2040.js), made with the node's files in it. 512 bytes' sectors, a cluster each, one FAT, the
// root's 512 entries; a name that is not 8.3 in capitals gets its long name's entries (VFAT) before its short one, a
// lower-case 8.3 one the short name's case flags (as Windows writes them). Folders as `lib/x.py`; the times fixed
// (2000-01-01 00:00), so the image is the same for the same files.
//
//   const img = fatImage([{ name: 'code.py', data: 'print(1)\n' }], { size: 1 << 20, label: 'CIRCUITPY' });
//
// Isomorphic ES module, no DOM, no imports.

const SECTOR = 512;
const ROOT_ENTRIES = 512;
const DATE = (20 << 9) | (1 << 5) | 1;   // (2000-01-01)
const SHORT_OK = /^[A-Z0-9!#$%&'()@^_`{}~-]+$/;

const bytesOf = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data ?? []));

// the short (8.3) entry's 11 bytes of a name, and its case flags (0x08 its base in lower case, 0x10 its extension), or
// null when it is not 8.3
function shortName(name) {
  if (name === '.' || name === '..') return { sfn: name.padEnd(11, ' '), flags: 0 };
  const m = /^([^.]{1,8})(?:\.([^.]{1,3}))?$/.exec(name);
  if (!m) return null;
  const [, base, ext = ''] = m, up = s => s.toUpperCase();
  if (!SHORT_OK.test(up(base)) || (ext && !SHORT_OK.test(up(ext)))) return null;
  const caseOf = s => (s === up(s) ? 0 : s === s.toLowerCase() ? 1 : -1);
  const cb = caseOf(base), ce = caseOf(ext);
  if (cb < 0 || ce < 0) return null;
  return { sfn: up(base).padEnd(8, ' ') + up(ext).padEnd(3, ' '), flags: (cb ? 0x08 : 0) | (ce ? 0x10 : 0) };
}

// a long name's short alias (BASIS~N.EXT), not one of `taken`
function aliasOf(name, taken) {
  const k = name.lastIndexOf('.');
  const clean = s => s.toUpperCase().replace(/[ .]/g, '').replace(/[^A-Z0-9!#$%&'()@^_`{}~-]/g, '_');
  const base = clean(k > 0 ? name.slice(0, k) : name) || '_', ext = clean(k > 0 ? name.slice(k + 1) : '').slice(0, 3);
  for (let n = 1; ; n++) {
    const tail = `~${n}`, sfn = base.slice(0, 8 - tail.length) + tail;
    const s = sfn.padEnd(8, ' ') + ext.padEnd(3, ' ');
    if (!taken.has(s)) return s;
  }
}

const checksum = sfn => { let s = 0; for (let i = 0; i < 11; i++) s = (((s & 1) << 7) + (s >> 1) + sfn.charCodeAt(i)) & 0xff; return s; };

// a name's directory entries (32 bytes each): its long name's (last part first) and its short one's
function entries(name, { attr, cluster, size }, taken) {
  const s = shortName(name), sfn = s?.sfn ?? aliasOf(name, taken);
  taken.add(sfn);
  const out = [];
  if (!s) {
    const units = [...name].map(c => c.charCodeAt(0));
    if (units.some(u => u > 0xffff)) throw new Error(`the name ${name} cannot be on a FAT drive`);
    units.push(0);
    while (units.length % 13) units.push(0xffff);
    const parts = units.length / 13, sum = checksum(sfn);
    for (let p = parts; p >= 1; p--) {
      const e = new Uint8Array(32), v = new DataView(e.buffer), u = units.slice((p - 1) * 13, p * 13);
      e[0] = p | (p === parts ? 0x40 : 0);
      e[11] = 0x0f;
      e[13] = sum;
      [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30].forEach((o, i) => v.setUint16(o, u[i], true));
      out.push(e);
    }
  }
  const e = new Uint8Array(32), v = new DataView(e.buffer);
  for (let i = 0; i < 11; i++) e[i] = sfn.charCodeAt(i);
  e[11] = attr;
  e[12] = s?.flags ?? 0;
  v.setUint16(16, DATE, true); v.setUint16(18, DATE, true); v.setUint16(24, DATE, true);
  v.setUint16(26, cluster, true);
  v.setUint32(28, size, true);
  out.push(e);
  return out;
}

// the files as a tree of folders: { files: Map(name -> bytes), dirs: Map(name -> tree) }
function treeOf(files) {
  const root = { files: new Map(), dirs: new Map() };
  for (const f of files) {
    const parts = String(f.name).split('/').filter(Boolean);
    if (!parts.length || parts.some(p => p === '.' || p === '..')) throw new Error(`no file name '${f.name}'`);
    let d = root;
    for (const p of parts.slice(0, -1)) {
      if (d.files.has(p)) throw new Error(`${p} is a file and a folder`);
      if (!d.dirs.has(p)) d.dirs.set(p, { files: new Map(), dirs: new Map() });
      d = d.dirs.get(p);
    }
    const last = parts.at(-1);
    if (d.dirs.has(last)) throw new Error(`${last} is a file and a folder`);
    d.files.set(last, bytesOf(f.data));
  }
  return root;
}

/** A FAT12 drive's image (Uint8Array of `size` bytes) holding `files` ([{ name: 'code.py' or 'lib/x.py', data: text or
 *  bytes }]), its volume's label `label`. Throws when they do not fit, or a name cannot be (a file and a folder, '..'). */
export function fatImage(files, { size = 1 << 20, label = 'NO NAME' } = {}) {
  const total = Math.floor(size / SECTOR);
  const rootSectors = ROOT_ENTRIES * 32 / SECTOR;
  let fatSectors = 1;
  while (Math.ceil((total - 1 - rootSectors - fatSectors + 2) * 1.5 / SECTOR) > fatSectors) fatSectors++;
  const dataStart = 1 + fatSectors + rootSectors, clusters = total - dataStart;
  if (clusters < 1 || clusters >= 4085) throw new Error(`a FAT12 drive of ${size} bytes cannot be made`);
  const img = new Uint8Array(total * SECTOR).fill(0);
  const v = new DataView(img.buffer);
  // its boot sector (the BIOS parameter block)
  img.set([0xeb, 0x3c, 0x90], 0);
  img.set(new TextEncoder().encode('MSDOS5.0'), 3);
  v.setUint16(11, SECTOR, true); img[13] = 1; v.setUint16(14, 1, true); img[16] = 1;
  v.setUint16(17, ROOT_ENTRIES, true); v.setUint16(19, total, true); img[21] = 0xf8;
  v.setUint16(22, fatSectors, true); v.setUint16(24, 63, true); v.setUint16(26, 255, true);
  img[36] = 0x80; img[38] = 0x29; v.setUint32(39, 0x5117c000, true);
  img.set(new TextEncoder().encode(String(label).toUpperCase().slice(0, 11).padEnd(11, ' ')), 43);
  img.set(new TextEncoder().encode('FAT12   '), 54);
  img[510] = 0x55; img[511] = 0xaa;
  // its FAT: the media's and the end's entries, then the files' chains
  const fat = new Uint16Array(clusters + 2);
  fat[0] = 0xff8; fat[1] = 0xfff;
  let next = 2;
  const alloc = bytes => {
    const n = Math.ceil(bytes.length / SECTOR);
    if (!n) return 0;
    if (next + n > clusters + 2) throw new Error(`the files do not fit on a drive of ${size} bytes`);
    const first = next;
    for (let i = 0; i < n; i++) fat[first + i] = i === n - 1 ? 0xfff : first + i + 1;
    img.set(bytes, (dataStart + first - 2) * SECTOR);
    next += n;
    return first;
  };
  // a folder's entries ('.' and '..' first in a subfolder), its subfolders written before it is
  const folder = (d, self, parent) => {
    const taken = new Set(), es = [];
    const label11 = String(label).toUpperCase().slice(0, 11).padEnd(11, ' ');
    if (self == null) { const e = new Uint8Array(32); for (let i = 0; i < 11; i++) e[i] = label11.charCodeAt(i); e[11] = 0x08; es.push(e); }
    const subs = [...d.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));
    const files = [...d.files.entries()].sort(([a], [b]) => a.localeCompare(b));
    // (a subfolder's own cluster first, its entries needing it as their '..')
    const placed = subs.map(([name, sub]) => {
      const count = 2 + sub.dirs.size * 3 + [...sub.files.keys(), ...sub.dirs.keys()].reduce((a, n) => a + 1 + Math.ceil((n.length + 1) / 13), 0);
      return { name, sub, cluster: alloc(new Uint8Array(Math.ceil(count * 32 / SECTOR) * SECTOR)), sectors: Math.ceil(count * 32 / SECTOR) };
    });
    if (self != null) { es.push(...entries('.', { attr: 0x10, cluster: self, size: 0 }, taken)); es.push(...entries('..', { attr: 0x10, cluster: parent ?? 0, size: 0 }, taken)); }
    for (const p of placed) es.push(...entries(p.name, { attr: 0x10, cluster: p.cluster, size: 0 }, taken));
    for (const [name, bytes] of files) es.push(...entries(name, { attr: 0x20, cluster: alloc(bytes), size: bytes.length }, taken));
    for (const p of placed) {
      const sub = folder(p.sub, p.cluster, self);
      img.set(sub, (dataStart + p.cluster - 2) * SECTOR);
    }
    const out = new Uint8Array(es.length * 32);
    es.forEach((e, i) => out.set(e, i * 32));
    return out;
  };
  const root = folder(treeOf(files), null, null);
  if (root.length > rootSectors * SECTOR) throw new Error(`more than ${ROOT_ENTRIES} entries in the drive's root`);
  img.set(root, (1 + fatSectors) * SECTOR);
  for (let c = 0; c < fat.length; c += 2) {
    const a = fat[c], b = fat[c + 1] ?? 0, o = SECTOR + c * 1.5;
    img[o] = a & 0xff; img[o + 1] = ((a >> 8) & 0x0f) | ((b & 0x0f) << 4); img[o + 2] = b >> 4;
  }
  return img;
}
