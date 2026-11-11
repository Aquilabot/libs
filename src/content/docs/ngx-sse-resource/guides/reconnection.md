---
title: Reconnection and backoff
description: Choose between exponential backoff, the browser's own reconnect, or no reconnect.
---

`EventSource` reconnects on its own. It waits the time the server sent in a `retry:` field (or a browser default) and sends a `Last-Event-ID` header. It never increases the delay, and JavaScript can neither read the `retry:` value nor set that header. The `reconnect` option picks who handles a dropped connection:

| Value | Behaviour |
| --- | --- |
| an `SseBackoff` object (default `{}`) | The library closes the `EventSource` and opens a new one after an exponential delay. |
| `'browser'` | The library leaves reconnecting to the browser. |
| `false` | No reconnect. The first error ends the stream. |

## Backoff (default)

On any `error` event the library closes the native `EventSource` first, so the browser does not start a reconnect of its own in parallel. Then it sets status `reconnecting`, waits, and creates a new `EventSource` for the same URL.

The delay before attempt `n` (counting from 0) is:

```ts
Math.min(maxDelayMs, initialDelayMs * factor ** n)
```

With the defaults (`initialDelayMs: 500`, `factor: 2`, `maxDelayMs: 10000`) the delays are 500, 1000, 2000, 4000, 8000, 10000, 10000 ms and so on. A successful `open` resets the counter, so the next failure waits `initialDelayMs` again.

```ts
readonly quotes = sseResource<Quote>(() => '/api/quotes', {
  reconnect: { initialDelayMs: 100, maxDelayMs: 300 },
});
// failures wait 100, 200, 300, 300, 300 ms ...
```

`maxAttempts` limits how many reconnects in a row the library tries. After that many failed reconnects, the next error sets status `error` and no more timers are scheduled. The default is `Infinity`.

```ts
readonly quotes = sseResource<Quote>(() => '/api/quotes', {
  reconnect: { initialDelayMs: 100, maxAttempts: 2 },
});
// first error: wait 100 ms, reconnect
// second error: wait 200 ms, reconnect
// third error: status 'error', stop
```

There is no random jitter. Many clients that drop at the same moment reconnect at the same moments.

### Resume with lastEventIdParam

Each backoff reconnect is a new `EventSource`, so the browser does not send `Last-Event-ID`. The server's `retry:` value is also ignored in this mode. To let the server resume, set `lastEventIdParam`. On a backoff reconnect, the library appends the last received event id to the URL under that query parameter name:

```ts
readonly job = sseResource<JobEvent>(() => '/api/jobs/7/events', {
  lastEventIdParam: 'lastEventId',
});
// after receiving id 42 and losing the connection:
// GET /api/jobs/7/events?lastEventId=42
```

The parameter is added with `&` when the URL already has a query string, and both name and value are URL-encoded. It is only added on reconnects, and only once an event with an id has arrived. Your server has to read the parameter. The repository's demo server reads either the query parameter or the `Last-Event-ID` header.

## Browser reconnect

```ts
readonly feed = sseResource<FeedItem>(() => '/api/feed', { reconnect: 'browser' });
```

On an error while the `EventSource` is still in the `CONNECTING` state, the library does nothing to the connection. It sets status `reconnecting` and puts an `SseConnectionError` in `error()`. When the browser reopens the stream, the status returns to `open` and `error()` clears. The server's `retry:` and the `Last-Event-ID` header work as the SSE specification describes.

If the browser gives up (the `EventSource` reaches the `CLOSED` state, for example after a non-200 response or a wrong content type), the status becomes `error`.

## No reconnect

```ts
readonly stream = sseResource<Item>(() => '/api/once', { reconnect: false });
```

The first error closes the `EventSource` and sets status `error`. Nothing reconnects until the URL changes.

## One-shot streams

A server that ends the response after its last event looks like a dropped connection to `EventSource`. In the default mode the library reconnects. If a new connection would start the work again, close the stream before that happens:

- use `until` to close on the final event, or
- set `reconnect: false`.

See [Named events, parsing and until](/libs/ngx-sse-resource/guides/events-and-parsing/#close-on-a-final-event-with-until).

## Stopping reconnects

`close()` closes the current `EventSource`, cancels a pending reconnect timer and sets status `closed`. Destroying the injector that owns the resource does the same. A URL change also cancels the pending timer before opening the new connection.
