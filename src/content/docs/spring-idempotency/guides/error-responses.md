---
title: Error responses and fingerprints
description: The problem details the filter returns, how a request fingerprint is computed, and how clients should react.
---

The filter answers four situations itself, without calling the handler. Each answer is an RFC 9457 problem details body with content type `application/problem+json`.

## Response format

```json
{"type":"about:blank","title":"Unprocessable Content","status":422,"detail":"This Idempotency-Key was already used for a different request.","instance":"/orders"}
```

- `type` is always `about:blank`.
- `title` is the reason phrase of the status (`Bad Request`, `Conflict`, `Unprocessable Content`).
- `status` is the numeric status.
- `detail` is one of the messages below. The header name in the message follows `idempotency.header-name`.
- `instance` is the request URI without the query string.

The library writes this JSON itself and does not go through Spring's `ProblemDetail` or Jackson. A `@ControllerAdvice` in your application does not change these responses.

## Status codes

| Status | When | `detail` |
|---|---|---|
| 400 | Header missing and the key is required | `This request requires an Idempotency-Key header.` |
| 400 | Header present but not a valid key | `The Idempotency-Key header must be 1 to 255 printable ASCII characters.` |
| 409 | Same key and fingerprint, first request still running | `A request with this Idempotency-Key is still being processed. Retry later.` |
| 422 | Same key, different fingerprint | `This Idempotency-Key was already used for a different request.` |

The number in the second 400 message follows `idempotency.max-key-length`.

### What a client should do

- 400: fix the request. Retrying unchanged gives the same 400.
- 409: wait and retry with the same key and the same body. There is no `Retry-After` header.
- 422: the key was used for another request. This is usually a client bug, such as a key generated per user session instead of per operation. Send the new request with a new key.

## Valid keys

The draft defines the key as a Structured Field string, so the canonical form is quoted:

```http
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

The parser, `IdempotencyKeys.parse`, accepts:

- A quoted string. Inside the quotes, `\"` and `\\` are the only escapes. Any other backslash sequence, or an unescaped quote, makes the key invalid.
- A bare value without quotes, such as `Idempotency-Key: order-42`. It is the same key as `"order-42"`. A bare value that contains a `"` anywhere is invalid.

Leading and trailing whitespace is stripped. After unquoting, the key must be 1 to `idempotency.max-key-length` characters (255 by default), all printable ASCII (0x20 to 0x7E). These all get 400: an empty header, `""`, 256 characters, `café`, `"unterminated`, a tab inside the key.

## Fingerprint

The fingerprint decides between replay and 422. It is SHA-256, as lowercase hex, over:

1. the HTTP method,
2. a newline,
3. the request URI with its query string,
4. a newline,
5. the request body bytes.

Headers are not part of it. Two requests with the same key that differ in method, path, query string or body get 422. The tests cover a different body, a PATCH to another path with the same body, and a changed form field.

The body is compared byte for byte. The same JSON with different key order or whitespace is a different request. Most HTTP clients serialize a retry identically, so this is rarely a problem in practice, but a client that rebuilds the JSON from a map with unstable ordering will see 422.

For `application/x-www-form-urlencoded` and `multipart/*` requests, the filter hashes the form fields instead of the raw body. Fields are sorted by name, URL-encoded and joined as `name=value` pairs with `&`. File parts of multipart requests are not hashed, so two multipart requests that differ only in an uploaded file have the same fingerprint.

## Replayed responses

A replay is not an error response. It carries the stored status, the stored headers, the stored body and the header `Idempotent-Replayed: true`. Rename the header with `idempotency.replayed-header-name`. A stored 4xx, for example a 400 your handler returned for a missing field, is replayed with its original body and `Idempotent-Replayed: true`.
