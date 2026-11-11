---
title: API reference
description: Every export of ngx-sse-resource with its signature, options, defaults and status values.
---

The package entry point (`public-api.ts`) exports three values and five types:

| Export | Kind |
| --- | --- |
| `sseResource` | function |
| `SseConnectionError` | class |
| `SSE_EVENT_SOURCE` | `InjectionToken` |
| `SseResource` | interface |
| `SseResourceOptions` | interface |
| `SseBackoff` | interface |
| `SseStatus` | type |
| `EventSourceConstructor` | type |

## sseResource

```ts
function sseResource<T = unknown>(
  url: () => string | null | undefined,
  options: SseResourceOptions<T> = {},
): SseResource<T>;
```

Opens a Server-Sent Events stream and exposes it as signals.

`url` runs inside a `computed`, so it can read signals. When its result changes, the old connection closes and a new one opens. `null` or `undefined` means no connection (status `idle`). The same string returned again does not reconnect.

It must be called in an injection context unless `options.injector` is set. It throws in these cases:

- no injection context and no `injector` option (Angular's `assertInInjectionContext` error),
- an `event` name of `'open'` or `'error'`: `sseResource: "<name>" is an EventSource event, not a server event name`.

On the server (`isPlatformServer`) or when `SSE_EVENT_SOURCE` resolves to `undefined`, it returns a resource that stays `idle` and never connects.

## SseResourceOptions

```ts
interface SseResourceOptions<T> {
  event?: string | readonly string[];
  parse?: (data: string, event: MessageEvent<string>) => T;
  until?: (value: T, event: MessageEvent<string>) => boolean;
  reconnect?: SseBackoff | 'browser' | false;
  withCredentials?: boolean;
  lastEventIdParam?: string;
  injector?: Injector;
}
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `event` | `string \| readonly string[]` | `'message'` | Server event name or names to listen to. `'message'` means events without an `event:` field. `'open'` and `'error'` are rejected. |
| `parse` | `(data: string, event: MessageEvent<string>) => T` | `JSON.parse` | Turns `event.data` into the value. If it throws, `error()` gets what it threw, `value()` keeps the previous value and the stream stays open. |
| `until` | `(value: T, event: MessageEvent<string>) => boolean` | none | Called after a value is set. Returning `true` closes the stream and sets status `closed`. |
| `reconnect` | `SseBackoff \| 'browser' \| false` | `{}` | An object enables backoff reconnects with the settings below. `'browser'` leaves reconnects to `EventSource`. `false` never reconnects. |
| `withCredentials` | `boolean` | `false` | Passed to every `EventSource` the resource creates. |
| `lastEventIdParam` | `string` | none | On a backoff reconnect, append the last received event id to the URL under this query parameter name. |
| `injector` | `Injector` | current injection context | Injector used for the effect, for `SSE_EVENT_SOURCE` and `PLATFORM_ID`, and for `DestroyRef` cleanup. |

## SseBackoff

```ts
interface SseBackoff {
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  maxAttempts?: number;
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `initialDelayMs` | `number` | `500` | Delay before the first reconnect. |
| `maxDelayMs` | `number` | `10000` | Upper bound for any delay. |
| `factor` | `number` | `2` | Each failed attempt multiplies the delay by this. |
| `maxAttempts` | `number` | `Infinity` | Reconnect attempts in a row before giving up with status `error`. |

The delay before attempt `n`, counting from 0, is `Math.min(maxDelayMs, initialDelayMs * factor ** n)`. A successful `open` resets `n` to 0. These fields are ignored when `reconnect` is `'browser'` or `false`. See [Reconnection and backoff](/libs/ngx-sse-resource/guides/reconnection/).

## SseResource

```ts
interface SseResource<T> {
  readonly value: Signal<T | undefined>;
  readonly status: Signal<SseStatus>;
  readonly error: Signal<unknown>;
  readonly lastEventId: Signal<string | undefined>;
  close(): void;
}
```

| Member | Type | Meaning |
| --- | --- | --- |
| `value` | `Signal<T \| undefined>` | The last parsed value. `undefined` until the first event. Reset when the URL changes. Kept on connection errors and parse errors. |
| `status` | `Signal<SseStatus>` | Connection state. See the table below. |
| `error` | `Signal<unknown>` | The last error: what `parse` threw, or an `SseConnectionError`. Cleared by the next value, the next `open`, or a URL change. |
| `lastEventId` | `Signal<string \| undefined>` | The `id:` of the last event that had one. Reset when the URL changes. |
| `close()` | `() => void` | Closes the connection and cancels any pending reconnect. Sets status `closed` unless the status is `idle`. A later URL change opens a new connection. |

All four signals are read-only.

## SseStatus

```ts
type SseStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
```

| Status | When |
| --- | --- |
| `idle` | The URL is `null` or `undefined`, the code runs on the server, or there is no `EventSource` constructor. |
| `connecting` | First connection attempt for the current URL. |
| `open` | The `EventSource` fired `open`. |
| `reconnecting` | The connection failed and a reconnect is pending or in progress (backoff or browser). |
| `closed` | `close()` was called, `until` returned `true`, or the owning injector was destroyed. |
| `error` | The connection failed and no reconnect follows: `reconnect` is `false`, `maxAttempts` was reached, or the browser gave up in `'browser'` mode. |

## SseConnectionError

```ts
class SseConnectionError extends Error {
  constructor(
    readonly url: string,
    readonly event: Event,
  );
}
```

Put in `error()` when the connection fails. `url` is the URL returned by your `url` function (without the `lastEventIdParam` query parameter). `event` is the raw `error` event from `EventSource`. `name` is `'SseConnectionError'` and `message` is `SSE connection to <url> failed`. `EventSource` gives no HTTP status or other detail.

## SSE_EVENT_SOURCE

```ts
const SSE_EVENT_SOURCE: InjectionToken<EventSourceConstructor | undefined>;
```

The constructor `sseResource` uses to open connections. Provided in root. The default factory returns the global `EventSource`, or `undefined` where it does not exist (Node, SSR). Provide a fake in tests or a polyfill in apps. The library calls it as `new Ctor(url, { withCredentials })` and uses `addEventListener`, `close()` and `readyState` on the result.

## EventSourceConstructor

```ts
type EventSourceConstructor = new (url: string, init?: EventSourceInit) => EventSource;
```

Anything that can be constructed like the browser `EventSource`. This is the value type of `SSE_EVENT_SOURCE`.
