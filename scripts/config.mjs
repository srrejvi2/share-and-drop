import {createHmac, randomBytes} from 'node:crypto';
const STUN = [{urls: 'stun:stun.l.google.com:19302'}, {urls: 'stun:stun1.l.google.com:19302'}];

// Optional coturn-compatible REST credentials. The shared secret stays here;
// browsers receive a short-lived username/password.
export function runtimeConfig(env = process.env, now = Date.now()) {
  const iceServers = STUN.map(server => ({...server}));
  const urls = (env.TURN_URLS || '').split(',').map(url => url.trim()).filter(Boolean);
  if (urls.length || env.TURN_SHARED_SECRET) {
    if (!urls.length || !env.TURN_SHARED_SECRET || urls.length > 8 ||
        urls.some(url => !/^turns?:[^\s]+$/.test(url))) {
      throw new Error('Set both TURN_URLS and TURN_SHARED_SECRET, or leave both empty.');
    }
    const ttl = Number(env.TURN_TTL_SECONDS || 3600);
    if (!Number.isInteger(ttl) || ttl < 600 || ttl > 86400) {
      throw new Error('TURN_TTL_SECONDS must be between 600 and 86400.');
    }
    const username = `${Math.floor(now / 1000) + ttl}:${randomBytes(12).toString('hex')}`;
    const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
    iceServers.push({urls, username, credential});
  }
  return {signal: {sameOrigin: true, path: '/signal', key: 'peerjs'}, iceServers};
}
