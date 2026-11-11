---
title: Quick start
description: The shortest path from a clone to a generated PDF, a combined report and the metrics behind them.
---

Start the stack with Docker Compose. The [installation](/libs/spring-gotenberg-reports/installation/) page covers the Maven alternative.

```bash
git clone https://github.com/Aquilabot/spring-gotenberg-reports.git
cd spring-gotenberg-reports
docker compose up --build
```

## Get one PDF

```bash
curl -o invoice.pdf "http://localhost:8080/api/reports/invoice/7"
```

The three sample report types are `invoice`, `statement` and `portfolio-summary`. The id selects a deterministic fake document, so the same id always yields the same content. For `portfolio-summary` the id is the number of accounts, capped at 200.

```bash
curl -o statement.pdf "http://localhost:8080/api/reports/statement/3"
curl -o summary.pdf "http://localhost:8080/api/reports/portfolio-summary/12"
```

The response is `application/pdf` with `Content-Disposition: inline`. Add `?download=true` to get `attachment` instead:

```bash
curl -OJ "http://localhost:8080/api/reports/invoice/7?download=true"
```

`-J` makes curl use the file name from the header, `invoice-INV-2026-0007.pdf`.

## See the HTML before it is printed

Open `http://localhost:8080/preview/statement/3` in a browser. This is the HTML that Gotenberg prints, with a `<base href="/report-assets/">` so the browser loads the same stylesheet and fonts.

## Generate a combined report

A combined report is one portfolio summary plus one statement per account, merged into a single PDF. Start it and watch the events:

```bash
curl -N "http://localhost:8080/api/combined-reports/stream?accounts=4&concurrency=2"
```

The stream ends with a `done` event:

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

This sample is from the README; job ids, byte counts and times differ on every run, and there is one `rendering` event per section. Download the result with the `downloadUrl` from your own `done` event:

```bash
curl -o combined.pdf "http://localhost:8080/api/combined-reports/<jobId>/pdf"
```

The file stays available for `reports.combined.retention`, 15 minutes by default.

The page at `http://localhost:8080` does the same from the browser with an `EventSource`, a progress bar and a cancel button.

## Check health and timings

```bash
curl "http://localhost:8080/actuator/health"
curl "http://localhost:8080/actuator/metrics/gotenberg.requests"
```

The health response includes a `gotenberg` component that calls Gotenberg's `/health` route. The `gotenberg.requests` timer records every call to Gotenberg, tagged by `operation` and `outcome`.

## Next

- [Add a report template](/libs/spring-gotenberg-reports/guides/add-a-report-template/)
- [HTTP API reference](/libs/spring-gotenberg-reports/reference/http-api/)
