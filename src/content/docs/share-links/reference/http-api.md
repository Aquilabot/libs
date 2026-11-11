---
title: HTTP API
description: Every route with its method, request, responses, status codes and error codes, as implemented in src/app.mjs.
---

The repository ships [`openapi.yaml`](https://github.com/Aquilabot/share-links/blob/main/openapi.yaml), an OpenAPI 3.1 description of the same routes. This page follows the code in `src/app.mjs`.

## Conventions

### Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness and storage levels |
| `POST` | `/api/links` | Store a payload, get a short link |
| `GET` | `/api/links/{id}` | Read a stored payload, for tooling |
| `GET` | `/s/{id}` | Follow a short link |
| `POST` | `/api/images` | Upload an image, get its URL and delete token |
| `GET` | `/api/images/{id}` | Fetch an image |
| `DELETE` | `/api/images/{id}` | Delete an image with its token |

`{id}` is ten base62 characters, `[0-9A-Za-z]{10}`.

- `HEAD` works on every `GET` route and returns the same status and headers without a body.
- Any other method on a known path gets `405 method_not_allowed` with an `Allow` header listing the methods that path serves.
- Any other path gets `404 not_found`, except paths under `/s/`, which redirect to the missing-link page.
- A query string is ignored for routing.
- A request target that does not start with `/` gets `400 bad_request`.

### Authentication

There are no accounts or API keys. POST and DELETE pass a same-origin check: if `Origin` is sent it must equal `PUBLIC_ORIGIN`, and if `Sec-Fetch-Site` is sent it must be `same-origin`. Otherwise the answer is `403 forbidden_origin`. Requests with neither header are accepted. Deleting an image also needs its `X-Delete-Token`.

### Headers on every response

```http
Cache-Control: no-store, no-transform
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
X-Robots-Tag: noindex, nofollow
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

Image responses override `Cache-Control` (see [`GET /api/images/{id}`](#get-apiimagesid)). No response carries CORS headers.

### Errors

Every error body is JSON with `Content-Type: application/json; charset=utf-8`:

```json
{"error":"rate_limited"}
```

| Status | Codes | Notes |
| --- | --- | --- |
| `400` | `bad_prefix`, `bad_encoding`, `bad_gzip`, `bad_json`, `bad_image`, `type_mismatch`, `bad_dimensions`, `bad_request` | |
| `403` | `forbidden_origin` | |
| `404` | `not_found` | |
| `405` | `method_not_allowed` | With `Allow`. |
| `413` | `too_large` | With `Connection: close`. |
| `415` | `unsupported_media_type` | |
| `429` | `rate_limited` | With `Retry-After` in seconds. |
| `500` | `internal` | An unexpected error, such as a database error. Logged with the route and the error's class name. |
| `503` | `busy` | With `Retry-After: 5` and `Connection: close`. |
| `503` | `unavailable` | From `/api/health` only. |
| `507` | `storage_full` | |

## GET /api/health

Liveness and the storage level of both databases. Not rate limited.

| Status | Body |
| --- | --- |
| `200` | `{"status":"ok","links":"ok","images":"ok"}` |
| `503` | `{"error":"unavailable"}` when a database answers its ping with something unexpected |
| `500` | `{"error":"internal"}` when a database query throws |

`links` and `images` are each `ok`, `high` (at or above 80 % of the count cap or the byte cap) or `full` (at a cap). A `high` or `full` level still answers `200`.

## POST /api/links

Stores a payload and returns its short link.

| Request | Value |
| --- | --- |
| `Content-Type` | `text/plain`. Parameters such as `charset` are ignored. |
| Body | `PAYLOAD_PREFIX` (default `#state=v1.`) followed by the canonical, unpadded base64url of one gzip member whose content is a UTF-8 JSON object. |
| Body length | At most the prefix length plus 65,536 characters (65,546 with the default prefix). |
| Headers | Optional `Origin`, `Sec-Fetch-Site` as described above. |

| Status | Body | When |
| --- | --- | --- |
| `201` | `{"id":"pR4kq0ZtXa","url":"http://localhost:8080/s/pR4kq0ZtXa"}` | Stored as a new link. |
| `200` | Same shape | The same payload is already stored. Its expiry, if still pending, moves forward. |
| `400` | `bad_prefix`, `bad_encoding`, `bad_gzip`, `bad_json` | Malformed payload. See [the payload format](/libs/share-links/guides/short-links/#the-payload-format). |
| `403` | `forbidden_origin` | Same-origin check failed. |
| `405` | `method_not_allowed` | `Allow: POST`. |
| `413` | `too_large` | Body over the limit (declared or streamed), or JSON over 256 KiB after inflating. |
| `415` | `unsupported_media_type` | Not `text/plain`. |
| `429` | `rate_limited` | Attempt limit before the body is read, or a per-client, daily, bytes or global limit before storing. |
| `503` | `busy` | The memory budget for bodies in flight is full. The body is not read. |
| `507` | `storage_full` | The link store is at `MAX_LINKS` or `MAX_LINK_BYTES` after sweeping expired links. |

`url` is always `PUBLIC_ORIGIN` + `/s/` + `id`.

## GET /api/links/{id}

Returns a stored payload, for tooling. It does not count as opening the link and does not change its expiry. Counts against the read limit.

| Status | Body |
| --- | --- |
| `200` | `{"id":"pR4kq0ZtXa","payload":"#state=v1.H4sI...","createdAt":"2026-10-24T09:00:00.000Z"}` |
| `404` | `not_found` for an unknown, expired or malformed id |
| `405` | `method_not_allowed`, `Allow: GET, HEAD` |
| `429` | `rate_limited` |

## GET /s/{id}

Follows a short link. Counts against the read limit.

| Status | Headers | When |
| --- | --- | --- |
| `302` | `Location: <PUBLIC_ORIGIN><LINK_TARGET_PATH><payload>` | The link exists and has not expired. The first `GET` or `HEAD` clears its expiry. |
| `302` | `Location: <PUBLIC_ORIGIN><LINK_MISSING_PATH>` | Unknown or expired id, or any other path under `/s/`. |
| `405` | `Allow: GET, HEAD` | Another method. |
| `429` | `Retry-After` | Read limit reached. |

The `302` body is empty and carries `Cache-Control: no-store, no-transform`.

## POST /api/images

Uploads an image.

| Request | Value |
| --- | --- |
| `Content-Type` | `image/png`, `image/jpeg` or `image/webp`. Must match the file's bytes. |
| Body | The raw file, at most 1,572,864 bytes (1.5 MiB), each side 16 to 2048 pixels. |
| Headers | Optional `Origin`, `Sec-Fetch-Site` as described above. |

| Status | Body | When |
| --- | --- | --- |
| `201` | `{"id":"Jd83kQm0aZ","url":"http://localhost:8080/api/images/Jd83kQm0aZ","token":"<32 base64url characters>"}` | Stored as a new image. The token is returned only here. |
| `200` | `{"id":"Jd83kQm0aZ","url":"http://localhost:8080/api/images/Jd83kQm0aZ"}` | The same bytes are already stored. No token. |
| `400` | `bad_image`, `type_mismatch`, `bad_dimensions` | Not a PNG, JPEG or WebP by its bytes; declared type differs; a side outside 16 to 2048 px. |
| `403` | `forbidden_origin` | Same-origin check failed. |
| `405` | `method_not_allowed` | `Allow: POST`. |
| `413` | `too_large` | Body over 1.5 MiB, declared or streamed. |
| `415` | `unsupported_media_type` | Any other `Content-Type`, including `image/svg+xml` and `image/gif`. |
| `429` | `rate_limited` | Attempt limit, or a per-client, daily, bytes or global limit. |
| `503` | `busy` | The memory budget for bodies in flight is full. |
| `507` | `storage_full` | The image store is at `MAX_IMAGES` or `MAX_IMAGE_BYTES`. |

## GET /api/images/{id}

Returns the stored bytes. Counts against the read limit.

| Status | When |
| --- | --- |
| `200` | Found. |
| `404` | `not_found` for an unknown or malformed id. |
| `405` | `method_not_allowed`, `Allow: GET, HEAD, DELETE`. |
| `429` | `rate_limited`. |

A `200` carries the stored type and these headers on top of the common ones:

```http
Content-Type: image/png
Cache-Control: public, max-age=31536000, immutable, no-transform
Content-Disposition: inline
```

## DELETE /api/images/{id}

Deletes an image with the token returned at upload. Each call counts as an image attempt, like an upload.

| Request | Value |
| --- | --- |
| `X-Delete-Token` | The `token` from the `201` upload answer. |
| Headers | Optional `Origin`, `Sec-Fetch-Site` as described above. |

| Status | Body | When |
| --- | --- | --- |
| `204` | Empty | Deleted. |
| `403` | `forbidden_origin` | Same-origin check failed. |
| `404` | `not_found` | Wrong token, missing token, unknown id, or already deleted. All look the same. |
| `429` | `rate_limited` | Image attempt limit reached. |
