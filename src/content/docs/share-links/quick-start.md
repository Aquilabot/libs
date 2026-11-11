---
title: Quick start
description: Create and resolve a short link, then upload and delete an image, with curl against a local service.
---

These requests run against a service started with `npm start` or `docker compose up --build`, on `http://localhost:8080` with the default settings. curl sends neither `Origin` nor `Sec-Fetch-Site`, so the same-origin check lets it through. Browsers always send `Origin` on POST and DELETE, and it must equal `PUBLIC_ORIGIN`.

Ids and tokens below are examples. Yours will differ.

## Check the service

```bash
curl -s localhost:8080/api/health
```

```json
{"status":"ok","links":"ok","images":"ok"}
```

`links` and `images` are storage levels: `ok`, `high` from 80 % of a cap, or `full`.

## Create a short link

A payload is the prefix `#state=v1.` followed by the unpadded base64url of a gzip of a JSON object. This is what a browser gets from `CompressionStream('gzip')`. On Linux you can build one with `gzip` and GNU `base64`:

```bash
payload="#state=v1.$(printf '{"view":"board","items":[1,2,3]}' | gzip -nc | base64 -w0 | tr '+/' '-_' | tr -d '=')"
curl -s localhost:8080/api/links -H 'content-type: text/plain' --data-binary "$payload"
```

```json
{"id":"pR4kq0ZtXa","url":"http://localhost:8080/s/pR4kq0ZtXa"}
```

The status is `201` for a new link. Posting the same payload again returns `200` with the same `id` and `url`.

The `content-type: text/plain` header is required. Without it, curl sends `application/x-www-form-urlencoded` and the service answers `415` with `{"error":"unsupported_media_type"}`.

## Resolve it

```bash
curl -si localhost:8080/s/pR4kq0ZtXa
```

```http
HTTP/1.1 302 Found
Location: http://localhost:8080/#state=v1.H4sIAAAAAAAAA6tWKs...
Cache-Control: no-store, no-transform
```

The target is `PUBLIC_ORIGIN` + `LINK_TARGET_PATH` (default `/`) + the stored payload. This first opening clears the link's 30-day expiry. An unknown id redirects to `PUBLIC_ORIGIN` + `LINK_MISSING_PATH` (default `/link-not-found`), a page your app serves.

To read the stored payload without opening the link, for tooling:

```bash
curl -s localhost:8080/api/links/pR4kq0ZtXa
```

```json
{"id":"pR4kq0ZtXa","payload":"#state=v1.H4sIAAAAAAAAA6tWKs...","createdAt":"2026-10-24T09:00:00.000Z"}
```

## Upload an image

The body is the raw file. The declared type must match the file's bytes, each side must be 16 to 2048 pixels, and the file must be at most 1.5 MiB. This example uses `jq` to read fields from the answer:

```bash
response=$(curl -s localhost:8080/api/images -H 'content-type: image/png' --data-binary @photo.png)
echo "$response"
id=$(printf '%s' "$response" | jq -r .id)
token=$(printf '%s' "$response" | jq -r .token)
```

```json
{"id":"Jd83kQm0aZ","url":"http://localhost:8080/api/images/Jd83kQm0aZ","token":"<32 base64url characters>"}
```

The token is returned only on this `201` answer. Uploading the same bytes again returns `200` with `id` and `url` and no token.

Fetch it:

```bash
curl -sI "localhost:8080/api/images/$id"
```

```http
HTTP/1.1 200 OK
Content-Type: image/png
Cache-Control: public, max-age=31536000, immutable, no-transform
Content-Disposition: inline
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: same-origin
```

## Delete the image

```bash
curl -si -X DELETE "localhost:8080/api/images/$id" -H "x-delete-token: $token"
```

```http
HTTP/1.1 204 No Content
```

A second delete, a wrong token, a missing token or an unknown id all answer the same way:

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":"not_found"}
```

## Next steps

- [Short links and their expiry](/libs/share-links/guides/short-links/) shows how a browser app builds payloads.
- [Image uploads and delete tokens](/libs/share-links/guides/image-uploads/) covers validation and caching.
- [HTTP API reference](/libs/share-links/reference/http-api/) lists every status code.
