# S&D (Share and Drop)

Public, account-free file sharing in the browser. Choose files, share a QR code or
link, and keep the sender's page open. Receivers download directly over encrypted
WebRTC connections. No visitor registration, login, database or file-upload service.

**বাংলা deployment নির্দেশনা: [RENDER_SETUP_BANGLA.md](RENDER_SETUP_BANGLA.md)**

## Deploy on Render

1. Extract this ZIP and put its contents in a GitHub, GitLab or Bitbucket repository.
   `package.json` and `render.yaml` must be at the repository root.
2. In Render, select **New → Blueprint**, connect the repository, review the
   included `render.yaml`, then deploy. It explicitly requests the Free plan.
3. Alternatively create a **Web Service**, choose the **Node** runtime and Free
   instance, and enter these settings:

| Setting | Value |
| --- | --- |
| Root directory | Leave blank if the files are at repository root |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |
| Environment | `NODE_ENV=production`, `TRUST_PROXY=true` |
| Instances | One |

Use the resulting public HTTPS `onrender.com` URL. Your visitors need no Render,
GitHub or ChatGPT account. Only the operator needs accounts to deploy/manage it.
Do not choose Static Site: the app needs its own WebSocket signaling service.
The standard Render deployment flow uses a repository; upload the extracted files
to the repository, not the ZIP archive itself.

The web page, runtime configuration and signaling service share one origin and
one port. The server binds `0.0.0.0` and uses Render's `PORT` automatically. HTTPS
and WSS terminate at Render. No production URL, API key or source-code editing is
required for basic direct sharing. A custom domain also works without code edits.

Free Render services can sleep after 15 minutes without incoming HTTP requests
or WebSocket messages, and waking may take about a minute. Active PeerJS clients
send signaling heartbeats. Hosting restarts/redeploys interrupt signaling; start a
new share if reconnecting fails. A public site does not imply unlimited capacity
or uninterrupted free hosting. Keep one instance: signaling state is in RAM.

## Run locally

Install Node.js 24, open a terminal inside this directory, then run:

```sh
npm ci --include=dev
npm run build
npm start
```

Open `http://localhost:3000`. Double-clicking `index.html` will not work. Remote
devices need the deployed HTTPS website; a plain HTTP LAN address does not provide
the secure browser APIs required by this app.

For development checks: `npm run dev`, then open `http://localhost:3000/__tests`.
The page distinguishes real WebRTC testing from simulated transport logic checks.
`/__layout` provides responsive-layout checks. Development pages are not included
by the production build. Run `npm run build` again before `npm start` after dev use.

## Included features

- Up to 100 files/folder selection and 10 concurrent receivers per share.
- QR, copy link, native share where available, downloadable QR image.
- AES-256-GCM encryption in addition to WebRTC DTLS; secret in the URL fragment.
- Incremental SHA-256 verification, 16 KiB chunks, bounded in-flight data and ACKs.
- Progress, speed, ETA, per-device state, direct/relay indicator and local reports.
- Pause, retry and resume within the same open pages.
- Stop sharing, optional expiry, wake lock where supported, host-away indication.
- Metadata and safe image/text previews over the encrypted peer connection.
- Disk writing where available; bounded fallback on other browsers.
- Light/dark appearance, low-data mode and a responsive phone/desktop interface.
- Server: health endpoint, no peer discovery, 64 KiB signaling frame limit,
  500 simultaneous signaling connections, no request-content logging.

## Internet connectivity and optional TURN

Default configuration uses public STUN to find a direct path. Some carrier,
corporate and restrictive NAT networks require TURN. Render hosts the website
and signaling; this ZIP does **not** include a hosted TURN service. STUN alone
cannot guarantee every pair of networks can connect.

If you operate a coturn-compatible TURN service with REST shared-secret auth,
add these **server environment variables** in Render:

| Variable | Meaning |
| --- | --- |
| `TURN_URLS` | Comma-separated `turn:` / `turns:` endpoints |
| `TURN_SHARED_SECRET` | The same secret used by your TURN server |
| `TURN_TTL_SECONDS` | Optional credential lifetime, 600–86400; default 3600 |

The server automatically issues temporary HMAC credentials through
`/runtime-config.json`. The shared secret is never exposed. The public endpoint
is anonymous, so anyone visiting can obtain temporary relay credentials: provision
bandwidth/quotas at the relay. Browser connections can outlast the credential
lifetime; choose a lifetime appropriate to your intended transfer duration and
refresh the page for fresh credentials before starting a later session.

Alternatively use the advanced Connection settings to supply manual ICE servers
on both devices. TURN forwards encrypted packets, without storing a downloadable
file. Setting **Require TURN relay** is useful when verifying your relay. There
are no bundled TURN credentials or promises of free/unlimited relay bandwidth.

## Data and session behavior

The server keeps only temporary signaling records in memory and briefly queues
connection messages. File bytes, file names, previews and sharing keys are not
sent to the app server. Network addresses and peer IDs are visible to signaling;
STUN/TURN and the hosting provider can have their own operational logs. No analytics
scripts, third-party fonts, session cookies or account database are included.

The full sharing link grants access. Its `#key=...` fragment is not part of HTTP
requests. Anyone who has the complete link may receive a copy. Stop sharing or
close/refresh the host page to stop further sending. Already received files cannot
be recalled; a receiver may take 12–30 seconds to notice an abrupt host loss.

On desktop browsers supporting the file picker, received bytes stream to disk.
Other browsers use temporary local browser storage where possible, then show
**Save file**. The memory-only fallback allows 128 MiB per file and 128 MiB of
retained downloads total. Disk quota and browser support still apply. Temporary
files are removed on normal leave; abandoned files older than 24 hours are cleaned
on a later visit. Refreshing either page loses resume state.

Folder selection transfers its files individually; it does not create a ZIP or
reconstruct a directory tree. Zip a folder on the host first if the receiver needs
one archive. Each receiver uses a separate connection and consumes host upload
bandwidth. Mobile OS background suspension cannot be prevented reliably by a web
page, even when a wake lock was granted.

## Tests and project files

```sh
npm run build
npm test
```

The automated suite checks cryptography/framing, network defaults, temporary TURN
credential construction, anonymous HTTP access, real WebSocket signaling routing,
hidden upload/test/secret paths and oversized message rejection. It does **not**
prove real phone-to-phone internet transfer. See [TEST_RESULTS.md](TEST_RESULTS.md)
for the exact verification record and remaining physical-device checks.

`src/` contains the frontend, transfer protocol and receiver storage; `public/`
contains UI assets; `scripts/server.mjs` is the production server; `dist/` is a
prebuilt copy for convenience. Render regenerates `dist/` from source. The ZIP
excludes dependencies, credentials and unrelated hosting configuration.

## Reference documentation

- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/blueprint-spec
- https://render.com/docs/websocket
- https://render.com/docs/free
- https://render.com/docs/node-version

Render instructions checked on 19 November 2026. Hosting limits and dashboard
labels can change; the linked official documentation is authoritative.
