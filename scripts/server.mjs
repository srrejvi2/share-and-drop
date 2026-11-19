// Public web app + memory-only WebRTC signaling on Render's single HTTP port.
// No users, database, file-upload routes or persistent file storage.
import express from 'express';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {access} from 'node:fs/promises';
import {ExpressPeerServer} from 'peer';
import {WebSocketServer} from 'ws';
import {runtimeConfig} from './config.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
await access(new URL('../dist/index.html', import.meta.url)).catch(() => {
  throw new Error('Build the website first: npm run build');
});
runtimeConfig();
const app = express(), server = http.createServer(app);
let signalingSockets;
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), screen-wake-lock=(self)');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
const signal = ExpressPeerServer(server, {
  path: '/', key: 'peerjs', allow_discovery: false,
  concurrent_limit: 500, alive_timeout: 30000, expire_timeout: 5000,
  proxied: process.env.TRUST_PROXY === 'true',
  createWebSocketServer(options) {
    signalingSockets = new WebSocketServer({...options, maxPayload: 64 * 1024, perMessageDeflate: false});
    return signalingSockets;
  },
});
// Never log SDP, ICE addresses, peer tokens or user content.
signal.on('error', () => {});
app.use('/signal', signal);
app.get('/runtime-config.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(runtimeConfig());
});
app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ok: true, application: 'S&D (Share and Drop)', storage: 'none', accounts: false});
});
app.use(express.static(root, {index: 'index.html', dotfiles: 'deny', maxAge: 0}));
app.use((_req, res) => res.status(404).type('text').send('Not found'));
app.use((_error, _req, res, _next) => res.status(500).type('text').send('Unable to process request'));
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
server.listen(port, '0.0.0.0', () => console.log(`S&D (Share and Drop) listening on port ${server.address().port}`));
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const socket of signalingSockets?.clients || []) socket.terminate();
  signalingSockets?.close();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
