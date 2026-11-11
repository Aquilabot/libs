---
title: Rate limits, memory budget and storage caps
description: How the service counts requests per client and overall, bounds the memory held by request bodies, and caps each store.
---

Three mechanisms bound what clients can make the service do: fixed-window rate limits, a shared memory budget for request bodies, and count and byte caps on each SQLite store. Each one answers with its own status: `429`, `503` and `507`.

## Fixed-window counters

`createRateLimiter` in `src/rate-limit.mjs` keeps counters in memory. A window opens at the first counted request for a key and lasts `windowMs`. When a request would pass the limit, the answer is `429 {"error":"rate_limited"}` with `Retry-After` set to the seconds left in that window, rounded up, at least 1.

Each limiter's map is bounded: expired windows are dropped, and past 10,000 keys the oldest go. Counters live in process memory, so a restart clears them.

## Which limits exist

Links and images each have five limiters. Reads have one.

| Limiter | Links default | Images default | Counts |
| --- | --- | --- | --- |
| Attempts | 60 per 10 min | 30 per 10 min | Every POST of a client (and for images, every DELETE), valid or not |
| Per client | 30 per 10 min | 10 per hour | New items stored by a client |
| Daily | 200 per day | 20 per day | New items stored by a client |
| Bytes | 2 MiB per day | 6 MiB per day | Bytes of new items stored by a client |
| Global | 600 per hour | 100 per hour | New items stored by all clients together |

The read limiter allows 240 requests per minute per client, shared by `GET` and `HEAD` of `/s/<id>` (and any other path under `/s/`), `/api/links/<id>` and `/api/images/<id>`.

The environment variable for each one is in the [configuration reference](/libs/share-links/reference/configuration/). "Per day" is a 24-hour window that starts at the client's first counted item, not a calendar day. `/api/health` is not rate limited.

## Charge only what is stored

The attempt limiter is checked and charged for every POST before its body is read. The other four are only checked at first. They are charged after a row has been written. So:

- A rejected request (bad payload, wrong media type, false image) costs only the sender's own attempts.
- Posting a payload or image that is already stored returns `200` and costs only an attempt.
- Junk from one client never uses up the global quota for others.

The order of checks on `POST /api/links` and `POST /api/images` is:

1. Method, else `405`.
2. Same-origin check, else `403`. Nothing is charged yet.
3. Attempts, charged here, else `429`.
4. Media type, else `415`.
5. Memory budget, else `503 busy`. Then the body is read, with `413` past the size limit.
6. Validation, else `400` (or `413` for a payload that inflates past 256 KiB).
7. Deduplication: an existing item answers `200`.
8. Per-client, daily, bytes and global limits, else `429`.
9. Store caps, else `507`.
10. Write the row, charge the four limiters, answer `201`.

The test `rejected posts and repeated links charge nothing but the sender's own attempts` checks this with four junk clients and two real ones.

With the defaults, one client keeps at most 6000 unopened links at once (200 a day for 30 days), under a third of the 20,000 link cap. One client adds at most 20 of the 2000 images a day.

## Who the client is

The per-client key is the TCP peer address unless `TRUSTED_PROXIES` is set. IPv6 addresses count by their /64, so rotating addresses inside one subscriber block does not reset a quota. Behind a proxy, read [running behind a reverse proxy](/libs/share-links/guides/reverse-proxy/): if the proxy is not listed as trusted, every client shares the proxy's single quota.

## Memory budget for request bodies

Request bodies on both POST routes share one budget, `MAX_IN_FLIGHT_BYTES` (16 MiB by default). Before reading a body, the handler reserves its declared `Content-Length`, or the route's maximum when the request declares none (chunked transfer).

- If the reservation does not fit, the answer is `503 {"error":"busy"}` with `Retry-After: 5` and `Connection: close`. The body is not read.
- A request that declares more than the route allows gets `413` without taking any budget.
- A body that streams past the limit gets `413` while it streams.
- The reservation is released when the body ends or the client hangs up.

The test `bodies in flight share a memory budget: 503 busy with Retry-After, released when a client hangs up` holds one slow request open to fill the budget, then checks that both routes answer `503`, that a small body still fits, and that the budget is free again after the slow client disconnects.

## Storage caps

| Store | Count cap | Byte cap |
| --- | --- | --- |
| Links | `MAX_LINKS` = 20,000 | `MAX_LINK_BYTES` = 256 MiB |
| Images | `MAX_IMAGES` = 2000 | `MAX_IMAGE_BYTES` = 200 MiB |

A new item that would pass either cap gets `507 {"error":"storage_full"}`. The link store first deletes expired links and refuses only if there is still no room. Deduplication still works on a full store: posting a stored payload answers `200`.

`/api/health` reports each store's level: `ok`, `high` from 80 % of either cap, or `full`. The service also logs a line when a level changes, so the log shows a store filling up before it is full:

```json
{"time":"2026-10-24T09:00:00.000Z","event":"storage","store":"links","usage":"high","level":"warning"}
```

## Connection limits

`src/server.mjs` sets Node's own limits on the HTTP server: `headersTimeout` 10 s, `requestTimeout` 15 s, `keepAliveTimeout` 5 s, headers of at most 16 KiB and at most 64 headers. The README notes these are not covered by tests.
