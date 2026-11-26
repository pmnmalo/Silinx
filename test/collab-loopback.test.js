// The remote host candidates' twins at 127.0.0.1 (#4494, core/collab-loopback.js): two browsers of one computer reach
// each other over WebRTC through loopback, their host addresses being mDNS names the other does not resolve. On the
// descriptions of Chrome, Firefox and Safari (their own forms: candidates per media section, at the session's end, \n
// endings): each UDP host candidate at an mDNS name followed by its twin, the same port and the rest of its line, a
// foundation of its own; none for a server-reflexive, relayed, TCP, IPv6, IPv4-address or loopback one, nor below port
// MIN_PORT (a twin sends STUN checks to a port of this computer that the peer named: kept narrow); MAX_TWINS at most,
// none twice. A trickled candidate's twin; a connection class whose remote descriptions and candidates get theirs, a
// twin refused left out, the candidate's own failure its caller's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopbackSdp, loopbackCandidate, withLoopback, firefoxSdp, FIREFOX_ONE_COMPUTER, LOOPBACK, MAX_TWINS, MIN_PORT } from '../core/collab-loopback.js';

// (a description's candidate lines)
const cands = sdp => sdp.split(/\r?\n/).filter(l => l.startsWith('a=candidate:'));

// Chrome's (an mDNS host candidate and its server-reflexive one, in its media section; a TCP host candidate)
const CHROME = [
  'v=0', 'o=- 4611 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'm=application 50894 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 203.0.113.5',
  'a=candidate:3061451245 1 udp 2113937151 11111111-2222-4333-8444-555555555555.local 50894 typ host generation 0 network-cost 999',
  'a=candidate:842163049 1 udp 1677729535 203.0.113.5 50894 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  'a=candidate:1846311693 1 tcp 1518157311 11111111-2222-4333-8444-555555555555.local 9 typ host tcptype active generation 0 network-cost 999',
  'a=ice-ufrag:k1Zx', 'a=ice-pwd:Zc4lJ0J8bLcZQ5sV7vKj1fZp', 'a=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF',
  'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', '',
].join('\r\n');
// Firefox's (its mDNS host candidate, an IPv6 one, a relayed one; a=end-of-candidates)
const FIREFOX = [
  'v=0', 'o=mozilla...THIS_IS_SDPARTA-99.0 6371 0 IN IP4 0.0.0.0', 's=-', 't=0 0',
  'a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00',
  'a=group:BUNDLE 0', 'm=application 61234 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 198.51.100.7',
  'a=candidate:0 1 UDP 2122252543 0c6f9a3e-1b2c-4d5e-8f90-a1b2c3d4e5f6.local 61234 typ host',
  'a=candidate:1 1 UDP 2122187007 2001:db8::7 61235 typ host',
  'a=candidate:2 1 UDP 1686052863 198.51.100.7 61234 typ srflx raddr 0.0.0.0 rport 0',
  'a=candidate:3 1 UDP 92217343 192.0.2.40 3478 typ relay raddr 198.51.100.7 rport 61234',
  'a=end-of-candidates', 'a=ice-pwd:1a2b', 'a=ice-ufrag:3c4d', 'a=mid:0', 'a=setup:actpass', 'a=sctp-port:5000', '',
].join('\r\n');
// Safari's, with \n endings (an mDNS host candidate, a private IPv4 one, a loopback one, one at a well-known port)
const SAFARI = [
  'v=0', 'o=- 99 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2122260223 198.51.100.20 52000 typ host generation 0',
  'a=candidate:2 1 udp 2122194687 127.0.0.1 52001 typ host generation 0',
  'a=candidate:3 1 udp 2122129151 7d1e2f30-aaaa-4bbb-8ccc-0123456789ab.local 52002 typ host generation 0',
  'a=candidate:4 1 udp 2122063615 7d1e2f30-aaaa-4bbb-8ccc-0123456789ab.local 1023 typ host generation 0',
  'a=mid:0', '',
].join('\n');

test('#4494 Chrome\'s description: its UDP mDNS host candidate followed by its twin at 127.0.0.1; the rest as it was', () => {
  const out = loopbackSdp(CHROME);
  const twin = 'a=candidate:L3061451245 1 udp 2113937151 127.0.0.1 50894 typ host generation 0 network-cost 999';
  assert.deepEqual(cands(out), [cands(CHROME)[0], twin, ...cands(CHROME).slice(1)]);
  // (every other line, and the line endings, unchanged)
  assert.equal(out.replace(`${twin}\r\n`, ''), CHROME);
  assert.equal(LOOPBACK, '127.0.0.1');
});

test('#4494 Firefox\'s description: the mDNS host candidate twinned; the IPv6, server-reflexive and relayed ones not', () => {
  const out = loopbackSdp(FIREFOX);
  assert.deepEqual(cands(out), [
    'a=candidate:0 1 UDP 2122252543 0c6f9a3e-1b2c-4d5e-8f90-a1b2c3d4e5f6.local 61234 typ host',
    'a=candidate:L0 1 UDP 2122252543 127.0.0.1 61234 typ host',
    'a=candidate:1 1 UDP 2122187007 2001:db8::7 61235 typ host',
    'a=candidate:2 1 UDP 1686052863 198.51.100.7 61234 typ srflx raddr 0.0.0.0 rport 0',
    'a=candidate:3 1 UDP 92217343 192.0.2.40 3478 typ relay raddr 198.51.100.7 rport 61234',
  ]);
  assert.ok(out.includes('a=candidate:L0 1 UDP 2122252543 127.0.0.1 61234 typ host\r\na=candidate:1 '), 'right after its candidate');
  assert.ok(out.includes('\r\na=end-of-candidates\r\n'));
});

test('#4494 Safari\'s description (\\n endings): the mDNS host candidate twinned; an IPv4 address, a loopback one and one below MIN_PORT not', () => {
  const out = loopbackSdp(SAFARI);
  assert.ok(!out.includes('\r'));
  assert.equal(MIN_PORT, 1024);
  assert.deepEqual(cands(out), [
    'a=candidate:1 1 udp 2122260223 198.51.100.20 52000 typ host generation 0',
    'a=candidate:2 1 udp 2122194687 127.0.0.1 52001 typ host generation 0',
    'a=candidate:3 1 udp 2122129151 7d1e2f30-aaaa-4bbb-8ccc-0123456789ab.local 52002 typ host generation 0',
    'a=candidate:L3 1 udp 2122129151 127.0.0.1 52002 typ host generation 0',
    'a=candidate:4 1 udp 2122063615 7d1e2f30-aaaa-4bbb-8ccc-0123456789ab.local 1023 typ host generation 0',
  ]);
});

test('#4494 twins: MAX_TWINS at most in a description, none twice; idempotent; not a description passed as it is', () => {
  const many = ['v=0', ...Array.from({ length: MAX_TWINS + 4 }, (_, i) => `a=candidate:${i} 1 udp 2122260223 h${i}.local ${50000 + i} typ host`), ''].join('\r\n');
  const out = loopbackSdp(many);
  assert.equal(MAX_TWINS, 8);
  assert.equal(cands(out).filter(l => l.includes(' 127.0.0.1 ')).length, MAX_TWINS);
  assert.deepEqual(cands(out).filter(l => l.includes(' 127.0.0.1 ')).map(l => l.split(' ')[5]), Array.from({ length: MAX_TWINS }, (_, i) => String(50000 + i)));
  // (applied twice: the same; two host candidates at one port: one twin)
  assert.equal(loopbackSdp(loopbackSdp(CHROME)), loopbackSdp(CHROME));
  const two = 'v=0\r\na=candidate:1 1 udp 1 a.local 5000 typ host\r\na=candidate:1 1 udp 1 b.local 5000 typ host\r\n';
  assert.equal(cands(loopbackSdp(two)).length, 3);
  // (a candidate's foundation: 32 characters at most)
  const long = `a=candidate:${'f'.repeat(32)} 1 udp 1 a.local 5000 typ host`;
  assert.equal(cands(loopbackSdp(`v=0\r\n${long}\r\n`))[1], `a=candidate:L${'f'.repeat(31)} 1 udp 1 127.0.0.1 5000 typ host`);
  for (const v of [undefined, null, '', 'v=0\r\n', 42]) assert.equal(loopbackSdp(v), v);
  // (not a candidate line: a malformed one left as it is)
  assert.equal(loopbackSdp('v=0\r\na=candidate:1 1 udp x a.local 5000 typ host\r\n'), 'v=0\r\na=candidate:1 1 udp x a.local 5000 typ host\r\n');
});

test('#4494 a trickled candidate\'s twin: its media line kept; null for the others and for the end of candidates', () => {
  assert.deepEqual(loopbackCandidate({ candidate: 'candidate:7 1 udp 2122260223 ab12.local 51000 typ host generation 0 ufrag Zx', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'Zx' }),
    { candidate: 'candidate:L7 1 udp 2122260223 127.0.0.1 51000 typ host generation 0 ufrag Zx', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'Zx' });
  assert.deepEqual(loopbackCandidate({ candidate: 'candidate:7 1 UDP 1 AB12.LOCAL 1024 typ host' }), { candidate: 'candidate:L7 1 UDP 1 127.0.0.1 1024 typ host', sdpMid: null, sdpMLineIndex: null });
  for (const c of [
    { candidate: 'candidate:8 1 udp 1 203.0.113.5 51000 typ srflx raddr 0.0.0.0 rport 0' },
    { candidate: 'candidate:9 1 tcp 1 ab12.local 9 typ host tcptype active' },
    { candidate: 'candidate:9 1 udp 1 2001:db8::1 51000 typ host' },
    { candidate: 'candidate:9 1 udp 1 127.0.0.1 51000 typ host' },
    { candidate: 'candidate:9 1 udp 1 198.51.100.2 51000 typ host' },
    { candidate: 'candidate:9 1 udp 1 ab12.local 53 typ host' },
    { candidate: 'candidate:9 1 udp 1 ab12.local 70000 typ host' },
    { candidate: 'candidate:9 1 udp 1 printer.example.com 51000 typ host' },
    { candidate: 'candidate:9 1 udp 1 a.b.local 51000 typ host' },
    { candidate: '', sdpMid: '0' }, {}, null, undefined,
  ]) assert.equal(loopbackCandidate(c), null, JSON.stringify(c));
});

// (a connection of the test's: what reached it recorded; a candidate at `refuse` refused)
class FakePC {
  constructor(cfg) { this.cfg = cfg; this.sdps = []; this.added = []; }
  async setRemoteDescription(d, ...rest) { this.sdps.push([d?.type, d?.sdp, ...rest]); return 'set'; }
  async addIceCandidate(c) { if (c?.candidate?.includes(this.cfg.refuse)) throw new Error('refused'); this.added.push(c?.candidate ?? c); }
}

test('#4494 withLoopback: a remote description\'s and a trickled candidate\'s twins reach the connection; a refused twin left out', async () => {
  const PC = withLoopback(FakePC);
  const pc = new PC({ iceServers: [] });
  assert.ok(pc instanceof FakePC);
  assert.deepEqual(pc.cfg, { iceServers: [] });
  assert.equal(await pc.setRemoteDescription({ type: 'offer', sdp: CHROME }, 'more'), 'set');
  assert.deepEqual(pc.sdps, [['offer', loopbackSdp(CHROME), 'more']]);
  await pc.setRemoteDescription({ type: 'rollback' });
  assert.deepEqual(pc.sdps[1], ['rollback', undefined]);
  await pc.addIceCandidate({ candidate: 'candidate:1 1 udp 1 a.local 5000 typ host', sdpMid: '0' });
  await pc.addIceCandidate({ candidate: 'candidate:2 1 udp 1 203.0.113.5 5000 typ srflx raddr 0.0.0.0 rport 0', sdpMid: '0' });
  await pc.addIceCandidate({ candidate: '', sdpMid: '0' });
  await pc.addIceCandidate(null);
  assert.deepEqual(pc.added, ['candidate:1 1 udp 1 a.local 5000 typ host', 'candidate:L1 1 udp 1 127.0.0.1 5000 typ host',
    'candidate:2 1 udp 1 203.0.113.5 5000 typ srflx raddr 0.0.0.0 rport 0', '', null]);
  // a twin refused: left out, no error; the candidate's own refusal: its caller's
  const shy = new PC({ refuse: '127.0.0.1' });
  await shy.addIceCandidate({ candidate: 'candidate:1 1 udp 1 a.local 5000 typ host' });
  assert.deepEqual(shy.added, ['candidate:1 1 udp 1 a.local 5000 typ host']);
  await assert.rejects(new PC({ refuse: 'a.local' }).addIceCandidate({ candidate: 'candidate:1 1 udp 1 a.local 5000 typ host' }), /^Error: refused$/);
});

test('#4494 withLoopback: MAX_TWINS trickled twins at most for a connection, each connection its own count', async () => {
  const PC = withLoopback(FakePC);
  const a = new PC({}), b = new PC({});
  for (let i = 0; i < MAX_TWINS + 3; i++) await a.addIceCandidate({ candidate: `candidate:${i} 1 udp 1 h${i}.local ${5000 + i} typ host` });
  assert.equal(a.added.length, 2 * MAX_TWINS + 3);
  assert.equal(a.added.filter(c => c.includes(' 127.0.0.1 ')).length, MAX_TWINS);
  await b.addIceCandidate({ candidate: 'candidate:1 1 udp 1 x.local 6000 typ host' });
  assert.deepEqual(b.added, ['candidate:1 1 udp 1 x.local 6000 typ host', 'candidate:L1 1 udp 1 127.0.0.1 6000 typ host']);
});

// #4497: Firefox takes no twin; a connection that found no path, Firefox one of the two, says how two browsers of one
// computer connect (web/js/collab-rtc.js)
test('#4497 firefoxSdp: Firefox\'s description by its origin line, with \\r\\n or \\n; not Chrome\'s nor Safari\'s nor a candidate\'s text', () => {
  assert.equal(firefoxSdp(FIREFOX), true);
  assert.equal(firefoxSdp(FIREFOX.replace(/\r\n/g, '\n')), true);
  assert.equal(firefoxSdp(CHROME), false);
  assert.equal(firefoxSdp(SAFARI), false);
  assert.equal(firefoxSdp(CHROME.replace('s=-', 's=o=mozilla...THIS_IS_SDPARTA')), false);
  for (const x of [undefined, null, '', 42]) assert.equal(firefoxSdp(x), false);
  assert.match(FIREFOX_ONE_COMPUTER, /^Firefox and another browser of one computer reach each other only by their \.local names: on macOS, allow both browsers in System Settings ▸ Privacy & Security ▸ Local Network, or share through a relay \(Share Project…'s Relay\)$/);
});
