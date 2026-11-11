---
title: Reactive URLs from signals
description: Drive the connection from signals, and use null to keep it closed.
---

The first argument to `sseResource()` is a function, not a string. It runs inside a `computed`, so any signal it reads becomes a dependency. An `effect` watches the result and opens, switches or closes the connection.

## Follow a signal

```ts title="order-tracker.component.ts"
import { Component, input } from '@angular/core';
import { sseResource } from 'ngx-sse-resource';

type OrderUpdate = { state: string; updatedAt: string };

@Component({
  selector: 'app-order-tracker',
  template: `<p>{{ updates.value()?.state ?? 'waiting' }}</p>`,
})
export class OrderTrackerComponent {
  readonly orderId = input.required<string>();

  readonly updates = sseResource<OrderUpdate>(() => `/api/orders/${this.orderId()}/events`);
}
```

When `orderId` changes:

1. The current `EventSource` closes and any pending reconnect timer is cancelled.
2. `value`, `error` and `lastEventId` reset to `undefined`.
3. A new `EventSource` opens for the new URL and `status` becomes `connecting`.

Events that arrive late on the old connection are ignored. Each listener checks that its `EventSource` is still the current one before it touches a signal.

## Use null for no connection

Return `null` or `undefined` to keep the resource closed. The status is `idle` and no `EventSource` exists.

```ts
readonly selectedId = signal<string | null>(null);

readonly feed = sseResource<FeedItem>(() => {
  const id = this.selectedId();
  return id === null ? null : `/api/feeds/${id}/events`;
});
```

If the URL goes from a string back to `null`, the open connection closes and the status returns to `idle`.

## Same string, same connection

The URL goes through a `computed`, which compares results with `===`. If a signal the function reads changes but the function returns the same string, nothing happens. The connection stays open and no new `EventSource` is created.

## After close() or until

`close()` and a matching `until` both close the connection and set status `closed`. The resource keeps watching the URL. The next time the URL function returns a different value, a new connection opens and the status moves to `connecting`.

## Timing

The connection does not open during the `sseResource()` call. It opens when Angular runs the effect, which happens during change detection. In tests, call `TestBed.tick()` after creating the resource or after changing a signal the URL reads. See [Testing with a fake EventSource](/libs/ngx-sse-resource/guides/testing/).
