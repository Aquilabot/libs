---
title: Testing with a fake EventSource
description: Replace EventSource through the SSE_EVENT_SOURCE token and drive the stream from your tests.
---

`sseResource()` gets its constructor from the `SSE_EVENT_SOURCE` token instead of the global `EventSource`. In tests you provide a fake class and control every event yourself. The library's own spec (`projects/ngx-sse-resource/src/lib/sse-resource.spec.ts`) works this way, with Vitest and Angular's `TestBed`.

## A fake EventSource

The fake needs `addEventListener`, `close()` and `readyState`. Extending `EventTarget` gives you `addEventListener` and `dispatchEvent`. This is the fake from the library's spec:

```ts title="fake-event-source.ts"
export class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  static get last(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }

  readyState = 0;
  readonly withCredentials: boolean;

  constructor(
    readonly url: string,
    init?: EventSourceInit,
  ) {
    super();
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  get closed(): boolean {
    return this.readyState === 2;
  }

  close(): void {
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  emit(data: string, type = 'message', id = ''): void {
    this.dispatchEvent(new MessageEvent(type, { data, lastEventId: id }));
  }

  /** readyState after the error: 0 means the browser reconnects, 2 means it gave up. */
  fail(readyState = 2): void {
    this.readyState = readyState;
    this.dispatchEvent(new Event('error'));
  }
}
```

`instances` records every connection the resource opens, so a test can count reconnects and inspect the URL of each one.

## Provide it and create a resource

```ts title="prices.spec.ts"
import { TestBed } from '@angular/core/testing';
import { SSE_EVENT_SOURCE, sseResource } from 'ngx-sse-resource';
import { FakeEventSource } from './fake-event-source';

beforeEach(() => {
  FakeEventSource.instances = [];
  TestBed.configureTestingModule({
    providers: [{ provide: SSE_EVENT_SOURCE, useValue: FakeEventSource }],
  });
});

it('shows the latest price', () => {
  const prices = TestBed.runInInjectionContext(() =>
    sseResource<{ amount: number }>(() => '/api/prices'),
  );
  TestBed.tick();

  expect(FakeEventSource.last.url).toBe('/api/prices');
  expect(prices.status()).toBe('connecting');

  FakeEventSource.last.open();
  expect(prices.status()).toBe('open');

  FakeEventSource.last.emit('{"amount":10}', 'message', '1');
  expect(prices.value()).toEqual({ amount: 10 });
  expect(prices.lastEventId()).toBe('1');
});
```

`TestBed.tick()` runs the effect that opens the connection. Call it again after you change a signal that the URL function reads.

## Test reconnects with fake timers

The backoff uses `setTimeout`, so fake timers make the delays deterministic. With Vitest, using the global `vi` as the repository's spec does (its tsconfig includes `vitest/globals`):

```ts title="reconnect.spec.ts"
afterEach(() => {
  vi.useRealTimers();
});

it('reconnects after the initial delay', () => {
  vi.useFakeTimers();
  const res = TestBed.runInInjectionContext(() =>
    sseResource(() => '/events', { reconnect: { initialDelayMs: 100 } }),
  );
  TestBed.tick();

  FakeEventSource.last.fail();
  expect(res.status()).toBe('reconnecting');

  vi.advanceTimersByTime(99);
  expect(FakeEventSource.instances.length).toBe(1);
  vi.advanceTimersByTime(1);
  expect(FakeEventSource.instances.length).toBe(2);
});
```

To test `reconnect: 'browser'`, call `fail(0)`. The `readyState` stays `CONNECTING`, so the resource waits for the browser. Call `fail(2)` to simulate the browser giving up.

## Test server rendering

Provide `PLATFORM_ID` as `'server'`, or provide `SSE_EVENT_SOURCE` as `undefined`. In both cases the resource stays `idle` and the fake records no instances:

```ts
TestBed.configureTestingModule({
  providers: [
    { provide: SSE_EVENT_SOURCE, useValue: FakeEventSource },
    { provide: PLATFORM_ID, useValue: 'server' },
  ],
});
```

## Test cleanup

Create the resource with an explicit `injector` from `createEnvironmentInjector`, then destroy that injector. The spec checks that the fake is closed, the status is `closed`, and that a pending reconnect timer never fires afterwards.

```ts
import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';

const child = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
const res = sseResource(() => '/events', { injector: child });
TestBed.tick();

child.destroy();
expect(FakeEventSource.last.closed).toBe(true);
expect(res.status()).toBe('closed');
```
