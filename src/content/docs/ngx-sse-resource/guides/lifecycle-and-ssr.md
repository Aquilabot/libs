---
title: Injection context, cleanup and SSR
description: Where to call sseResource, how the connection is cleaned up, and what happens on the server.
---

## Injection context

`sseResource()` uses Angular's `inject()` and `effect()`, so it needs an injection context. Field initializers and constructors of components, directives and services qualify:

```ts
import { Injectable } from '@angular/core';
import { sseResource } from 'ngx-sse-resource';

type AppNotification = { id: string; text: string };

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  readonly latest = sseResource<AppNotification>(() => '/api/notifications');
}
```

Called anywhere else without an injector, it throws Angular's injection context error. To create a resource later, for example in a method, pass an injector:

```ts
import { Component, Injector, inject } from '@angular/core';
import { SseResource, sseResource } from 'ngx-sse-resource';

type ReportProgress = { percent: number };

@Component({ selector: 'app-report', template: '' })
export class ReportComponent {
  private readonly injector = inject(Injector);
  report?: SseResource<ReportProgress>;

  run(reportId: string): void {
    this.report?.close();
    this.report = sseResource<ReportProgress>(() => `/api/reports/${reportId}/events`, {
      injector: this.injector,
    });
  }
}
```

The injector decides two things: where the `effect` runs and which `DestroyRef` ends the connection. Each call creates a new resource with its own connection, which is why the example closes the previous one first.

## Cleanup

The resource registers an `onDestroy` callback on the injector's `DestroyRef`. When the component, service or environment injector is destroyed, the callback:

- closes the current `EventSource`,
- cancels a pending backoff timer, so no reconnect fires later,
- sets status `closed`.

You do not need `ngOnDestroy` or `takeUntilDestroyed`. To stop earlier, call `close()`. It does the same work, and the resource still reacts to later URL changes.

A resource created in a root service lives as long as the app. Each resource owns its own connection: two resources with the same URL open two `EventSource` instances.

## Server-side rendering

When the resource is created, it checks two things:

- the `SSE_EVENT_SOURCE` token returns a constructor (by default the global `EventSource`, or `undefined` where none exists, as in Node), and
- `isPlatformServer(PLATFORM_ID)` is false.

If either check fails, `sseResource()` returns a resource that stays `idle`. It creates no effect and no `EventSource`, and `close()` is safe to call. The same component code runs on the server and in the browser. In the browser the resource connects as usual.

## Replacing the EventSource constructor

`SSE_EVENT_SOURCE` is an `InjectionToken` provided in root. Its value has the type:

```ts
type EventSourceConstructor = new (url: string, init?: EventSourceInit) => EventSource;
```

Provide a different class to use a polyfill or a wrapper:

```ts title="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { SSE_EVENT_SOURCE } from 'ngx-sse-resource';
import { MyEventSource } from './my-event-source';

export const appConfig: ApplicationConfig = {
  providers: [{ provide: SSE_EVENT_SOURCE, useValue: MyEventSource }],
};
```

The library calls it as `new Ctor(url, { withCredentials })`. It uses `addEventListener`, `close()` and `readyState` on the instance. Anything a polyfill needs beyond that, such as headers, has to come from your own class, because the library passes nothing else. Providing `undefined` turns the resource off: it stays `idle`.

## Credentials

`withCredentials: true` is passed to every `EventSource` the resource creates, so cookies are sent on cross-origin streams. The default is `false`.

```ts
readonly events = sseResource<AccountEvent>(() => 'https://api.example.com/events', {
  withCredentials: true,
});
```
