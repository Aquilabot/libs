---
title: Configuration
description: Every environment variable the service reads, with its type, default and meaning.
---

The service reads its configuration from environment variables in `loadConfig` (`src/server.mjs`). There is no configuration file. Every numeric setting has its default in `DEFAULTS` in `src/app.mjs`, and its variable name is the setting's name in upper snake case (`linkAttemptWindowMs` is `LINK_ATTEMPT_WINDOW_MS`).

An unset or empty variable takes the default. A malformed value throws at start, so the service does not run with a bad configuration. `src/admin.mjs` reads the same variables.

## Origin, paths and payload

| Variable | Type | Default | Meaning |
| --- | --- | --- | --- |
| `PUBLIC_ORIGIN` | Origin: `http://` or `https://`, host, optional port, no path | `http://localhost:8080` | The only `Origin` accepted on POST and DELETE, and the base of every returned URL and redirect. |
| `LINK_TARGET_PATH` | Path: `/` then `A-Z a-z 0-9 . _ ~ / -` | `/` | Where `/s/<id>` sends the browser. The payload is appended to it. |
| `LINK_MISSING_PATH` | Path, same rule | `/link-not-found` | Where an unknown or expired id goes. The app serves this page. |
| `PAYLOAD_PREFIX` | `#` then up to 32 of `A-Z a-z 0-9 . _ ~ = -` | `#state=v1.` | The fragment prefix every payload must start with. The maximum body length is this prefix's length plus 65,536. |

## Network and client identity

| Variable | Type | Default | Meaning |
| --- | --- | --- | --- |
| `HOST` | String | All interfaces | Listen address. |
| `PORT` | Non-negative integer | `8080` | Listen port. |
| `TRUSTED_PROXIES` | Comma-separated IPv4 or IPv6 CIDR ranges | Empty | Peers whose forwarded header is read to find the client. Empty means the TCP peer is the client. |
| `FORWARDED_HEADER` | Header name: `A-Z a-z 0-9 -` | `x-forwarded-for` | The header those proxies set, for example `x-real-ip`. Lower-cased. |

## Storage and maintenance

| Variable | Type | Default | Meaning |
| --- | --- | --- | --- |
| `DATA_DIR` | Path | `./data` (`/data` in the image) | Holds `links.sqlite`, `images.sqlite` and `backups/`. Created if missing. |
| `MAX_LINKS` | Non-negative integer | `20000` | Link store count cap. |
| `MAX_LINK_BYTES` | Non-negative integer | `268435456` (256 MiB) | Link store byte cap, summed over payloads. |
| `UNOPENED_TTL_MS` | Non-negative integer | `2592000000` (30 days) | Time a new link has to be opened once before it expires. |
| `MAX_IMAGES` | Non-negative integer | `2000` | Image store count cap. |
| `MAX_IMAGE_BYTES` | Non-negative integer | `209715200` (200 MiB) | Image store byte cap. This is not the per-file limit, which is a fixed 1.5 MiB. |
| `BACKUP_KEEP` | Non-negative integer | `7` | Daily link backups kept. |
| `IMAGE_BACKUP_KEEP` | Non-negative integer | `2` | Daily image backups kept. |
| `BACKUP_INTERVAL_MS` | Non-negative integer | `3600000` (1 hour) | How often backups and the expiry sweep run. `0` turns off the periodic run. One run still happens at start. |
| `MAX_IN_FLIGHT_BYTES` | Non-negative integer | `16777216` (16 MiB) | Request bodies held in memory at once, across both POST routes. |

## Link rate limits

All values are non-negative integers. Windows are in milliseconds.

| Variables | Defaults | Counts |
| --- | --- | --- |
| `LINK_ATTEMPT_LIMIT`, `LINK_ATTEMPT_WINDOW_MS` | `60`, `600000` (10 min) | Every POST to `/api/links` of a client, before the body is read. |
| `LINK_CREATE_LIMIT`, `LINK_CREATE_WINDOW_MS` | `30`, `600000` (10 min) | New links stored by a client. |
| `LINK_DAILY_LIMIT`, `LINK_DAILY_WINDOW_MS` | `200`, `86400000` (1 day) | New links stored by a client per day. |
| `LINK_BYTES_LIMIT`, `LINK_BYTES_WINDOW_MS` | `2097152` (2 MiB), `86400000` | Bytes of new links stored by a client per day. |
| `LINK_GLOBAL_LIMIT`, `LINK_GLOBAL_WINDOW_MS` | `600`, `3600000` (1 hour) | New links stored by all clients. |
| `READ_LIMIT`, `READ_WINDOW_MS` | `240`, `60000` (1 min) | Reads of a client: `/s/`, `/api/links/<id>` and `/api/images/<id>` together. |

## Image rate limits

| Variables | Defaults | Counts |
| --- | --- | --- |
| `IMAGE_ATTEMPT_LIMIT`, `IMAGE_ATTEMPT_WINDOW_MS` | `30`, `600000` (10 min) | Every POST to `/api/images` and every DELETE of an image by a client. |
| `IMAGE_CREATE_LIMIT`, `IMAGE_CREATE_WINDOW_MS` | `10`, `3600000` (1 hour) | New images stored by a client. |
| `IMAGE_DAILY_LIMIT`, `IMAGE_DAILY_WINDOW_MS` | `20`, `86400000` (1 day) | New images stored by a client per day. |
| `IMAGE_BYTES_LIMIT`, `IMAGE_BYTES_WINDOW_MS` | `6291456` (6 MiB), `86400000` | Bytes of new images stored by a client per day. |
| `IMAGE_GLOBAL_LIMIT`, `IMAGE_GLOBAL_WINDOW_MS` | `100`, `3600000` (1 hour) | New images stored by all clients. |

How these limits are checked and charged is described in [rate limits, memory budget and storage caps](/libs/share-links/guides/rate-limits/).

## Fixed values

These are constants in the code, not settings:

| Value | Where |
| --- | --- |
| Image body at most 1.5 MiB (1,572,864 bytes) | `MAX_IMAGE_BYTES` in `src/image.mjs` |
| Image sides 16 to 2048 pixels | `MIN_IMAGE_SIDE`, `MAX_IMAGE_SIDE` in `src/image.mjs` |
| Payload: 48 KiB compressed, 256 KiB of JSON after inflating | `MAX_COMPRESSED_BYTES`, `MAX_JSON_BYTES` in `src/payload.mjs` |
| Ids of ten base62 characters | `ID_LENGTH` in `src/link-store.mjs` |
| `Retry-After: 5` on `503 busy` | `src/app.mjs` |
| At most 10,000 keys per rate limiter | `createRateLimiter` in `src/rate-limit.mjs` |
| `headersTimeout` 10 s, `requestTimeout` 15 s, `keepAliveTimeout` 5 s, 16 KiB of headers, 64 headers | `start` in `src/server.mjs` |

## Example

```bash
PUBLIC_ORIGIN=https://app.example.com \
LINK_TARGET_PATH=/editor \
LINK_MISSING_PATH=/link-not-found \
TRUSTED_PROXIES=10.0.0.2/32 \
DATA_DIR=/var/lib/share-links \
LINK_CREATE_LIMIT=10 \
npm start
```
