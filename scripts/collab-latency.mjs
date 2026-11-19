#!/usr/bin/env node
// The latency of a shared project, from its owner's action to a follower's seeing it (#4647): every case on every path
// (scripts/collab-latency-lib.mjs), with no delay added and with a classroom's (20 ms) and a far relay's (80 ms) round
// trip, then what each case's update costs on its own. No real Cloudflare account, no network: all on 127.0.0.1.
//   node scripts/collab-latency.mjs [--paths p2p,node,cloudflare] [--rtt 0,20,80] [--cases keystroke,…] [--n 30]
//                                   [--pace now|before] [--webrtc] [--json]
// --webrtc: a real WebRTC data channel's own time too, in Firefox and WebKit (Playwright's: npx playwright install
// firefox webkit).
import { measure, stages, webrtcProbe, PATHS, CASES, PACES } from './collab-latency-lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const list = (name, def) => opt(name, def.join(',')).split(',').filter(Boolean);
const paths = list('paths', PATHS), rtts = list('rtt', ['0', '20', '80']).map(Number), cases = list('cases', CASES);
const n = Number(opt('n', 30)), pace = PACES[opt('pace', 'now')], json = args.includes('--json');
if (!pace) throw new Error(`--pace: ${Object.keys(PACES).join(' or ')}`);

const results = [];
for (const path of paths) for (const rtt of rtts) {
  const r = await measure({ path, rtt, cases, n, pace });
  results.push({ path, rtt, ...r });
  if (!json) console.error(`${path} rtt ${rtt} ms: done`);
}
const st = await stages();
const rtc = args.includes('--webrtc') ? await webrtcProbe() : null;
if (json) { console.log(JSON.stringify({ pace: opt('pace', 'now'), results, stages: st, webrtc: rtc }, null, 1)); process.exit(0); }

const pad = (s, w) => String(s).padEnd(w);
console.log(`\nEnd to end (ms, median / p95), pace ${opt('pace', 'now')}: ${JSON.stringify(pace)}`);
console.log(pad('path', 12) + pad('rtt', 5) + cases.map(c => pad(c, 15)).join(''));
for (const r of results) console.log(pad(r.path, 12) + pad(r.rtt, 5) + cases.map(c => pad(`${r[c].median} / ${r[c].p95}`, 15)).join(''));
console.log('\nStages, each on its own (ms, median)');
const cols = ['bytes', 'parts', 'update', 'seal', 'open', 'sign', 'check', 'split', 'apply'];
console.log(pad('case', 12) + cols.map(c => pad(c, 9)).join(''));
for (const [c, s] of Object.entries(st)) console.log(pad(c, 12) + cols.map(k => pad(Math.round(s[k] * 1000) / 1000, 9)).join(''));
if (rtc) {
  console.log('\nA WebRTC data channel on 127.0.0.1, one way (ms), by message size (bytes)');
  for (const [b, r] of Object.entries(rtc)) console.log(pad(b, 12) + (r.error ? r.error : Object.entries(r).map(([k, v]) => pad(`${k}: ${v}`, 14)).join('')));
}
process.exit(0);
