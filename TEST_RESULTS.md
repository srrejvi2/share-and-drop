# S&D (Share and Drop) — verification record, 19 November 2026

This record distinguishes working application behavior from network/device tests that could not be completed in the build environment.

## Render package verification — version 1.1.0

The exact Render build sequence `npm ci --include=dev && npm run build` succeeded
on Node 24.22.3. All **16 automated tests passed** with no skipped tests:

- Six cryptography/framing/integrity-boundary tests.
- Two network-default tests: HTTPS/WSS on the same origin and local port handling.
- Two relay-config tests: optional configuration and short-lived TURN credentials.
- Six production-server tests: public page/assets with no login redirect/cookie;
  runtime config and health; no upload endpoint or exposed dev/secret paths;
  actual WebSocket OFFER/ANSWER/CANDIDATE routing between two anonymous clients;
  invalid signaling-key rejection; oversized-frame rejection without a crash.

The HTTP/WebSocket tests start the real production server on a temporary port.
The signaling payloads are synthetic SDP/ICE stand-ins; this is **not** a WebRTC
file-transfer test. The clean production build excludes the development test page.

Changes for this package: S&D branding, same-origin signaling from the first load,
settings preserving that default, public Node/Render startup, optional temporary
TURN credentials, Render Blueprint and deployment guide. Render deployment itself
has not been performed; the user will deploy the ZIP contents through a repository.

The new local browser preview could not be opened from the cloud browser
(`ERR_CONNECTION_REFUSED`, followed by an observation policy block). No workaround
was attempted. Therefore the final rebranded layout is not newly visually verified.
The earlier browser checks below are retained as earlier-build evidence, not a new
physical-device or final-layout validation.

## Earlier build: passed

- Production build with locally bundled dependencies; no third-party scripts/fonts needed at page load.
- Six Node protocol tests: encrypted binary round-trip, incorrect key/connection and modified-ciphertext rejection, nonce uniqueness sample, malformed/oversized framing, resume offset bounds, safe download names.
- Browser UI: real file-picker selection, public signaling registration, generated QR and fragment link, invalid-link feedback, light/dark themes.
- Responsive layout at desktop size and 360/390 CSS-pixel iframe widths: no horizontal document overflow. Iframe checks are layout checks, not physical phone tests.
- Production session/controller code exercised in Chromium with an explicitly simulated data-channel transport:
  - two independently authenticated receivers;
  - encrypted metadata and text preview;
  - two transfers of 4,194,621 bytes;
  - pause after bounded in-flight data drains;
  - connection closure and automatic resume beyond 1 MB without losing received bytes;
  - sender, receiver and independently recomputed SHA-256 match;
  - empty file handling;
  - real browser-local disk sink, byte verification and cleanup;
  - incorrect key prevented access to file metadata;
  - reports created after verification;
  - host away/returned presence;
  - 10 authenticated receivers accepted; an eleventh received no file manifest;
  - manual session revoke stopped transfers and discarded partial data;
  - a stale link did not provide files after host teardown.

Test payload SHA-256:
`92e96dfda9534d579ad53a4117b1e8dc3e831f7698304ea24ed54ac3c4b75373`

Resume checkpoint observed in the final successful logic run: 1,097,728 bytes. Simulated timings are **not** internet speed benchmarks. Actual speed/route measurements must come from real WebRTC transfers.

## Network verification blocked in this environment

Real WebRTC was attempted with the local development signaling server and with a public PeerJS service in the earlier build (the Render package now defaults to its own signaling). Signaling registration succeeded, but no data channel opened. Browser diagnostics reported:

- signaling state: `stable`;
- ICE gathering: `complete`;
- local ICE candidates: `0`;
- remote ICE candidates: `0`;
- ICE connection state: `new`;
- data channel state: `connecting`.

Consequently, actual internet phone-to-phone/phone-to-PC delivery is **not verified here**. No browser network protections were changed to force a connection, no TURN account was provisioned, and no mock transport is used by the production application. The mock exists only in development tests.

## Still needed on real devices before broad production use

- Android Chrome ↔ desktop Chrome/Edge, and iOS Safari ↔ desktop.
- Two different internet connections, including a mobile carrier network.
- Your own configured TURN endpoint, using the connection-mode indicator to verify a relay path.
- Large files near the intended device storage limits; low-storage errors.
- OS screen locking, battery saver, host process termination, and background suspension.
- Multi-recipient bandwidth/load with real network traffic.

The code does not claim to provide a publicly audited security guarantee, unlimited file size, guaranteed free relay bandwidth, or a downloadable copy after the host ends the session.
