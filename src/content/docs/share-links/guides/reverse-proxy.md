---
title: Running behind a reverse proxy
description: Same-origin deployment, the Origin and Sec-Fetch-Site check, and how the service picks the client address behind trusted proxies.
---

The service is built to sit on the same origin as the app that uses it, path-routed by a reverse proxy. The proxy terminates TLS. The service trusts the proxy, the operator and the host, and nothing a client sends.

## Routing

Route these paths of the app's origin to the service, unchanged:

- `/api/links` and `/api/links/<id>`
- `/api/images` and `/api/images/<id>`
- `/api/health`
- `/s/<id>`

The service matches fixed patterns and answers `404` for anything else (or a redirect to the missing-link page under `/s/`). No request path is ever joined to a file path. A request target that does not start with `/`, such as an absolute URL, gets `400 bad_request`.

Then set:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | The app's origin, for example `https://app.example.com`. Scheme, host and optional port, no path. |
| `TRUSTED_PROXIES` | The CIDR ranges of every proxy hop you run, comma-separated. |
| `FORWARDED_HEADER` | Only if your proxy writes something other than `X-Forwarded-For`, for example `x-real-ip`. |
| `LINK_TARGET_PATH`, `LINK_MISSING_PATH` | The app's page that reads the fragment, and its page for a gone link. |

This nginx snippet is not part of the repository. It shows the routing for a service published on `127.0.0.1:8080`:

```nginx
server {
    # TLS, server_name and the app's own locations go here.

    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    location /api/links  { proxy_pass http://127.0.0.1:8080; }
    location /api/images { proxy_pass http://127.0.0.1:8080; }
    location /api/health { proxy_pass http://127.0.0.1:8080; }
    location /s/         { proxy_pass http://127.0.0.1:8080; }
}
```

The proxy must pass `Origin` and `Sec-Fetch-Site` through unchanged and must not add CORS headers.

## Returned URLs come from PUBLIC_ORIGIN

Every `url` in a response and every redirect `Location` is built from `PUBLIC_ORIGIN`, never from the `Host` header. A forged `Host` cannot change where a link points. The test `generated URLs use PUBLIC_ORIGIN, never the Host header` sends `Host: evil.example` and checks both.

## The same-origin check

On `POST /api/links`, `POST /api/images` and `DELETE /api/images/<id>`:

- If `Origin` is sent, it must equal `PUBLIC_ORIGIN` exactly. `null`, another scheme or another port is refused.
- If `Sec-Fetch-Site` is sent, it must be `same-origin`. `same-site`, `cross-site` and `none` are refused.
- A failure answers `403 {"error":"forbidden_origin"}` before anything is read or counted.

Clients that send neither header, such as curl or a backend, are accepted. A forged cross-site request needs a victim's browser, and a browser always sends `Origin` on POST and DELETE, which a cross-site page cannot choose.

There is no CORS. No response carries `Access-Control-*` headers and a preflight `OPTIONS` gets `405` with `Allow`. Another site's scripts cannot read the responses.

## Which address is the client

`clientKey` in `src/client-ip.mjs` decides the key that per-client limits count against.

Without `TRUSTED_PROXIES` (the default), the key is the TCP peer address. Forwarded headers are ignored, so nobody can pick their own key.

With `TRUSTED_PROXIES`, if the TCP peer is inside a listed range, the service reads the forwarded header from right to left:

1. Each entry that is a trusted proxy is skipped.
2. The first entry that is not a trusted proxy is the client.
3. Entries to its left were written by the client and are ignored.
4. If an entry is not an IP address, the walk stops and the last good address is used. With no usable entry, that is the proxy itself.
5. If every entry is trusted, the leftmost one is the client.

Examples from the unit test, with `127.0.0.1/32` and `192.0.2.0/28` trusted and the peer at `127.0.0.1`:

| `X-Forwarded-For` | Client key |
| --- | --- |
| `203.0.113.9` | `203.0.113.9` |
| `203.0.113.9, 192.0.2.5` | `203.0.113.9` |
| `198.51.100.1, 203.0.113.9, 192.0.2.5` | `203.0.113.9` (the forged left entry is ignored) |
| `203.0.113.9, garbage` | `127.0.0.1` |
| none | `127.0.0.1` |

Addresses are normalised first: brackets, IPv6 zone ids and the `::ffff:` prefix of IPv4-mapped addresses are removed. Repeated header lines are joined. IPv6 clients are keyed by their /64, for example `2001:db8:aa:bb::/64`.

`TRUSTED_PROXIES` must cover the address the proxy's connections arrive from, as the service sees it. Behind Docker port publishing or a container network, that can differ from the address the proxy itself uses. If the proxy is not covered, every client gets the proxy's key and they all share one quota. If a range is too wide, clients inside it can choose their own key with the header.

A malformed range, such as `192.0.2.0/40`, stops the service at start.

## Logs do not hold client data

The access log has one line per request with method, route kind, status and milliseconds. It does not contain ids, payloads, addresses or tokens:

```json
{"time":"2026-10-24T09:00:00.000Z","method":"POST","route":"link-create","status":201,"ms":1.42}
```

The route kinds are `health`, `link-create`, `link-read`, `redirect`, `image-create`, `image` and `other`.
