---
title: Burst benchmark
description: What bench/burst.mjs measures, how to run it, and the figures the README reports with their conditions.
---

`bench/burst.mjs` starts the service as a child process and fires bursts of requests at it with `fetch`. It prints one line per scenario. Its purpose is to compare the relative cost of the routes, not to measure capacity.

## Run it

```bash
npm run bench
# or, with request count and concurrency:
node --disable-warning=ExperimentalWarning bench/burst.mjs 5000 50
```

The defaults are 5000 requests with 50 in flight. The script needs ports `18080` and `18081` free on `127.0.0.1`. It is not part of the container image.

## What it does

The script starts the service twice, each time with `HOST=127.0.0.1`, a temporary `DATA_DIR`, `TRUSTED_PROXIES=127.0.0.1/32` and `BACKUP_INTERVAL_MS=0`. Requests carry `X-Forwarded-For` addresses from `198.51.100.0` to `198.51.100.249`, so they spread over 250 client keys.

The first instance, on port `18080`, raises every rate limit to 1,000,000, `IMAGE_BYTES_LIMIT` to 1,000,000,000 and `MAX_IMAGE_BYTES` to 2,000,000,000. It runs four scenarios:

| Scenario | Requests |
| --- | --- |
| `POST /api/links (new)` | A different gzipped JSON payload per request |
| `POST /api/links (duplicate)` | The same payloads again, answered `200` |
| `GET /s/<id>` | The ids created above, without following the redirect |
| `POST /api/images (64 KB PNG)` | Up to 2000 PNG files with 64 KiB of padding, each with different dimensions so none is a duplicate |

The second instance, on port `18081`, keeps the default limits. One client (`203.0.113.7`) sends the body `junk` to `POST /api/links` for every request. This measures the cost of rejected requests.

Each line shows requests, requests per second, p50 and p99 latency, and the count of each status code.

## Figures from the README

The README reports these figures for `node bench/burst.mjs` with 5000 requests, 50 in flight, fetch over keep-alive, and the service as a child process on 127.0.0.1. Machine: AMD Ryzen 7 5800X3D, Node v26.12.1, Linux, 2026-10-24. Each cell is the range across three runs.

| Scenario | Requests | req/s | p50 | p99 |
| --- | ---: | ---: | ---: | ---: |
| `POST /api/links`, new | 5000 | 2074 to 2435 | 19.8 to 22.8 ms | 49.7 to 58.7 ms |
| `POST /api/links`, duplicate | 5000 | 4533 to 5545 | 8.4 to 10.2 ms | 14.2 to 17.7 ms |
| `GET /s/{id}` | 5000 | 7710 to 9423 | 4.8 to 5.9 ms | 10.2 to 11.0 ms |
| `POST /api/images`, 64 KiB PNG | 2000 | 1323 to 1488 | 30.4 to 35.6 ms | 73.0 to 79.7 ms |
| One client, junk POSTs, default limits | 5000 | 5539 to 5766 | 8.0 to 8.4 ms | 16.3 to 17.6 ms |

In the last row, 60 requests got `400` and 4940 got `429`, because the default attempt limit is 60 per 10 minutes.

The README's caveats apply. The client and the service share one machine, so these numbers show relative cost, not capacity. New links write to SQLite with `synchronous = NORMAL` in WAL mode.

The README also reports one design measurement from this benchmark: with the image blob as the first column of the table, image uploads ran at 33 req/s, and with it as the last column, at 1400.
