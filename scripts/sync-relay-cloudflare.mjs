// The Cloudflare relay's copy of the room's logic (#4541): core/collab-room.js and the modules it imports, copied as
// they are into packages/silinx-relay-cloudflare/src/core/, so that the relay deploys from its folder alone (the
// "Deploy to Cloudflare" button clones that folder only) and runs the very code of Silinx's relay. `--check`: says
// which copy differs from core/ (test/relay-cloudflare.test.js), changes nothing.
//   node scripts/sync-relay-cloudflare.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The modules copied: the room's logic and what it imports (none of them imports a package). */
export const RELAY_CORE = Object.freeze(['collab-room.js', 'collab-meeting.js', 'collab-wire.js', 'collab-crypto.js', 'collab-sign.js']);
const RELAY_CORE_DIR = path.join(ROOT, 'packages/silinx-relay-cloudflare/src/core');

/** The copies that differ from core/'s modules (or are missing), by name. */
export function staleCopies() {
  return RELAY_CORE.filter(f => {
    const copy = path.join(RELAY_CORE_DIR, f);
    return !fs.existsSync(copy) || fs.readFileSync(copy, 'utf8') !== fs.readFileSync(path.join(ROOT, 'core', f), 'utf8');
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stale = staleCopies();
  if (process.argv.includes('--check')) {
    if (stale.length) { console.error(`the Cloudflare relay's copies differ from core/: ${stale.join(', ')} (node scripts/sync-relay-cloudflare.mjs)`); process.exit(1); }
    console.log('the Cloudflare relay\'s copies are core/\'s');
  } else {
    fs.mkdirSync(RELAY_CORE_DIR, { recursive: true });
    for (const f of RELAY_CORE) fs.copyFileSync(path.join(ROOT, 'core', f), path.join(RELAY_CORE_DIR, f));
    console.log(stale.length ? `copied: ${stale.join(', ')}` : 'nothing to copy');
  }
}
