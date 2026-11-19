import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

let server, base, output = '';
const sockets = new Set();
async function until(fn, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for server event');
    await delay(15);
  }
}
before(async () => {
  server = spawn(process.execPath, ['scripts/server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {...process.env, PORT: '0', TRUST_PROXY: 'true', TURN_URLS: '', TURN_SHARED_SECRET: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => output += data);
  server.stderr.on('data', data => output += data);
  await until(() => /listening on port (\d+)/.test(output) || server.exitCode !== null);
  assert.equal(server.exitCode, null, output);
  base = `http://127.0.0.1:${output.match(/listening on port (\d+)/)[1]}`;
});
after(async () => {
  for (const socket of sockets) socket.terminate();
  if (server?.exitCode === null) {
    const ended = once(server, 'exit');
    server.kill('SIGTERM');
    await ended;
  }
});
async function connect(id = crypto.randomUUID(), key = 'peerjs') {
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/signal/peerjs?key=${key}&id=${id}&token=${crypto.randomUUID()}`);
  const messages = [];
  sockets.add(socket);
  socket.on('message', raw => messages.push(JSON.parse(raw)));
  socket.on('error', () => {});
  await once(socket, 'open');
  await until(() => messages.length);
  return {socket, id, messages};
}

test('visitors can open the branded website and assets without a login or cookie', async () => {
  const response = await fetch(base, {redirect: 'manual'});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('location'), null);
  const html = await response.text();
  assert.match(html, /S&amp;D \(Share and Drop\)/);
  assert.doesNotMatch(html, /SR Drop|auth0|firebase|sign in|log in/i);
  for (const route of ['/assets/app.js', '/assets/hash-worker.js', '/style.css', '/icon.svg']) {
    const asset = await fetch(base + route);
    assert.equal(asset.status, 200, route);
    assert.equal(asset.headers.get('set-cookie'), null);
  }
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('runtime configuration and health are public and use only same-origin signaling', async () => {
  const response = await fetch(base + '/runtime-config.json');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const config = await response.json();
  assert.deepEqual(config.signal, {sameOrigin: true, path: '/signal', key: 'peerjs'});
  assert(config.iceServers.every(item => item.urls.startsWith('stun:')));
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.accounts, false);
  assert.equal(health.storage, 'none');
});

test('no upload endpoint, session directory, secrets or development test pages are exposed', async () => {
  for (const route of ['/upload', '/files', '/api/upload']) {
    const response = await fetch(base + route, {method: 'POST', body: 'not a file upload'});
    assert.equal(response.status, 404, route);
  }
  for (const route of ['/.env', '/package.json', '/src/app.js', '/__tests', '/test-runner.js']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  assert.equal((await fetch(base + '/signal/peerjs/peers')).status, 401);
});

test('real WebSockets route OFFER, ANSWER and CANDIDATE between anonymous peers', async () => {
  const a = await connect(), b = await connect();
  assert.equal(a.messages.shift().type, 'OPEN');
  assert.equal(b.messages.shift().type, 'OPEN');
  for (const [from, to, type] of [[a,b,'OFFER'],[b,a,'ANSWER'],[a,b,'CANDIDATE']]) {
    const payload = {connectionId: 'signaling-smoke-test', data: 'synthetic connection metadata'};
    from.socket.send(JSON.stringify({type, dst: to.id, payload}));
    await until(() => to.messages.some(message => message.type === type));
    const message = to.messages.find(message => message.type === type);
    assert.equal(message.src, from.id);
    assert.equal(message.dst, to.id);
    assert.deepEqual(message.payload, payload);
  }
  a.socket.close(); b.socket.close();
});

test('invalid signaling keys are rejected without an account flow', async () => {
  const peer = await connect(crypto.randomUUID(), 'incorrect');
  assert.equal(peer.messages[0].type, 'ERROR');
});

test('signaling frames above 64 KiB are rejected and the service stays healthy', async () => {
  const peer = await connect();
  const closed = once(peer.socket, 'close');
  peer.socket.send('x'.repeat(65537));
  const [code] = await closed;
  assert.equal(code, 1009);
  assert.equal((await fetch(base + '/health')).status, 200);
});
