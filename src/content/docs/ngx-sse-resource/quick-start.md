---
title: Quick start
description: Show a live Server-Sent Events stream in a component, then run the repository's demo.
---

## A component with a live stream

This component follows a long-running job. The server sends `progress` events with a percentage and a final `done` event. The stream starts when `jobId` gets a value and closes on its own after `done`.

```ts title="job.component.ts"
import { Component, computed, signal } from '@angular/core';
import { sseResource } from 'ngx-sse-resource';

type JobEvent =
  | { type: 'progress'; percent: number }
  | { type: 'done'; elapsedMs: number };

@Component({
  selector: 'app-job',
  template: `
    <button type="button" (click)="start()">Start job</button>
    <progress max="100" [value]="percent()"></progress>
    <p>Status: {{ job.status() }}</p>
  `,
})
export class JobComponent {
  private readonly jobId = signal<number | null>(null);

  protected readonly job = sseResource<JobEvent>(
    () => {
      const id = this.jobId();
      return id === null ? null : `/api/jobs/${id}/events`;
    },
    {
      event: ['progress', 'done'],
      parse: (data, event) => ({ type: event.type, ...JSON.parse(data) }),
      until: (value) => value.type === 'done',
    },
  );

  protected readonly percent = computed(() => {
    const value = this.job.value();
    return value?.type === 'done' ? 100 : (value?.percent ?? 0);
  });

  protected start(): void {
    this.jobId.set(Date.now());
  }
}
```

What each part does:

- The URL function returns `null` until `start()` runs, so the resource stays in status `idle` and opens nothing.
- `event: ['progress', 'done']` listens to those two server event names instead of the default unnamed `message` events.
- `parse` receives the raw `data` string and the `MessageEvent`. Here it adds the event name as `type` so the template code can tell the two shapes apart.
- `until` returns `true` for the `done` value. The resource sets that value, closes the connection and moves to status `closed`, so the browser does not reconnect and restart the job.
- When the component is destroyed, the connection and any pending reconnect timer are cleaned up.

`sseResource()` must be called in an injection context, such as a field initializer or a constructor. Elsewhere, pass `{ injector }` in the options.

For the simplest case, an endpoint that sends unnamed JSON events, one line is enough:

```ts
readonly price = sseResource<Price>(() => '/api/prices');
```

## Run the demo

The repository has a demo app (`projects/demo`) and a Node server with no dependencies (`demo/server.mjs`). The server serves the built demo and an SSE endpoint at `/api/jobs/:id/events`.

```bash
git clone https://github.com/Aquilabot/ngx-sse-resource
cd ngx-sse-resource
npm install
npm run demo
```

`npm run demo` builds the library, builds the demo app, then starts `node demo/server.mjs`. Open `http://localhost:4300`. Set the `PORT` environment variable to use another port.

Click "Start job". The server sends ten `progress` events, one every 400 ms, each with an `id:`, then a `done` event with the elapsed time. On the first connection for a job it drops the connection right after the event with id 5 (50%). The demo component uses these options:

```ts
{
  event: ['progress', 'done'],
  parse: (data, event) => ({ type: event.type, ...JSON.parse(data) }),
  until: (value) => value.type === 'done',
  lastEventIdParam: 'lastEventId',
  reconnect: { initialDelayMs: 500, maxDelayMs: 5_000 },
}
```

So after the drop the status shows `reconnecting`, the resource waits 500 ms, and opens `/api/jobs/<id>/events?lastEventId=5`. The server reads that query parameter (or a `Last-Event-ID` header) and continues from step 6. The page also shows the `lastEventId()` signal as it changes.

## Next steps

- [Reactive URLs from signals](/libs/ngx-sse-resource/guides/reactive-urls/)
- [Named events, parsing and until](/libs/ngx-sse-resource/guides/events-and-parsing/)
- [Reconnection and backoff](/libs/ngx-sse-resource/guides/reconnection/)
