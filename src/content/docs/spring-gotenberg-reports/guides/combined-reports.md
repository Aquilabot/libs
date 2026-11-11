---
title: Combined reports as background jobs
description: Render many sections in parallel on virtual threads, merge them into one PDF, stream progress over Server-Sent Events and cancel cleanly.
---

A combined report is one `PortfolioSummary` followed by one `Statement` per account, merged into a single PDF. `CombinedReportService` runs it as a background job and reports progress as `JobEvent` values. `CombinedReportController` turns those events into Server-Sent Events.

## What a job does

1. `CombinedReportService.start(accounts, concurrency, listener)` validates the arguments, creates a `ReportJob` with a random UUID, emits `Queued`, schedules the timeout, and submits the job to a virtual-thread executor. It returns at once.
2. The job asks `ResultStore` for a work directory, `work-<jobId>`, under a temporary directory created at startup.
3. Each section (summary first, then statements 1 to N) gets its own virtual thread. A `Semaphore` with `concurrency` permits limits how many are rendering and talking to Gotenberg at the same time. Each section is rendered with `ReportRenderer`, converted with `PdfEngine.convertHtml`, and saved as `00000.pdf`, `00001.pdf` and so on.
4. A `Rendering` event is emitted each time a section finishes, in completion order.
5. When all sections are done, the job emits `Merging` and calls `PdfEngine.merge` with the files in their original order. `GotenbergClient.merge` names the uploads `00000.pdf`, `00001.pdf` and so on, because Gotenberg merges in alphanumeric file name order.
6. The merged file is moved to `<jobId>.pdf` in the result directory, the work directory is deleted, the `reports.combined` timer is recorded, and the final `Done` or `Failed` event is emitted last.

`CombinedReportServiceTest` checks the ordering (`reportsProgressAndMergesSectionsInOriginalOrder`), that the number of concurrent conversions never exceeds the limit (`neverExceedsTheConcurrencyLimit`), and that the work directory is gone after the job.

## Parameters and limits

| Argument | Rule | Error |
|---|---|---|
| `accounts` | 1 to `reports.combined.max-sections` (200) | `IllegalArgumentException("accounts must be between 1 and 200")` |
| `concurrency` | 1 to `reports.combined.max-concurrency` (8) | `IllegalArgumentException("concurrency must be between 1 and 8")` |

The job has `accounts + 1` sections. Over HTTP, `accounts` defaults to 12 and `concurrency` defaults to `reports.combined.concurrency` (4).

## Events

`JobEvent` is a sealed interface. Each record's `name()` becomes the SSE `event:` field and the record is serialized as JSON in the `data:` field.

| Record | `name()` | Fields | Sent when |
|---|---|---|---|
| `Queued` | `queued` | `jobId`, `sections` | The job was accepted. `sections` is `accounts + 1`. |
| `Rendering` | `rendering` | `completed`, `total`, `section` | A section finished. `section` is its `title()`. |
| `Merging` | `merging` | `sections` | All sections are done and Gotenberg is merging. |
| `Done` | `done` | `downloadUrl`, `bytes`, `elapsedMillis` | Final. The PDF is ready at `downloadUrl`. |
| `Failed` | `failed` | `reason` | Final. No PDF. |

`terminal()` returns `true` for `Done` and `Failed`. The failure event is named `failed`, not `error`, because the browser's `EventSource` already fires `error` for connection problems.

## Consume the stream in a browser

The demo page at `/` (`templates/index.html`) does this:

```html title="index.html"
<script>
  const source = new EventSource('/api/combined-reports/stream?accounts=12&concurrency=4');
  source.addEventListener('queued', e => console.log('job', JSON.parse(e.data).jobId));
  source.addEventListener('rendering', e => {
    const data = JSON.parse(e.data);
    console.log(`${data.completed}/${data.total} ${data.section}`);
  });
  source.addEventListener('done', e => {
    window.location = JSON.parse(e.data).downloadUrl;
    source.close();
  });
  source.addEventListener('failed', e => {
    console.error(JSON.parse(e.data).reason);
    source.close();
  });
  // Without this, EventSource reconnects on error and starts a second job.
  source.onerror = () => source.close();
</script>
```

This is a condensed version of the page's script, which also drives a progress bar and a cancel button.

:::caution
Always close the `EventSource` in `onerror`. Otherwise the browser reconnects on its own, which sends a new `GET` to the stream endpoint and starts a second job.
:::

## Cancellation

A job stops early in three cases. Each one calls `ReportJob.cancel(reason)`, which interrupts the job's threads. Because `GotenbergClient` uses the JDK `HttpClient`, an interrupted thread aborts its blocked HTTP call, so in-flight conversions stop too.

| Cause | Reason in the `failed` event | `reports.combined` outcome |
|---|---|---|
| The client disconnected | `client disconnected` (not delivered, the client is gone) | `cancelled` |
| `reports.combined.timeout` expired | `timed out after 120.0 s` with the default 2 minutes | `cancelled` |
| A section or the merge failed | The exception message, for example the Gotenberg error | `failed` |

The servlet container only notices a gone client when a write fails. `CombinedReportController` therefore sends an SSE comment `:keep-alive` every `reports.combined.heartbeat` (5 seconds). A failed write cancels the job. A listener that throws while receiving an event has the same effect. `ReportsApplicationIT.closingTheStreamCancelsTheJob` closes a raw socket after the `queued` event and waits for the `reports.combined` timer with `outcome=cancelled`.

`cancel` is idempotent, the first reason wins, and it has no effect once the job has finished. `CombinedReportServiceTest.timeoutCancelsInFlightConversions` uses a 300 ms timeout and checks that the final event is `Failed("timed out after 0.3 s")` and that both in-flight conversions were interrupted.

The `SseEmitter` itself times out at `reports.combined.timeout` plus 30 seconds.

## Download and retention

`GET /api/combined-reports/{jobId}/pdf` serves `<jobId>.pdf` from the result directory as an attachment named `combined-report-2026-09.pdf` (the file name uses `SampleData.PERIOD`). An unknown id, an id that is not a UUID, or an expired file returns 404.

`ResultStore.deleteExpired()` runs every `reports.combined.cleanup-interval` (1 minute by default) and deletes result PDFs whose last-modified time is older than `reports.combined.retention` (15 minutes). A file can therefore stay downloadable slightly longer than the retention.

## Using the service from Java

The service does not depend on the web layer. You can start a job from any code and pass a listener:

```java
ReportJob job = combinedReportService.start(24, 6, event -> {
    if (event instanceof JobEvent.Done done) {
        log.info("Ready: {} ({} bytes)", done.downloadUrl(), done.bytes());
    } else if (event instanceof JobEvent.Failed failed) {
        log.warn("Failed: {}", failed.reason());
    }
});
// later, from any thread
job.cancel("no longer needed");
```

The listener is called from job threads, one event at a time. If it throws a `RuntimeException`, the job is cancelled with the reason `client disconnected` and no further events are delivered.

## Adapting it to your own reports

The section list is built in `Run.renderSections` from `SampleData.summary(accounts)`. To combine other reports, change that method to build your own `List<Report>`. The rest (semaphore, ordering, merge, cleanup, events) does not depend on the report types.

For more than one application instance, note that results live on local disk and job handles in memory. The README suggests sticky sessions or shared storage such as S3 plus a shared job registry; none of this is implemented.

## Performance

The README reports that parallelism pays off up to about 4 concurrent sections and flattens at 6, which is Gotenberg's default Chromium concurrency. See [Run the benchmark](/libs/spring-gotenberg-reports/guides/benchmark/) for the figures and their conditions.
