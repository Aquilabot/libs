---
title: Installation
description: Build ngx-sse-resource from source and add it to an Angular 22 app.
---

:::note
`ngx-sse-resource` is not published to npm yet. You build it from the repository and install the build output into your app.
:::

## Requirements

- An Angular app on version 22. The package declares `@angular/core` and `@angular/common` `^22.0.0` as peer dependencies.
- Node.js and npm to build the library. The repository's CI uses Node 24, and `package.json` pins `npm@11.20.0` as the package manager.

The library has no runtime dependencies besides Angular.

## Build the package

```bash
git clone https://github.com/Aquilabot/ngx-sse-resource
cd ngx-sse-resource
npm ci
npm run build
```

`npm run build` runs `ng build ngx-sse-resource` (ng-packagr) and copies `README.md` and `LICENSE` into the output. The package ends up in `dist/ngx-sse-resource`.

## Install it in your app

From your app's directory, install the built folder by path:

```bash
npm install /path/to/ngx-sse-resource/dist/ngx-sse-resource
```

npm records it in your `package.json` as a `file:` dependency. Rebuild the library and reinstall when you pull new changes.

## Import

Everything is exported from the package root:

```ts
import { sseResource, SSE_EVENT_SOURCE, SseConnectionError } from 'ngx-sse-resource';
import type { SseResource, SseResourceOptions, SseStatus } from 'ngx-sse-resource';
```

There are no providers to register. `sseResource()` works in any injection context. See [Quick start](/libs/ngx-sse-resource/quick-start/).
