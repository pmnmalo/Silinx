// UI: a shared project's WebRTC connection between two browser engines of one computer (#4494, the browser edition's
// rooms that the owner's page hosts, #3227): the owner's page in the tests' browser (Chrome; WebKit in the browsers
// job), a follower's in the other engine, Chromium or WebKit (Playwright's builds, Chromium's else the installed Chrome;
// each skipped when it is not installed), through the codes (web/js/collab-rtc.js followerOffer / ownerAnswer), with no
// STUN server and no network. Each browser hides its host address behind an mDNS name the other does not resolve: the
// remote mDNS host candidates' twins at 127.0.0.1 (core/collab-loopback.js) connect them. Both descriptions as set carry
// the twins; the channel opens; a frame goes each way (one larger than a data channel's message, in parts); no console
// warning or error on either page. Not Firefox: it takes no loopback candidate, its pairs still unconnected (#4497).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setupUi, uiTest, BROWSER, findChrome } from './harness.js';

let env, pw = null;
try { pw = await import('playwright'); } catch { /* skipped below */ }
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const b64 = (n) => crypto.randomBytes(n).toString('base64url');
// (a follower's engine: not the tests' own, installed)
// (Chromium: Playwright's build, else the installed Chrome)
const exe = (engine) => (fs.existsSync(pw[engine].executablePath()) ? undefined : engine === 'chromium' ? findChrome() || null : null);
const skipOf = (engine) => (!pw ? 'playwright not installed (npm install)'
  : BROWSER === 'firefox' ? 'Firefox takes no loopback candidate: its pairs not connected yet (#4497)'
    : engine === BROWSER || (engine === 'chromium' && BROWSER === 'chrome') ? `the tests' browser is ${BROWSER}: a follower in another engine only`
      : exe(engine) === null ? `Playwright's ${engine} not installed (npx playwright install ${engine})` : undefined);

for (const engine of ['chromium', 'webkit']) {
  uiTest(`#4494 a follower in ${engine} connects to the owner's page in the tests' browser over WebRTC, on one computer: the host candidates' twins at 127.0.0.1`, E, async (page) => {
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
      fp.on('console', (m) => { if (/^(warning|warn|error)$/.test(m.type())) said.push(`${m.type()}: ${m.text()}`); });
      fp.on('pageerror', (e) => said.push(`pageerror: ${e.message}`));
      const before = page.console.length;
      const noStun = async () => { const { STUN_KEY } = await import('/js/collab-rtc.js'); localStorage.setItem(STUN_KEY, '[]'); };
      await page.eval(noStun);
      await fp.evaluate(noStun);
      const key = b64(32), room = b64(16);
      // the follower's offer (its page keeps it), the owner's answer, the follower's accept
      const offer = await fp.evaluate(async ([k, r]) => {
        const { followerOffer } = await import('/js/collab-rtc.js');
        window.offer = await followerOffer({ key: k, room: r });
        return window.offer.code;
      }, [key, room]);
      const answer = await page.eval(async (k, r, c) => {
        const { ownerAnswer, channelSocket } = await import('/js/collab-rtc.js');
        const a = await ownerAnswer({ key: k, room: r, code: c });
        window.answered = a;
        window.got = [];
        a.channel.then((dc) => { window.ownerWs = channelSocket(dc, a.pc); });
        return { code: a.code, twins: (a.pc.remoteDescription.sdp.match(/^a=candidate:\S+ \d+ udp \d+ 127\.0\.0\.1 \d+ typ host/gim) || []).length };
      }, key, room, offer);
      assert.ok(answer.twins >= 1, `the follower's offer as the owner set it: its host candidates' twins (${answer.twins})`);
      const follower = await fp.evaluate(async (c) => {
        const t0 = Date.now();
        const ch = await Promise.race([window.offer.accept(c), new Promise((_, no) => setTimeout(() => no(new Error(`no connection in 30 s (${window.offer.pc.iceConnectionState})`)), 30000))]);
        window.ch = ch;
        return { ms: Date.now() - t0, twins: (window.offer.pc.remoteDescription.sdp.match(/^a=candidate:\S+ \d+ udp \d+ 127\.0\.0\.1 \d+ typ host/gim) || []).length };
      }, answer.code);
      assert.ok(follower.twins >= 1, `the owner's answer as the follower set it: its host candidates' twins (${follower.twins})`);
      await page.waitFor(() => !!window.ownerWs && window.ownerWs.readyState === 1, [], { what: 'the owner\'s channel open' });
      // a frame each way: the follower's text, the owner's bytes larger than a data channel's message (in parts)
      await page.eval(() => { window.ownerWs.addEventListener('message', (ev) => window.got.push(typeof ev.data === 'string' ? ev.data : ev.data.byteLength)); });
      await fp.evaluate(async () => {
        const { channelSocket } = await import('/js/collab-rtc.js');
        const ws = channelSocket(window.ch, window.offer.pc);
        window.got = [];
        ws.addEventListener('message', (ev) => window.got.push(typeof ev.data === 'string' ? ev.data : [ev.data.byteLength, new Uint8Array(ev.data)[100000]]));
        ws.send('{"hello":"from the follower"}');
      });
      await page.waitFor(() => window.got.length === 1, [], { what: 'the follower\'s frame at the owner\'s' });
      assert.deepEqual(await page.eval(() => window.got), ['{"hello":"from the follower"}']);
      await page.eval(() => { const b = new Uint8Array(200000); b[0] = 3; b[100000] = 42; window.ownerWs.send(b); });
      for (let t = Date.now(); Date.now() - t < 10000 && !(await fp.evaluate(() => window.got.length));) await new Promise((r) => setTimeout(r, 100));
      assert.deepEqual(await fp.evaluate(() => window.got), [[200000, 42]]);
      // no warnings, no errors, on either page
      assert.deepEqual(said, []);
      assert.deepEqual(page.console.slice(before).filter((c) => /^(warning|warn|error)$/.test(c.type)).map((c) => c.text), []);
      await page.eval(() => window.answered.close());
      await fp.evaluate(() => window.offer.close());
    } finally { await browser.close(); }
  }, { skip: skipOf(engine), timeout: 120000 });
}
