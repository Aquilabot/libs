---
title: Image uploads and delete tokens
description: Which images the service accepts, how it serves them, and how the per-image delete token works.
---

The image routes store PNG, JPEG and WebP files that an app uploads and serve them back from its own origin. Nothing the service serves can carry script, because every other format is refused before it is stored.

## What gets in

`inspectImage` in `src/image.mjs` reads the file's own header bytes without an image library. The checks run in this order:

| Check | Rule | Answer when it fails |
| --- | --- | --- |
| Declared type | `Content-Type` is `image/png`, `image/jpeg` or `image/webp`, checked before the body is read | `415 unsupported_media_type` |
| Size | At most 1.5 MiB (1,572,864 bytes), declared or while streaming | `413 too_large` |
| Format | PNG signature and `IHDR` chunk, a JPEG frame header (SOF0 to SOF15, baseline or progressive), or a WebP `RIFF` file with a `VP8 `, `VP8L` or `VP8X` chunk whose RIFF size matches the body | `400 bad_image` |
| Type match | The format found equals the declared type | `400 type_mismatch` |
| Dimensions | Width and height each from 16 to 2048 pixels | `400 bad_dimensions` |

SVG, GIF, HTML, truncated files and a WebP with bytes appended after its RIFF size are refused. These limits are constants in the code, not settings. `MAX_IMAGE_BYTES` in the environment is the total byte cap of the image store, not the per-file limit.

The service never decodes pixels. A file with a valid header and broken image data is stored as is. Re-encoding in the browser before upload, which also drops EXIF metadata, is the client's job.

## Upload

```bash
curl -s localhost:8080/api/images -H 'content-type: image/webp' --data-binary @photo.webp
```

| Status | Body | When |
| --- | --- | --- |
| `201` | `{"id", "url", "token"}` | A new image was stored. |
| `200` | `{"id", "url"}` | The same bytes are already stored. No token. |

The `url` is `PUBLIC_ORIGIN` + `/api/images/<id>`. Deduplication uses the SHA-256 of the bytes, so the same file always maps to the same id, and a second uploader of the same file never receives a token for it.

## Serving

`GET /api/images/<id>` returns the stored bytes with:

```http
Content-Type: image/png
Cache-Control: public, max-age=31536000, immutable, no-transform
Content-Disposition: inline
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

An image never changes under its id, so browsers and caches may keep it for a year. `Cross-Origin-Resource-Policy: same-origin` stops other sites from embedding it. `HEAD` returns the same headers without the body. Reads count against the per-client read limit shared with the link routes.

## Delete tokens

Each new image gets a token of 24 random bytes from `crypto.randomBytes`, encoded as 32 base64url characters (192 bits). The response carries it once. The store keeps only its SHA-256, and a test checks that the token appears neither in `images.sqlite` nor in its WAL file.

```bash
curl -si -X DELETE "localhost:8080/api/images/$id" -H "x-delete-token: $token"
```

- The right token answers `204` and deletes the row. The token works once.
- A wrong token, a missing token and an unknown id all answer `404 {"error":"not_found"}`, so the answer does not reveal whether an id exists. The comparison uses `timingSafeEqual` on the hashes.
- DELETE goes through the same origin check as POST. A browser request from another origin gets `403 forbidden_origin`.
- Every DELETE counts as an image attempt, like an upload, so tokens cannot be brute-forced faster than `IMAGE_ATTEMPT_LIMIT` per `IMAGE_ATTEMPT_WINDOW_MS` (30 per 10 minutes by default).

## Images do not expire

Unlike links, images stay until their token is used or an operator removes them. `node src/admin.mjs image-purge --id <id> --yes` deletes one image without its token, and `image-purge --from ... --to ...` deletes by upload time. See [operations](/libs/share-links/guides/operations/).

The store is bounded by `MAX_IMAGES` (2000) and `MAX_IMAGE_BYTES` (200 MiB). Past either cap, uploads get `507 storage_full` and `/api/health` reports `images: "full"`. Per-client and global upload limits are described in [rate limits and memory](/libs/share-links/guides/rate-limits/).

## Storage

Images live in their own SQLite file, `images.sqlite`, with their own backups (two days kept by default), so they never weigh on the links' database or its backups. The blob is the last column of the table. SQLite then reads `bytes` for the cap check without walking the blob's overflow pages. The README reports that with the blob first, image uploads ran at 33 req/s on the burst benchmark, and at 1400 with it last.
