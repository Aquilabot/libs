---
title: Compatibility
description: Supported Angular versions, the toolchain used in the repository and CI, browser requirements, license and known limitations.
---

## Package

| Item | Value |
| --- | --- |
| Library version | 0.1.0 |
| Distribution | Not on npm. Built from source with `npm run build` into `dist/ngx-sse-resource`. |
| Peer dependencies | `@angular/core` `^22.0.0`, `@angular/common` `^22.0.0` |
| Runtime dependencies | none |
| `sideEffects` | `false` |
| License | MIT |

The public API uses Angular signals only. The library does not import RxJS.

## Toolchain in the repository

These are the versions the repository builds and tests with. They are not requirements for apps that use the package, beyond the Angular peer range.

| Tool | Range in `package.json` | Version in `package-lock.json` |
| --- | --- | --- |
| Angular (`@angular/core`) | `^22.2.0` | 22.2.3 |
| Angular CLI and `@angular/build` | `^22.2.4` | |
| ng-packagr | `^22.2.0` | |
| TypeScript | `~6.0.2` | 6.0.3 |
| Vitest | `^5.0.0` | 5.0.5 |
| jsdom | `^30.0.0` | |
| npm (`packageManager`) | `npm@11.20.0` | |

Tests run with the Angular CLI unit-test builder (`@angular/build:unit-test`) on Vitest. The spec file has 27 tests.

## Continuous integration

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pushes to `main` and on pull requests. It uses `ubuntu-latest` with Node 24 and runs:

```bash
npm ci
npm run lint      # prettier --check .
npm test          # ng test ngx-sse-resource
npm run build     # builds the library into dist/ngx-sse-resource
npx ng build demo
```

## Browser requirements

The library needs a global `EventSource`, or a constructor provided through the `SSE_EVENT_SOURCE` token. Where neither exists, the resource stays in status `idle` and does not throw. On the server (`isPlatformServer`) it also stays `idle`.

## Known limitations

- GET only, with no custom headers. That is how `EventSource` works. Use cookies with `withCredentials`, a token in the URL, or a replacement constructor through `SSE_EVENT_SOURCE`.
- `value()` holds the last event only. Collect a history yourself, for example in `parse`.
- In the default backoff mode the server's `retry:` value is not used, and the browser does not send `Last-Event-ID`. Use `lastEventIdParam` to resume, or `reconnect: 'browser'`.
- The backoff has no jitter. Clients that drop at the same moment reconnect at the same moments.
- One resource is one connection. Two resources with the same URL open two connections. Over HTTP/1.1, browsers limit open connections per origin (about six), and each open stream holds one.
- `SseConnectionError` carries no HTTP status or response body, because `EventSource` does not expose them.
