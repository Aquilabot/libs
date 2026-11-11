---
title: Configuration
description: Every configuration property the application reads, with type, default and meaning.
---

Properties are bound by two `@ConfigurationProperties` records, `GotenbergProperties` (prefix `gotenberg`) and `JobProperties` (prefix `reports.combined`). Defaults come from `@DefaultValue` annotations on the records and are repeated in `src/main/resources/application.yml`. `ReportsApplication` enables `@ConfigurationPropertiesScan`.

Durations use Spring Boot's format (`300ms`, `2s`, `15m`). Any property can also be set as an environment variable with Spring Boot's relaxed binding, for example `GOTENBERG_URL` for `gotenberg.url`, which is how `docker-compose.yml` sets it.

## Gotenberg client

Prefix `gotenberg`, bound to `GotenbergProperties`.

| Property | Type | Default | Meaning |
|---|---|---|---|
| `gotenberg.url` | `URI` | `http://localhost:3000` | Base URL of the Gotenberg service. Used by the client and the health indicator. |
| `gotenberg.connect-timeout` | `Duration` | `2s` | TCP connect timeout of the JDK `HttpClient`. |
| `gotenberg.read-timeout` | `Duration` | `35s` | Time allowed until response headers arrive. Gotenberg answers only once the PDF is ready, so keep this above Gotenberg's `--api-timeout` (30s by default). |
| `gotenberg.retry.max-retries` | `int` | `2` | Attempts after the first one. |
| `gotenberg.retry.initial-delay` | `Duration` | `300ms` | Delay before the first retry. |
| `gotenberg.retry.multiplier` | `double` | `2.0` | Growth factor of the delay between retries. |
| `gotenberg.retry.max-delay` | `Duration` | `3s` | Upper bound for a single delay. |

Only retryable failures are retried: no response, 429 and 5xx. See [Errors, retries and observability](/libs/spring-gotenberg-reports/guides/errors-retries-and-observability/).

## Combined reports

Prefix `reports.combined`, bound to `JobProperties`.

| Property | Type | Default | Meaning |
|---|---|---|---|
| `reports.combined.concurrency` | `int` | `4` | Number of sections converted at the same time when the request does not pass `concurrency`. |
| `reports.combined.max-concurrency` | `int` | `8` | Highest `concurrency` a client may ask for. |
| `reports.combined.max-sections` | `int` | `200` | Highest number of accounts in one job. A job has one more section than accounts, for the summary. |
| `reports.combined.timeout` | `Duration` | `2m` | A job still running after this is cancelled. The `SseEmitter` timeout is this value plus 30 seconds. |
| `reports.combined.heartbeat` | `Duration` | `5s` | Interval of the SSE `keep-alive` comment. A failed write means the client left and cancels the job. |
| `reports.combined.retention` | `Duration` | `15m` | How long a finished PDF stays downloadable, measured from its last-modified time. |
| `reports.combined.cleanup-interval` | `Duration` | `1m` | Fixed delay between runs of `ResultStore.deleteExpired()`. Not part of `JobProperties`; read through a placeholder in `@Scheduled` and absent from `application.yml`. |

`max-sections` limits the `accounts` parameter, not the section count: 200 accounts give 201 sections.

## Spring Boot settings in application.yml

| Property | Value | Effect |
|---|---|---|
| `spring.application.name` | `spring-gotenberg-reports` | Application name |
| `spring.threads.virtual.enabled` | `true` | Request handling and scheduling run on virtual threads |
| `spring.mvc.problemdetails.enabled` | `true` | Spring MVC errors are RFC 9457 problem details |
| `spring.thymeleaf.cache` | `true` | Templates are cached after the first render |
| `management.endpoints.web.exposure.include` | `health,metrics` | Only these actuator endpoints are exposed over HTTP |
| `management.endpoint.health.show-details` | `always` | Health responses include component details, such as the Gotenberg URL |
| `management.metrics.distribution.percentiles.gotenberg.requests` | `0.5,0.95` | Publishes median and p95 for the `gotenberg.requests` timer |

## Environment variables used by Docker Compose

| Variable | Value in `docker-compose.yml` | Effect |
|---|---|---|
| `GOTENBERG_URL` | `http://gotenberg:3000` | Sets `gotenberg.url` to the Compose service |
| `LOGGING_STRUCTURED_FORMAT_CONSOLE` | `ecs` | Console logs as one ECS JSON object per line |

## Gotenberg settings

These are command-line flags of the Gotenberg container, not application properties. `docker-compose.yml` passes:

| Flag | Value |
|---|---|
| `--api-timeout` | `30s` |
| `--chromium-max-concurrency` | `6` |
| `--log-std-format` | `json` |

If you raise `--api-timeout`, raise `gotenberg.read-timeout` above it as well.

## Values fixed in code

Some behaviour has no property and changes only in code:

| Value | Where |
|---|---|
| `preferCssPageSize=true` and `printBackground=true` sent on every conversion | `GotenbergClient.convertHtml` |
| Asset file types uploaded with each document: `.css`, `.woff2`, `.svg`, `.png` | `ReportRenderer` |
| Maximum length of a Gotenberg error body kept in the exception message: 2048 bytes | `GotenbergClient` |
| Report `id` range 1 to 9999 on the single-report endpoints | `SampleReports.find` |
| Locale `Locale.US` for templates and `Formats` | `ReportRenderer`, `Formats` |
