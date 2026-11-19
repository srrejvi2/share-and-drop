import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {originSignal, sameSignal} from '../src/network.js';
import {runtimeConfig} from '../scripts/config.mjs';

test('Render HTTPS and custom domains use WSS on the same origin', () => {
  for (const host of ['share-and-drop.onrender.com', 'share.example.com']) {
    assert.deepEqual(originSignal(new URL(`https://${host}/#room=example`)), {
      host, port: 443, secure: true, path: '/signal', key: 'peerjs',
    });
  }
});
test('local development preserves its explicit port and never selects cloud signaling', () => {
  const config = originSignal(new URL('http://localhost:3000'));
  assert.equal(config.port, 3000);
  assert.equal(config.secure, false);
  assert(sameSignal(config, {...config}));
  assert(!sameSignal(config, {...config, path: '/other'}));
});
test('relay configuration is optional and never creates fake TURN credentials', () => {
  assert(runtimeConfig({}).iceServers.every(x => x.urls.startsWith('stun:')));
  assert.throws(() => runtimeConfig({TURN_URLS: 'turn:relay.example.com:3478'}));
  assert.throws(() => runtimeConfig({TURN_SHARED_SECRET: 'test'}));
  assert.throws(() => runtimeConfig({TURN_URLS: 'https://wrong', TURN_SHARED_SECRET: 'test'}));
});
test('TURN REST credentials expire, are unique, and never reveal the shared secret', () => {
  const env = {TURN_URLS: 'turn:relay.example.com:3478,turns:relay.example.com:5349', TURN_SHARED_SECRET: 'test-only-secret', TURN_TTL_SECONDS: '3600'};
  const time = 1800000000000, config = runtimeConfig(env, time), turn = config.iceServers.at(-1);
  assert.equal(Number(turn.username.split(':')[0]), Math.floor(time / 1000) + 3600);
  assert.equal(turn.credential, createHmac('sha1', env.TURN_SHARED_SECRET).update(turn.username).digest('base64'));
  assert.notEqual(turn.username, runtimeConfig(env, time).iceServers.at(-1).username);
  assert(!JSON.stringify(config).includes(env.TURN_SHARED_SECRET));
  assert.throws(() => runtimeConfig({...env, TURN_TTL_SECONDS: '0'}));
});
