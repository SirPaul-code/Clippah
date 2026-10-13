# Clippah license service — deployment preparation

This is **server-side Node/Postgres code**, not part of the Chrome extension.
It must run on a live HTTPS host (e.g. Render) with a private, persistent Postgres
database (e.g. an isolated Neon database). **GitHub repositories and GitHub Actions
are not always-on web servers.**

## Implemented

- POST `/v1/activate`: license code + installation UUID → opaque 256-bit bearer token
- POST `/v1/verify`: validates token, installation, license status and expiry
- POST `/v1/deactivate`: releases one active device slot
- POST `/admin/issue`: issue a Pro key; requires secret server admin bearer
- POST `/admin/revoke`: revoke any license ID; requires admin bearer
- GET `/health`: service readiness

Every request is checked against PostgreSQL: revoking a key deactivates Pro on the
next verification. Each key allows **two devices** by default and stores only
HMAC hashes of the license code, device ID and activation bearer. Per-IP request
throttling applies (in-memory, **not distributed rate limiting**).

No offline grace is enabled. A server error, expiry or an unconfigured endpoint
results in Free mode and a watermark on the next render/export.

## Deployment instructions

1. Create a **new, dedicated, private Postgres database**. Do not reuse an unrelated database.
2. Run `schema.sql` against that database.
3. Create a Node 22+ web service, root directory `license-server`.
4. Build command: `npm install --omit=dev`; start command: `npm start`.
5. Configure the following **server-only** environment variables securely:
   - `DATABASE_URL`: PostgreSQL connection string; never commit it.
   - `LICENSE_HASH_PEPPER`: unique random secret, at least 24 characters.
   - `LICENSE_ADMIN_TOKEN`: different random secret, at least 24 characters.
   - `PORT`: provided automatically by your hosting service if applicable.
6. Make the service available over HTTPS. Confirm `GET /health` succeeds.
7. In extension `license-config.json`, set `apiBase` to that HTTPS origin
   (without a trailing slash). Increment the extension version and publish it
   through the existing GitHub Actions packaging pipeline. The in-app updater
   will deliver the change to existing Clippah installations.

Generate each environment secret separately with a cryptographically secure
random generator, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Issue a Pro key after verifying payment

Use an authenticated server admin tool (do not run it from client-side browser JS):

```bash
curl -X POST "https://YOUR-LICENSE-HOST/admin/issue" \
  -H "Authorization: Bearer YOUR_PRIVATE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","seatLimit":2}'
```

The response includes the customer license code **once**. Give that key to the
customer privately. The customer enters it in Clippah → Settings → Licensing.
For subscription plans, set the matching validity or revoke on cancellation.
Automated Stripe Checkout/webhook billing is **not yet connected** in this
release; **do not** advertise automated Pro delivery.

To revoke a license:

```bash
curl -X POST "https://YOUR-LICENSE-HOST/admin/revoke" \
  -H "Authorization: Bearer YOUR_PRIVATE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"LICENSE_UUID_HERE"}'
```

## Practical enforcement limits

Clippah is a locally installed extension. Even if the license server is
perfectly implemented, an end user can edit extension JavaScript or intercept
local render code. It is **impossible to make locally rendered watermarks
tamper-proof**, regardless of obfuscation. Server-side rendering or valuable
server-gated premium functionality is needed for robust paid-only features.
The Free watermark is drawn inside the same canvas pipeline used for
preview and MediaRecorder output, not merely as a CSS overlay.

Do not store license credentials in GitHub files, Actions build artifacts,
a publicly readable repository, extension configuration or browser DOM.
