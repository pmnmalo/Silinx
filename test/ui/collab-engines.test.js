// UI: a shared project's WebRTC connection between two browser engines of one computer (#4494, the browser edition's
// rooms that the owner's page hosts, #3227): the owner's page in the tests' browser (Chrome; WebKit in the browsers
// job), a follower's in the other engine, Chromium or WebKit (Playwright's builds, Chromium's else the installed Chrome;
// each skipped when it is not installed), their connections the meeting point's (core/collab-loopback.js withLoopback,
// as web/js/collab-meet.js and core/collab-meet-relay.js make them; the descriptions passed by the test: the codes
// exchanged by hand are gone, #5868), with no STUN server and no network. Each browser hides its host address behind an
// mDNS name the other does not resolve: the remote mDNS host candidates' twins at 127.0.0.1 connect them. Both
// descriptions as set carry the twins; the channel opens; a message goes each way; no console warning or error on
// either page. Firefox too, as the tests' browser or the follower's (#4497): it takes no twin (its ICE sockets are bound
// to the interface's address), so it connects only where the two browsers resolve each other's mDNS names (on macOS,
// with their Local Network access): checked first, by a pair with no twin, and the test skipped, saying so, where they
// do not (a CI runner with no mDNS).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest, BROWSER, findChrome } from './harness.js';

let env, pw = null;
try { pw = await import('playwright'); } catch { /* skipped below */ }
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// (a follower's engine: not the tests' own, installed)
// (Chromium: Playwright's build, else the installed Chrome)
const exe = (engine) => (fs.existsSync(pw[engine].executablePath()) ? undefined : engine === 'chromium' ? findChrome() || null : null);
const skipOf = (engine) => (!pw ? 'playwright not installed (npm install)'
  : engine === BROWSER || (engine === 'chromium' && BROWSER === 'chrome') ? `the tests' browser is ${BROWSER}: a follower in another engine only`
    : exe(engine) === null ? `Playwright's ${engine} not installed (npx playwright install ${engine})` : undefined);
// Firefox's own warning, once a page (at its first CompressionStream): not the app's
const FIREFOX_OWN = /^\[JavaScript Warning: "The execution of microtasks on this page was reordered to avoid unsafe execution\."/;
const ownWarning = (text) => FIREFOX_OWN.test(text);

// whether the two pages connect with no twin, through each other's mDNS names (Firefox's only path on one computer)
async function mdnsResolves(page, fp) {
  const offer = await fp.evaluate(async () => {
    const pc = window.rawPc = new RTCPeerConnection({ iceServers: [] });
    window.rawDc = pc.createDataChannel('probe');
    window.rawOpen = new Promise((ok) => { window.rawDc.onopen = () => ok(true); setTimeout(() => ok(false), 15000); });
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((ok) => { const done = () => pc.iceGatheringState === 'complete' && ok(); pc.addEventListener('icegatheringstatechange', done); done(); setTimeout(ok, 4000); });
    return pc.localDescription.sdp;
  });
  const answer = await page.eval(async (sdp) => {
    const pc = window.rawPc = new RTCPeerConnection({ iceServers: [] });
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await new Promise((ok) => { const done = () => pc.iceGatheringState === 'complete' && ok(); pc.addEventListener('icegatheringstatechange', done); done(); setTimeout(ok, 4000); });
    return pc.localDescription.sdp;
  }, offer);
  const open = await fp.evaluate(async (sdp) => { await window.rawPc.setRemoteDescription({ type: 'answer', sdp }); return window.rawOpen; }, answer);
  await fp.evaluate(() => window.rawPc.close());
  await page.eval(() => window.rawPc.close());
  return open;
}

// a page's side of a connection the meeting point makes (withLoopback's class, no STUN server): the follower's offer
// or the owner's answer, its candidates gathered; `remote`: the other side's description, its twins counted
const SIDE = async ([role, remote]) => {
  const { withLoopback } = await import('/core/collab-loopback.js');
  const gathered = (pc) => new Promise((ok) => { const done = () => pc.iceGatheringState === 'complete' && ok(); pc.addEventListener('icegatheringstatechange', done); done(); setTimeout(ok, 4000); });
  const twins = (pc) => (pc.remoteDescription?.sdp.match(/^a=candidate:\S+ \d+ udp \d+ 127\.0\.0\.1 \d+ typ host/gim) || []).length;
  if (role === 'answer-in') { await window.pc.setRemoteDescription({ type: 'answer', sdp: remote }); return { twins: twins(window.pc) }; }
  const pc = window.pc = new (withLoopback(RTCPeerConnection))({ iceServers: [] });
  window.got = [];
  const keep = (dc) => { window.dc = dc; dc.onmessage = (e) => window.got.push(e.data); window.opened = dc.readyState === 'open' ? Promise.resolve(true) : new Promise((ok) => { dc.onopen = () => ok(true); setTimeout(() => ok(false), 30000); }); };
  if (role === 'offer') keep(pc.createDataChannel('silinx-collab'));
  else { pc.ondatachannel = (e) => keep(e.channel); await pc.setRemoteDescription({ type: 'offer', sdp: remote }); }
  await pc.setLocalDescription(role === 'offer' ? await pc.createOffer() : await pc.createAnswer());
  await gathered(pc);
  return { sdp: pc.localDescription.sdp, twins: twins(pc) };
};

for (const engine of ['chromium', 'webkit', 'firefox']) {
  uiTest(`#4494 a follower in ${engine} connects to the owner's page in the tests' browser over WebRTC, on one computer: the host candidates' twins at 127.0.0.1 (#4497: Firefox through the mDNS names)`, E, async (page, _env, t) => {
    const browser = await pw[engine].launch({ executablePath: exe(engine) });
    try {
      // (the follower's page: Silinx at the server's address, as the owner's; no update check)
      const ctx = await browser.newContext();
      await ctx.addInitScript({ content: 'window.SILINX_NO_UPDATE_CHECK = true;' });
      const fp = await ctx.newPage();
      const said = [];
      await fp.goto(`${env.server.url}/`);
      await fp.waitForFunction(() => window.SilinxApp && window.Silinx?.startupChecked, null, { timeout: 60000 });
      // (from now on: the connection's)
      fp.on('console', (m) => { if (/^(warning|warn|error)$/.test(m.type()) && !ownWarning(m.text())) said.push(`${m.type()}: ${m.text()}`); });
      fp.on('pageerror', (e) => said.push(`pageerror: ${e.message}`));
      const before = page.console.length;
      const noStun = async () => { const { STUN_KEY } = await import('/js/collab-rtc.js'); localStorage.setItem(STUN_KEY, '[]'); };
      await page.eval(noStun);
      await fp.evaluate(noStun);
      // (Firefox one of the two: only where the two resolve each other's mDNS names, #4497)
      if ((BROWSER === 'firefox' || engine === 'firefox') && !(await mdnsResolves(page, fp))) {
        t.skip(`Firefox and ${engine === 'firefox' ? BROWSER : engine} resolve no mDNS name of each other here: Firefox takes no twin (#4497)`);
        return;
      }
      // the follower's offer, the owner's answer, the follower's taking it: their channel open
      const offer = await fp.evaluate(SIDE, ['offer', null]);
      const answer = await page.eval(SIDE, ['answer', offer.sdp]);
      assert.ok(answer.twins >= 1, `the follower's offer as the owner set it: its host candidates' twins (${answer.twins})`);
      const follower = await fp.evaluate(SIDE, ['answer-in', answer.sdp]);
      assert.ok(follower.twins >= 1, `the owner's answer as the follower set it: its host candidates' twins (${follower.twins})`);
      assert.equal(await fp.evaluate(() => window.opened), true, 'the follower\'s channel open');
      await page.waitFor(() => window.dc?.readyState === 'open', [], { what: 'the owner\'s channel open', timeout: 30000 });
      // a message each way
      await fp.evaluate(() => window.dc.send('{"hello":"from the follower"}'));
      await page.waitFor(() => window.got.length === 1, [], { what: 'the follower\'s message at the owner\'s' });
      assert.deepEqual(await page.eval(() => window.got), ['{"hello":"from the follower"}']);
      await page.eval(() => window.dc.send('{"hello":"from the owner"}'));
      for (let t = Date.now(); Date.now() - t < 10000 && !(await fp.evaluate(() => window.got.length));) await new Promise((r) => setTimeout(r, 100));
      assert.deepEqual(await fp.evaluate(() => window.got), ['{"hello":"from the owner"}']);
      // no warnings, no errors, on either page
      assert.deepEqual(said, []);
      assert.deepEqual(page.console.slice(before).filter((c) => /^(warning|warn|error)$/.test(c.type) && !ownWarning(c.text)).map((c) => c.text), []);
      await page.eval(() => window.pc.close());
      await fp.evaluate(() => window.pc.close());
    } finally { await browser.close(); }
  }, { skip: skipOf(engine), timeout: 120000 });
}
