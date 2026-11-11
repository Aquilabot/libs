---
title: Short links and their expiry
description: How a browser app encodes its URL-fragment state, how the service validates and deduplicates it, and when a link expires.
---

A short link stores one URL fragment. The service checks the fragment's encoding and container, not the fields of the object inside it: the app that opens the link validates its own state (`src/payload.mjs`).

## The payload format

A payload is `PAYLOAD_PREFIX` (default `#state=v1.`) followed by the unpadded base64url of one gzip stream whose content is a UTF-8 JSON object. `validatePayload` refuses anything else with a `400` and one of these codes:

| Code | Cause |
| --- | --- |
| `bad_prefix` | The body does not start with the prefix. |
| `bad_encoding` | Nothing after the prefix, a character outside `A-Z a-z 0-9 - _`, `=` padding, an impossible length, or a spelling that is not the canonical base64url of its bytes. |
| `bad_gzip` | Not a gzip header with deflate and no optional header fields, a wrong CRC or length, trailing bytes, or a second gzip member. |
| `bad_json` | The content is not valid UTF-8, not JSON, or JSON that is not an object (an array, `null`, a string). |

Only the canonical base64url and a single gzip member are accepted, so one state has one stored text and one id. Browsers refuse trailing bytes and second members too.

Size limits are fixed in code:

| Limit | Value | Answer past it |
| --- | --- | --- |
| Body length | prefix length + 65,536 characters (65,546 with the default prefix) | `413 too_large` |
| JSON after inflating | 256 KiB | `413 too_large` |

Inflating stops at 256 KiB (`maxOutputLength`), so a gzip bomb costs at most that much memory before it is refused.

## Encoding state in the browser

This sketch is not part of the repository. It produces the format above with `CompressionStream`:

```js
async function encodeState(state) {
  const json = new TextEncoder().encode(JSON.stringify(state));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#state=v1.${base64url}`;
}

const response = await fetch('/api/links', {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: await encodeState({ view: 'board', items: [1, 2, 3] }),
});
const { id, url } = await response.json();
```

The request goes to the app's own origin, so the browser sends `Origin` equal to `PUBLIC_ORIGIN` and `Sec-Fetch-Site: same-origin`. Any other `Content-Type` than `text/plain` (parameters such as `charset` are ignored) gets `415 unsupported_media_type`.

## Deduplication

The links table has a unique index on the SHA-256 of the payload. Posting a payload that is already stored and not expired returns `200` with the existing `id` and `url`. It does not count against any quota except the sender's attempts. A new payload returns `201`.

## The redirect

`GET /s/<id>` answers `302` with `Location` set to `PUBLIC_ORIGIN` + `LINK_TARGET_PATH` + payload, and `Cache-Control: no-store, no-transform`. The browser follows it and the app reads its state from `location.hash`.

Every other path under `/s/`, including a malformed or unknown id, redirects to `PUBLIC_ORIGIN` + `LINK_MISSING_PATH`. That page belongs to the app and should say the link is gone. Both redirects are built from configuration only, never from the `Host` header, so `/s/` cannot redirect to another site.

`GET /api/links/<id>` returns `{id, payload, createdAt}` as JSON for tooling. It does not count as opening the link.

## Expiry

A new link gets `expires_at` = now + `UNOPENED_TTL_MS` (30 days by default). Then:

- The first `GET` or `HEAD` of `/s/<id>` sets `expires_at` to `NULL`. An opened link never expires.
- Posting the same payload again while it is pending moves its expiry to now + `UNOPENED_TTL_MS`.
- Once the expiry passes, the link reads as missing right away: `/s/<id>` goes to the missing-link page and `/api/links/<id>` answers `404`.
- An expired payload posted again is stored as a new link with a new id.
- Expired rows are deleted by the sweep that runs with the backups, at start and every `BACKUP_INTERVAL_MS` (one hour by default), and by `node src/admin.mjs sweep`.
- When the store is at its cap, an insert sweeps expired links first and refuses with `507 storage_full` only if there is still no room.

The test `a link nobody opens expires; opening it keeps it; posting it again moves its expiry` walks through these cases with a fake clock.

## Ids

An id is ten base62 characters (`0-9 A-Z a-z`) drawn with `crypto.randomInt`, about 59.5 bits. If a drawn id is already taken the store draws again, up to eight times. Reads of `/s/` and `/api/links/` are rate limited per client to slow down guessing.

## A different prefix

`PAYLOAD_PREFIX` sets the fragment prefix. It must be `#` followed by up to 32 characters from `A-Z a-z 0-9 . _ ~ = -`, so it needs no escaping in a URL. Payloads with another prefix get `400 bad_prefix`. Changing it does not rewrite stored links.
