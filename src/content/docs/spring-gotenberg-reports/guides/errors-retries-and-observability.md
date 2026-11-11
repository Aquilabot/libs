---
title: Errors, retries and observability
description: Which Gotenberg failures are retried, how failures map to HTTP problem responses, and the health check, metrics and logs that show what happened.
---

## GotenbergException

Every failed Gotenberg call ends as a `GotenbergException`. Its `status()` is the HTTP status Gotenberg answered with, or `0` when no response arrived (connection refused, timeout). Error bodies from Gotenberg are kept in the message, read up to 2048 bytes:

```text
Gotenberg answered 400 on /forms/chromium/convert/html: Invalid form data: form file 'index.html' is required
```

Transport failures produce `Gotenberg unreachable on <path>: <cause>`.

## What is retried

`GotenbergException.isRetryable()` decides:

```java title="GotenbergException.java"
public boolean isRetryable() {
    return status == 0 || status == 429 || status >= 500;
}
```

| Failure | Retried |
|---|---|
| No response: connection refused, connect or read timeout (`status == 0`) | Yes |
| 429 | Yes |
| 5xx | Yes |
| Other 4xx | No |

The class comment gives the reasoning. A 4xx means the request itself is wrong (a bad HTML form, a missing `index.html`), so sending it again will not help. Gotenberg answers 503 when its own timeout fires or Chromium is restarting, which is worth another attempt.

A call is also not retried when the current thread is interrupted, so a cancelled job does not keep retrying.

`GotenbergClient` uses Spring Framework 7's `RetryTemplate` with exponential backoff, configured from `gotenberg.retry.*`. With the defaults (`max-retries: 2`, `initial-delay: 300ms`, `multiplier: 2.0`, `max-delay: 3s`) a call is tried at most three times. Each retry is logged at WARN as `Retrying Gotenberg call` with the `operation`, `attempt` and `error` key-value pairs.

The tests in `GotenbergClientTest` run the client against an in-process HTTP server:

| Test | Behaviour |
|---|---|
| `retriesServerErrorsWithBackoff` | Two 503 answers, then success: three requests, two timer samples with `outcome=server_error` |
| `doesNotRetryClientErrorsAndKeepsGotenbergMessage` | A 400 is sent once and its body appears in the exception message |
| `givesUpAfterMaxRetriesOnTimeouts` | Three read timeouts end in a `GotenbergException` with `status() == 0` |

## HTTP problem responses

`ErrorHandling` is a `@RestControllerAdvice` that maps exceptions to RFC 9457 problem details. `spring.mvc.problemdetails.enabled: true` makes Spring use the same format for its own errors.

| Exception | Status | `detail` |
|---|---|---|
| `GotenbergException` with `status() == 0` | 503 Service Unavailable | `The PDF service is not reachable.` |
| `GotenbergException` with any other status | 502 Bad Gateway | `The PDF service could not render the document.` |
| `IllegalArgumentException` | 400 Bad Request | The exception message, for example `id must be between 1 and 9999` |
| `ResponseStatusException(NOT_FOUND)` | 404 Not Found | For example `Unknown report type: payslip` |

Gotenberg problems carry the `title` `PDF rendering failed` and an extra property `gotenbergStatus` with Gotenberg's status code (or `0`). The Gotenberg error text itself is not sent to the client; it is logged at WARN with a `gotenbergStatus` key-value pair.

`ReportController` calls Gotenberg before it returns the response, so a failed conversion reaches `ErrorHandling` before any PDF bytes are written. For combined reports, failures during the job do not become HTTP errors; they arrive as a `failed` event. See [Combined reports](/libs/spring-gotenberg-reports/guides/combined-reports/).

## Health

`GotenbergConfiguration` registers a `HealthIndicator` bean named `gotenbergHealthIndicator`. It calls Gotenberg's `GET /health` and reports `UP` or `DOWN` with a `url` detail. With `management.endpoint.health.show-details: always`, `GET /actuator/health` shows it as the `gotenberg` component. `ReportsApplicationIT.healthIncludesGotenberg` checks that it is `UP` against a real container.

## Metrics

| Timer | Tags | Measures |
|---|---|---|
| `gotenberg.requests` | `operation` (`convert-html`, `merge`), `outcome` (`success`, `client_error`, `server_error`, `io_error`, `cancelled`) | Each attempt, until the response headers arrive. Gotenberg answers only once the PDF is done, so this is the conversion time. Percentiles 0.5 and 0.95 are published. |
| `reports.combined` | `outcome` (`success`, `failed`, `cancelled`) | Whole combined-report jobs, end to end |

Spring's own `http.client.requests` and `http.server.requests` metrics are also available. The actuator exposes `health` and `metrics` over HTTP:

```bash
curl "http://localhost:8080/actuator/metrics/gotenberg.requests?tag=operation:convert-html&tag=outcome:success"
curl "http://localhost:8080/actuator/metrics/reports.combined?tag=outcome:cancelled"
```

## Logs

Set `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs` to get one JSON object per line. `docker-compose.yml` sets it for the `app` service. Job logs carry `jobId` from the MDC, and the code adds key-value pairs through SLF4J's fluent API:

| Message | Level | Key-value pairs |
|---|---|---|
| `Combined report started` | INFO | `accounts`, `concurrency` |
| `Section rendered` | DEBUG | `section`, `elapsedMs` |
| `Combined report finished` | INFO | `outcome`, `elapsedMs`, `reason` |
| `Combined report failed` | ERROR | Exception attached |
| `Listener gone, cancelling job` | INFO | `event` |
| `Retrying Gotenberg call` | WARN | `operation`, `attempt`, `error` |
