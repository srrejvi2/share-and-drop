// Use this website even before runtime config loads. No public-cloud fallback.
export function originSignal(url) {
  return {
    host: url.hostname,
    port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    path: '/signal', secure: url.protocol === 'https:', key: 'peerjs',
  };
}
export function sameSignal(a, b) {
  return ['host', 'port', 'path', 'secure', 'key'].every(key => a?.[key] === b?.[key]);
}
