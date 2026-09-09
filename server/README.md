# Shared API foundation

This server owns a separate SQLite database and authenticates every request with a server-issued bearer token. It does not synchronize mobile SQLite databases. The app must explicitly use an allowlisted RPC client to share this data.

## Start

Requires Node.js 22 or newer, all existing project dependencies including development dependencies (`better-sqlite3` and `tsx`), and a writable persistent filesystem.

- `QINGUAN_DATABASE_PATH`: absolute database path, for example `/var/data/qinguan/company.db` on a Render persistent disk.
- `QINGUAN_ALLOWED_ORIGINS`: comma-separated exact web origins; empty allows native clients without an Origin header only. Wildcards are rejected.
- `QINGUAN_SETUP_KEY`: secret supplied through the deployment provider's secret settings. Needed only for initial setup. Never put its value in source control or an Expo public environment variable.
- `PORT`: Render supplies this; defaults to 3000.

Start command: `npx tsx server/index.ts`. The supplied entry starts with an empty RPC allowlist. Integrate the reviewed registry by passing it to `startApiServer(registry)` in `server/index.ts`.

Render deployment needs a paid persistent disk, a single service instance and a single Node process. The database and server sessions reside on this disk. Do not run multiple workers against the same file or use an ephemeral disk. Back up the database using SQLite's backup facilities; copying a live main database file without its WAL is not a reliable backup. No deployment is performed by these source files.

## HTTP contract

All responses are JSON. All POST bodies require `Content-Type: application/json` and default to a 64 KiB maximum. Use HTTPS in production. Tokens belong in secure device storage and the Authorization header, never URLs or logs.

- `GET /health`: `{ready, bootstrapNeeded}` only.
- `POST /bootstrap`: header `X-Setup-Key`; body `{admin, company, site?}` using the existing bootstrap inputs. Only succeeds on an empty company database. The server constructs the setup actor. Remove the setup key from the deployment settings after success.
- `POST /session`: `{account, password}` → `{token, expiresAt, user}`; expiry is Unix milliseconds. Tokens expire after 12 hours by default.
- `GET /session`: `Authorization: Bearer <token>` → `{user, actor, permissionKeys}`.
- `DELETE /session`: same header; invalidates the token.
- `POST /rpc`: same header; `{method, input}` → handler result. Unknown methods are rejected. Extra envelope fields, including a supplied actor, are rejected.

`createApiServer({databasePath, handlers, setupKey?, allowedOrigins?})` returns `{server, close}`. A handler has signature `(context: {actor, user}, input: unknown) => Promise<unknown>`. The server authenticates and reconstructs context; the registry must validate every input and apply existing service authorization to reads and writes. Never expose raw SQL, repository modules, dynamic imports or arbitrary function names through the registry. Never accept a client actor as an override.

Tokens are random and only their SHA-256 hashes are stored in `server_sessions`, a server-only table. Each request checks expiry, current account status and a fingerprint of the password credentials. Password changes invalidate existing tokens. A server-only status-change trigger deletes all sessions when an account becomes inactive, so suspension followed by restoration does not revive earlier tokens.

Requests are serialized across API instances in the process because the existing services use a global database adapter. Long-running RPC handlers block other operations; do not perform device camera, GPS or remote network work inside this queue. A maximum of 64 active/pending requests limits resource pressure.

Login throttling is conservative and uses the actual socket address plus account; forwarded-IP headers are not trusted. When hosted behind a reverse proxy, failures may share an IP limit. Review trusted-proxy configuration before a large deployment. Error responses intentionally omit stack traces, SQL, filesystem paths and raw internal exceptions.

## Verification

`npx tsx tests/server_api.test.ts` creates an isolated local HTTP server and database; it does not deploy or change the preview database.
