---
title: Connection status in templates
description: Show connection state and errors with the status and error signals.
---

Every resource exposes four signals: `value`, `status`, `error` and `lastEventId`. They are read-only and can be used in templates and `computed` like any other signal.

## Status values

`status()` returns an `SseStatus`:

| Status | When |
| --- | --- |
| `idle` | The URL function returned `null` or `undefined`, or the code runs on the server, or there is no `EventSource` constructor. |
| `connecting` | The first `EventSource` for the current URL was created and has not opened yet. Later attempts for the same URL show `reconnecting`. |
| `open` | The `EventSource` fired `open`. |
| `reconnecting` | The connection failed and a reconnect is pending or in progress. |
| `closed` | `close()` was called, `until` returned `true`, or the owning injector was destroyed. |
| `error` | The connection failed and no reconnect will follow: `reconnect` is `false`, `maxAttempts` was reached, or the browser gave up in `'browser'` mode. |

## Show the status

```ts title="ticker.component.ts"
import { Component, computed } from '@angular/core';
import { sseResource } from 'ngx-sse-resource';

type Quote = { symbol: string; price: number };

@Component({
  selector: 'app-ticker',
  template: `
    @switch (quotes.status()) {
      @case ('connecting') { <p>Connecting...</p> }
      @case ('reconnecting') { <p>Connection lost, retrying...</p> }
      @case ('error') { <p>Live prices are unavailable.</p> }
    }

    @if (quotes.value(); as quote) {
      <p [class.stale]="!live()">{{ quote.symbol }}: {{ quote.price }}</p>
    }
  `,
})
export class TickerComponent {
  readonly quotes = sseResource<Quote>(() => '/api/quotes');

  readonly live = computed(() => this.quotes.status() === 'open');
}
```

A failed connection does not clear `value()`. The last value stays visible while the resource reconnects, so you can mark it as stale instead of hiding it. Only a URL change resets `value()` to `undefined`.

## The error signal

`error()` holds the last problem, typed as `unknown`. It is one of two things:

- whatever `parse` threw (for example a `SyntaxError` from `JSON.parse`), or
- an `SseConnectionError` when the connection failed.

The next parsed value or the next successful `open` clears it back to `undefined`. A URL change also clears it.

```ts
import { computed } from '@angular/core';
import { SseConnectionError } from 'ngx-sse-resource';

readonly errorMessage = computed(() => {
  const error = this.quotes.error();
  if (error instanceof SseConnectionError) return `Cannot reach ${error.url}`;
  if (error instanceof Error) return error.message;
  return null;
});
```

`SseConnectionError` has two read-only fields: `url`, the URL your function returned, and `event`, the raw `Event` from `EventSource`. Its message is `SSE connection to <url> failed`. `EventSource` exposes no HTTP status code or response body, so the error cannot include them.

An error can be present while the status is `open`. That happens when one event fails to parse and the stream continues.

## Last event id

`lastEventId()` holds the `id:` field of the last event that had one. It stays `undefined` if the server does not send ids. It survives reconnects and resets only when the URL changes. The [reconnection guide](/libs/ngx-sse-resource/guides/reconnection/#resume-with-lasteventidparam) shows how to send it back to the server.
