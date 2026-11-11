---
title: Threat model
description: What the service defends against, the mechanism and test behind each defense, and what is out of scope.
---

This page restates the threat model from the README. Each row names the defense in the code and the test in `tests/` that checks it.

## Trust boundaries

The service is meant to sit behind the same origin as the app that uses it, path-routed by a reverse proxy. It trusts that proxy, the operator and the host. It does not trust anything a client sends.

## Threats and defenses

### Content served back to browsers

| Threat | Defense | Test |
| --- | --- | --- |
| Script served as an image (SVG, HTML, polyglot) | Magic-byte check: PNG, JPEG or WebP only. `nosniff` and `CSP default-src 'none'` on every response. | `images are recognised by their magic bytes, with their dimensions; SVG, GIF and truncated files are refused` |
| Declared type that lies, or huge dimensions | The declared type must match the bytes. Each side 16 to 2048 px. | `the declared type must match the bytes, and each side must be within 16 to 2048 pixels` |
| Another site embeds the images | `Cross-Origin-Resource-Policy: same-origin`. | `an image is stored once and served as itself, immutable, nosniff and same-origin only` |
| Framing, sniffing, caching, indexing | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `no-store`, `no-referrer`, `noindex`. | `every response sends the security headers: nosniff, CSP default-src none, DENY, no-referrer, no-store` |

### Cross-site requests

| Threat | Defense | Test |
| --- | --- | --- |
| Cross-site request forgery on POST or DELETE | `Origin` must equal `PUBLIC_ORIGIN`, `Sec-Fetch-Site` must be `same-origin`, when sent. | `POST and DELETE accept only the configured Origin and Sec-Fetch-Site: same-origin` |
| Unexpected body formats | One media type per route, checked before the body is read. | `links accept only text/plain bodies`, `uploads refuse other origins, other media types, false images and oversized bodies` |
| Another site reads the responses | No CORS headers. A preflight gets 405. | `no response carries CORS headers and a preflight gets 405` |

### Paths, URLs and redirects

| Threat | Defense | Test |
| --- | --- | --- |
| Path traversal to the database or the source | Fixed route patterns. No request path is ever joined to a file path. | `paths outside the routes answer 404 and never reach the disk` |
| Host header injection in returned URLs | URLs and redirects are built from `PUBLIC_ORIGIN` only. | `generated URLs use PUBLIC_ORIGIN, never the Host header` |
| Open redirect through `/s/` | The target is `PUBLIC_ORIGIN` + a configured path + a validated fragment. | `/s/<id> redirects without caching to the app, and an unknown id to the missing-link page` |

### Resource exhaustion

| Threat | Defense | Test |
| --- | --- | --- |
| Oversized bodies | 413 on the declared length, and while the body streams. | `a body over the limit is refused with 413, declared or while it streams` |
| Gzip bomb in a payload | Inflate stops at 256 KiB (`maxOutputLength`). | `a gzip bomb is refused with 413 once it inflates past the JSON limit` |
| Many large uploads at once | Shared 16 MiB budget for bodies in flight. 503 `busy` without reading. Released on hang-up. | `bodies in flight share a memory budget: 503 busy with Retry-After, released when a client hangs up` |
| One client floods new links | Per client: count per 10 minutes, count per day, bytes per day. | `new links are limited per client and overall, with Retry-After`, `a client's new links are also capped per day`, `one client can store only a bounded number of bytes a day` |
| One client floods images or guesses delete tokens | Per client: attempts (uploads and deletes), count per hour, count per day, bytes per day. | `image uploads are limited per client by count, bytes and day, and overall, each with Retry-After` |
| Many clients flood together | Global limits on new links and images. Count and byte caps on each store, 507 past them. | `new links are limited per client and overall, with Retry-After`, `the storage caps refuse new links with 507 but still deduplicate stored ones`, `the image store caps answer 507 and health reports full` |
| Junk spends someone else's quota | Every POST pays the sender's attempts first. Only stored items count against the other limits. | `rejected posts and repeated links charge nothing but the sender's own attempts` |
| Disk filling with abandoned links | Unopened links expire after 30 days. A full store sweeps expired links before it refuses. | `a link nobody opens expires; opening it keeps it; posting it again moves its expiry` |
| Duplicate rows from other spellings | Only the canonical base64url and a single gzip member are accepted. | `only well-formed payloads are accepted: prefix, canonical base64url, one gzip member, a JSON object` |
| Slow clients holding sockets | Node's `headersTimeout` (10 s), `requestTimeout` (15 s), 16 KiB headers, 64 headers. | Not tested. These are Node's own timeouts, set in `src/server.mjs`. |

### Client identity

| Threat | Defense | Test |
| --- | --- | --- |
| Forged `X-Forwarded-For` | The header counts only from `TRUSTED_PROXIES`, read right to left. Off by default. | `a forged X-Forwarded-For cannot choose the client key`, `the client key walks X-Forwarded-For from the right, skipping trusted proxies only` |
| IPv6 address rotation | IPv6 clients are keyed by their /64. | `IPv6 clients share one quota per /64` |

### Ids, tokens and logs

| Threat | Defense | Test |
| --- | --- | --- |
| Guessing or listing ids | Ten base62 characters from the CSPRNG (about 59.5 bits). Reads are rate limited. | `ids are ten base62 characters from the CSPRNG and a collision draws again`, `reads are limited per client, with Retry-After` |
| Deleting someone else's image | A random 192-bit token per image. Only its SHA-256 is stored, compared in constant time. Wrong token and unknown id answer the same 404. | `delete needs the token and the same origin; a wrong token and an unknown id answer alike`, `the store keeps only the SHA-256 of each delete token` |
| Personal data in logs | One line per request: method, route kind, status, milliseconds. No ids, payloads, addresses or tokens. | `the log names method, route, status and time only: no ids, payloads, addresses or tokens` |

## Out of scope

- TLS. The proxy terminates it.
- Authentication of uploaders.
- Malware scanning.
- Anything an attacker on the host can do.

The service never decodes pixels, so a file with a valid header and broken image data is stored as is. Re-encoding in the browser before upload is the client's job, and it also drops EXIF metadata.

Two consequences of the design follow from the code:

- Clients that send neither `Origin` nor `Sec-Fetch-Site`, such as curl or a server, pass the same-origin check. The check stops forged requests from a victim's browser, not direct calls. Direct calls are bounded by the rate limits and caps.
- The rate-limit counters are in process memory. A restart clears them.
