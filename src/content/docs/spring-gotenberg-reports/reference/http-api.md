---
title: HTTP API
description: Every HTTP endpoint the application serves, with parameters, responses and status codes.
---

All endpoints are `GET`. There is no authentication. Errors use RFC 9457 problem details (`application/problem+json`), described under [Errors](#errors).

| Method and path | Result |
|---|---|
| `GET /api/reports/{type}/{id}` | One PDF, streamed from Gotenberg |
| `GET /preview/{type}/{id}` | The HTML that Gotenberg would print |
| `GET /api/combined-reports/stream` | Starts a combined report and streams progress as Server-Sent Events |
| `GET /api/combined-reports/{jobId}/pdf` | Downloads a finished combined report |
| `GET /` | Demo page that starts a combined report and shows its progress |
| `GET /report-assets/**` | Static report assets (`report.css`, fonts) for the preview |
| `GET /actuator/health` | Health, including Gotenberg |
| `GET /actuator/metrics/{name}` | Micrometer metrics |

## Single report PDF

```http
GET /api/reports/{type}/{id}?download=false
```

Handled by `ReportController.pdf`.

### Parameters

| Name | In | Type | Default | Rules |
|---|---|---|---|---|
| `type` | path | string | | `invoice`, `statement` or `portfolio-summary` |
| `id` | path | int | | 1 to 9999. For `portfolio-summary` it is the number of accounts, capped at 200. |
| `download` | query | boolean | `false` | `true` sends `Content-Disposition: attachment` instead of `inline` |

### Response

`200 OK` with the PDF body streamed from Gotenberg.

| Header | Value |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `inline` or `attachment`, with `filename` from `Report.filename()`, for example `invoice-INV-2026-0007.pdf` |
| `Cache-Control` | `no-store` |
| `Content-Length` | Copied from Gotenberg's response when it sends one |

### Status codes

| Status | When |
|---|---|
| 200 | PDF generated |
| 400 | `id` outside 1 to 9999 (`id must be between 1 and 9999`), or not an integer |
| 404 | Unknown `type` (`Unknown report type: <type>`) |
| 502 | Gotenberg answered with an error status, after retries for 429 and 5xx |
| 503 | Gotenberg could not be reached or did not answer in time, after retries |

`ReportsApplicationIT.unknownReportTypeIsNotFound` checks that `/api/reports/payslip/1` returns 404 and `/api/reports/invoice/0` returns 400.

### Example

```bash
curl -OJ "http://localhost:8080/api/reports/invoice/7?download=true"
```

## HTML preview

```http
GET /preview/{type}/{id}
```

Handled by `ReportController.preview`. Same `type` and `id` rules and the same 400 and 404 errors as the PDF endpoint. Gotenberg is not called.

Returns `200 OK`, `Content-Type: text/html`, the main page rendered by `ReportRenderer.html(report, "/report-assets/")`. The page contains `<base href="/report-assets/">`, so the browser loads `report.css` and the fonts from `GET /report-assets/**`. The running header and footer are not included.

## Start a combined report

```http
GET /api/combined-reports/stream?accounts=12&concurrency=4
Accept: text/event-stream
```

Handled by `CombinedReportController.stream`. Starts a job that renders one portfolio summary plus one statement per account and merges them into one PDF.

### Parameters

| Name | In | Type | Default | Rules |
|---|---|---|---|---|
| `accounts` | query | int | `12` | 1 to `reports.combined.max-sections` (200) |
| `concurrency` | query | int | `reports.combined.concurrency` (4) | 1 to `reports.combined.max-concurrency` (8) |

A value outside these ranges raises `IllegalArgumentException` before the stream starts (`accounts must be between 1 and 200`, `concurrency must be between 1 and 8`), which `ErrorHandling` maps to 400.

### Response

`200 OK`, `Content-Type: text/event-stream`. Each event has an `event:` name and a JSON `data:` line:

```text
event:queued
data:{"jobId":"5cf54cb3-...","sections":5}

event:rendering
data:{"completed":1,"total":5,"section":"Account statement XX00 DEMO 0000 0002"}

event:merging
data:{"sections":5}

event:done
data:{"downloadUrl":"/api/combined-reports/5cf54cb3-.../pdf","bytes":322041,"elapsedMillis":595}
```

| Event | When | Data |
|---|---|---|
| `queued` | Job accepted | `jobId` (UUID), `sections` (accounts + 1) |
| `rendering` | A section finished, in completion order, once per section | `completed`, `total`, `section` (the section title) |
| `merging` | All sections done, Gotenberg is merging | `sections` |
| `done` | Final. The PDF is ready | `downloadUrl`, `bytes`, `elapsedMillis` |
| `failed` | Final. No PDF | `reason`, for example `timed out after 120.0 s` or the Gotenberg error message |

The server completes the stream after `done` or `failed`. Between events it sends an SSE comment, `:keep-alive`, every `reports.combined.heartbeat` (5 seconds).

`ReportsApplicationIT.combinedReportStreamsProgressAndMergesInOrder` requests `accounts=4&concurrency=2` and checks the exact event sequence: `queued`, five `rendering`, `merging`, `done`.

### Cancellation

Closing the connection cancels the job. The server notices when a keep-alive or event write fails, then interrupts the job's threads, which aborts in-flight Gotenberg calls, and deletes its temporary files. The job is also cancelled when `reports.combined.timeout` (2 minutes) expires, with a `failed` event whose reason is `timed out after 120.0 s`. A failing section ends the job with a `failed` event carrying the error message.

## Download a combined report

```http
GET /api/combined-reports/{jobId}/pdf
```

Handled by `CombinedReportController.download`.

| Status | When |
|---|---|
| 200 | `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="combined-report-2026-09.pdf"` |
| 404 | No finished report for that id: unknown, not a UUID, still running, or deleted after `reports.combined.retention` (15 minutes) |

## Actuator

Only `health` and `metrics` are exposed over HTTP.

| Path | Notes |
|---|---|
| `GET /actuator/health` | Always shows details. Includes a `gotenberg` component that calls Gotenberg's `/health` and reports its `url`. |
| `GET /actuator/metrics/gotenberg.requests` | Timer per Gotenberg call. Tags `operation` (`convert-html`, `merge`) and `outcome` (`success`, `client_error`, `server_error`, `io_error`, `cancelled`). |
| `GET /actuator/metrics/reports.combined` | Timer per combined job. Tag `outcome` (`success`, `failed`, `cancelled`). |

Filter by tag with `?tag=name:value`, for example `/actuator/metrics/reports.combined?tag=outcome:cancelled`.

## Errors

Errors are problem detail objects. Spring adds the standard `type`, `title`, `status`, `detail` and `instance` members.

| Status | Source | `title` | `detail` | Extra members |
|---|---|---|---|---|
| 400 | `IllegalArgumentException` | Spring default for 400 | The exception message | |
| 404 | `ResponseStatusException` | Spring default for 404 | For example `Unknown report type: payslip` | |
| 502 | `GotenbergException`, Gotenberg returned an error | `PDF rendering failed` | `The PDF service could not render the document.` | `gotenbergStatus`: Gotenberg's HTTP status |
| 503 | `GotenbergException`, no response | `PDF rendering failed` | `The PDF service is not reachable.` | `gotenbergStatus`: `0` |

Gotenberg's own error text is logged, not returned to the client.
