// Co-design off in a release until it is stable (#5202, core/build-channel.js): one switch, by the build's channel. In
// 'release': New Project's kind and the co-design example refused with one message (the server's and the browser
// edition's stores, the MCP server's new_project and new_project_from_example), the example not offered (/templates,
// list_examples), the MCP's System tools (edit_system, check_system, simulate of a System) refused; in 'dev' as before.
// The channel: the environment's (SILINX_CHANNEL; the tests' 'dev'), else the build's (scripts/build-info.mjs); the
// local server's page told by /build-channel.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv, startApp } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { buildChannel, setBuildChannel, codesignOn, channelFromEnv, CODESIGN_IN_RELEASE, CODESIGN_OFF } from '../core/build-channel.js';
import { createRefusal, offeredExamples, CODESIGN_EXAMPLES } from '../core/project-kind.js';
import { EXAMPLE_ORDER } from '../core/examples.js';


let tmp, app;
before(async () => { tmp = await scratchEnv('silinx-codesign-release-'); app = await startApp(); });
after(async () => { setBuildChannel('dev'); await app?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const { handle } = await import('../server/mcp.js');
const { channelScript } = await import('../server/build-channel.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const OFF = 'Co-design is not in this release yet: it is in the development build (the site\'s dev/) until it is stable.';

test('#5202 the switch: off in a release, on in the development build; the channel the environment\'s, else the build\'s', () => {
  assert.equal(CODESIGN_IN_RELEASE, false);
  assert.equal(CODESIGN_OFF, OFF);
  assert.equal(buildChannel(), 'dev', 'the tests\' channel (node --test)');
  assert.equal(codesignOn(), true);
  setBuildChannel('release');
  assert.deepEqual([buildChannel(), codesignOn(), channelScript()], ['release', false, 'globalThis.SILINX_CHANNEL = "release";\n']);
  setBuildChannel('dev');
  assert.deepEqual([codesignOn(), channelScript()], [true, 'globalThis.SILINX_CHANNEL = "dev";\n']);
  assert.throws(() => setBuildChannel('beta'), /^Error: no build channel 'beta' \(dev, release\)$/);
  assert.equal(buildChannel(), 'dev');
  // the environment's: SILINX_CHANNEL, else the tests' (node --test), else none (the build's)
  assert.equal(channelFromEnv({ SILINX_CHANNEL: 'release', NODE_TEST_CONTEXT: 'child-v8' }), 'release');
  assert.equal(channelFromEnv({ SILINX_CHANNEL: 'dev' }), 'dev');
  assert.equal(channelFromEnv({ NODE_TEST_CONTEXT: 'child-v8' }), 'dev');
  assert.equal(channelFromEnv({ SILINX_CHANNEL: 'beta' }), null);
  assert.equal(channelFromEnv({}), null);
});

test('#5202 the kinds\' rules and the examples offered, in each channel', () => {
  const all = [...EXAMPLE_ORDER, ...CODESIGN_EXAMPLES];
  assert.deepEqual([createRefusal('codesign'), createRefusal(null, 'uart-avr'), offeredExamples(all)], [null, null, all]);
  setBuildChannel('release');
  try {
    assert.deepEqual([createRefusal('codesign'), createRefusal('codesign', 'uart-avr'), createRefusal(null, 'uart-avr')], [OFF, OFF, OFF]);
    assert.deepEqual([createRefusal(null, 'uart'), createRefusal('design'), createRefusal(null)], [null, null, null], 'the other kinds as before');
    assert.deepEqual(offeredExamples(all), EXAMPLE_ORDER);
  } finally { setBuildChannel('dev'); }
});

test('#5202 the local server in a release: /templates without the co-design example, a co-design project refused; its page told the channel', async () => {
  assert.deepEqual((await app.call('GET', '/templates')).body, [...EXAMPLE_ORDER, ...CODESIGN_EXAMPLES]);
  const page = await fetch(`${app.origin}/build-channel.js`);
  assert.deepEqual([page.status, page.headers.get('content-type'), await page.text()], [200, 'text/javascript; charset=utf-8', 'globalThis.SILINX_CHANNEL = "dev";\n']);
  setBuildChannel('release');
  try {
    assert.deepEqual((await app.call('GET', '/templates')).body, EXAMPLE_ORDER);
    for (const body of [{ name: 'Cd', kind: 'codesign' }, { name: 'Cd', template: 'uart-avr' }]) {
      const r = await app.call('POST', '/projects', body);
      assert.deepEqual([r.status, r.body.error], [400, OFF], JSON.stringify(body));
    }
    assert.equal(await (await fetch(`${app.origin}/build-channel.js`)).text(), 'globalThis.SILINX_CHANNEL = "release";\n');
  } finally { setBuildChannel('dev'); }
});

test('#5202 the MCP server in a release: new_project kind codesign, the co-design example, edit_system, check_system, simulate of a System refused; as before in the development build', async () => {
  const made = await call('new_project_from_example', { name: 'ua', example: 'uart-avr' });
  assert.equal(made.isError, false, made.text);
  setBuildChannel('release');
  try {
    const refused = async (name, args) => { const r = await call(name, args); assert.deepEqual([r.isError, r.text], [true, `${name}: ${OFF}`], name); };
    await refused('new_project', { name: 'c1', kind: 'codesign' });
    await refused('new_project_from_example', { name: 'c2', example: 'uart-avr' });
    await refused('check_system', { project: 'ua', file: 'uart_avr.sys.json' });
    await refused('edit_system', { project: 'ua', file: 'uart_avr.sys.json', edits: [{ action: 'remove_link', link: 'serial' }] });
    await refused('simulate', { project: 'ua' });
    await refused('simulate', { project: 'ua', top: 'uart_avr.sys.json' });
    const ex = await call('list_examples');
    assert.deepEqual(ex.data.examples.map(e => e.name), EXAMPLE_ORDER);
    assert.doesNotMatch(ex.text, /uart-avr|co-design/);
    // (the other projects as before)
    assert.equal((await call('new_project', { name: 'f1' })).isError, false);
  } finally { setBuildChannel('dev'); }
  const c = await call('check_system', { project: 'ua', file: 'uart_avr.sys.json' });
  assert.equal(c.isError, false, c.text);
  assert.equal(c.text.split('\n').at(-1), 'Process "Check System" of uart_avr.sys.json completed successfully with 1 warning(s).');
});
