---
title: Named events, parsing and until
description: Listen to named server events, turn data into typed values, and close the stream on a final event.
---

## Unnamed and named events

An SSE message without an `event:` field is dispatched as `message`. That is the default for the `event` option, so a plain stream needs no setup:

```ts
readonly ticks = sseResource<Tick>(() => '/api/ticks');
```

Set `event` to listen to one named event, or to an array of names:

```ts
readonly progress = sseResource<number>(() => '/api/import/events', { event: 'progress' });

readonly job = sseResource<JobEvent>(() => '/api/jobs/42/events', {
  event: ['progress', 'done'],
});
```

The resource listens only to the names you list. With `event: 'progress'`, unnamed `message` events are ignored. To receive both, list `'message'` in the array.

`open` and `error` are `EventSource`'s own events. Passing either as an event name makes `sseResource()` throw:

```text
sseResource: "error" is an EventSource event, not a server event name
```

Pick different names on the server.

## The parse function

`parse` turns the `data` string of each event into the value stored in `value()`. The default is `JSON.parse`. Its signature is:

```ts
parse?: (data: string, event: MessageEvent<string>) => T;
```

For plain text, return the string as is:

```ts
readonly log = sseResource<string>(() => '/api/logs', { parse: (data) => data });
```

The second argument is the `MessageEvent`. With several event names, `event.type` tells you which one arrived:

```ts
type JobEvent =
  | { type: 'progress'; percent: number }
  | { type: 'done'; downloadUrl: string };

readonly job = sseResource<JobEvent>(() => '/api/jobs/42/events', {
  event: ['progress', 'done'],
  parse: (data, event) => ({ type: event.type, ...JSON.parse(data) }),
});
```

## Validate payloads

If `parse` throws, the resource:

- puts the thrown value in `error()`,
- keeps the previous `value()`,
- leaves the connection open and the status unchanged.

The next event that parses clears `error()`. This makes `parse` a place to validate data. Throw on anything you do not accept:

```ts
type Price = { symbol: string; amount: number };

function parsePrice(data: string): Price {
  const raw = JSON.parse(data);
  if (typeof raw?.symbol !== 'string' || typeof raw?.amount !== 'number') {
    throw new TypeError(`Invalid price payload: ${data}`);
  }
  return { symbol: raw.symbol, amount: raw.amount };
}

readonly price = sseResource<Price>(() => '/api/prices', { parse: parsePrice });
```

With the default `JSON.parse`, a payload that is not valid JSON puts a `SyntaxError` in `error()`.

`lastEventId()` is updated before `parse` runs, so it reflects the event id even when parsing fails.

## Close on a final event with until

`until` runs after each value is set. Return `true` to close the stream:

```ts
readonly job = sseResource<JobEvent>(() => '/api/jobs/42/events', {
  event: ['progress', 'done'],
  parse: (data, event) => ({ type: event.type, ...JSON.parse(data) }),
  until: (value) => value.type === 'done',
});
```

When `until` returns `true`, the resource closes the `EventSource` and sets status `closed`. The last value stays in `value()`. No reconnect follows.

This matters for one-shot jobs. When a server ends the response after its last event, `EventSource` sees a dropped connection and the resource would reconnect. If a new connection starts the job again, close with `until` or use `reconnect: false`. See [Reconnection and backoff](/libs/ngx-sse-resource/guides/reconnection/).

`until` is not called for events whose `parse` threw.

## Keeping a history

`value()` holds only the last event. To keep earlier events, collect them yourself. `parse` runs once for every event, so it can append to a list:

```ts
readonly lines = signal<string[]>([]);

readonly log = sseResource<string>(() => '/api/logs', {
  parse: (data) => {
    this.lines.update((lines) => [...lines, data]);
    return data;
  },
});
```

An `effect` that reads `value()` also works for slow streams, but it runs at most once per change detection pass, so it can miss values when several events arrive between runs.
