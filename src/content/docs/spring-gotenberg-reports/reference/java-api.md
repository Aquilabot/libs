---
title: Java API
description: The main Java types to read or adapt, with signatures copied from the source.
---

All classes live under `dev.aquilabot.reports`. This is application code, not a published library API: copy and change what you need. Signatures below are copied from the source; method bodies are elided as `{ ... }`.

## Gotenberg client

Package `dev.aquilabot.reports.gotenberg`.

### PdfEngine

The two PDF operations the application needs. Code that produces PDFs depends on this interface, which makes it easy to replace with a fake in tests (`CombinedReportServiceTest.FakeEngine` does this).

```java
public interface PdfEngine {

    PdfStream convertHtml(HtmlDocument document);

    /** Merges the files in list order. */
    PdfStream merge(List<Path> pdfs);
}
```

### GotenbergClient

```java
public class GotenbergClient implements PdfEngine {

    public GotenbergClient(RestClient http, GotenbergProperties.Retry retryProperties, MeterRegistry meters) { ... }

    @Override
    public PdfStream convertHtml(HtmlDocument document) { ... }

    @Override
    public PdfStream merge(List<Path> pdfs) { ... }
}
```

- `convertHtml` posts a multipart form to `/forms/chromium/convert/html` with `index.html`, `header.html` and `footer.html` (each only when not `null`), every asset under its file name, `preferCssPageSize=true` and `printBackground=true`.
- `merge` posts to `/forms/pdfengines/merge`, naming the files `00000.pdf`, `00001.pdf` and so on, because Gotenberg merges in alphanumeric file name order.
- Every attempt is recorded in the `gotenberg.requests` timer. Retryable failures are retried by a `RetryTemplate` built from `GotenbergProperties.Retry`.
- Failures throw `GotenbergException`.

`GotenbergConfiguration` creates the bean. It builds the `RestClient` on the JDK `HttpClient` (HTTP/1.1, `connect-timeout`) with a `JdkClientHttpRequestFactory` (`read-timeout`). The JDK client is used on purpose: a blocked call is aborted when its thread is interrupted, which is how a cancelled job stops in-flight conversions. The same class registers the Gotenberg `HealthIndicator`.

### HtmlDocument

Everything Chromium needs to print one document. The compact constructor copies `assets` with `List.copyOf`, so the list must not be `null` and cannot contain `null` elements.

```java
public record HtmlDocument(String indexHtml, String headerHtml, String footerHtml, List<Asset> assets) {

    public record Asset(String filename, byte[] content) {
    }
}
```

`headerHtml` and `footerHtml` may be `null`. HTML must reference assets by bare file name, because Gotenberg puts all uploaded files in one flat directory.

### PdfStream

An open PDF response body. The caller owns it and must close it, which releases the HTTP connection.

```java
public record PdfStream(InputStream body, long contentLength, Closeable onClose) implements Closeable {

    public long transferTo(OutputStream out) throws IOException { ... }

    public long saveTo(Path target) throws IOException { ... }

    @Override
    public void close() throws IOException { ... }
}
```

`contentLength` is `-1` when Gotenberg did not send a length. `transferTo` and `saveTo` close the stream when they finish and return the number of bytes copied.

### GotenbergException

```java
public class GotenbergException extends RuntimeException {

    public GotenbergException(int status, String message, Throwable cause) { ... }

    public int status() { ... }

    public boolean isRetryable() { ... }
}
```

`status()` is Gotenberg's HTTP status, or `0` when no response arrived. `isRetryable()` returns `status == 0 || status == 429 || status >= 500`.

### GotenbergProperties

```java
@ConfigurationProperties("gotenberg")
public record GotenbergProperties(
        @DefaultValue("http://localhost:3000") URI url,
        @DefaultValue("2s") Duration connectTimeout,
        @DefaultValue("35s") Duration readTimeout,
        @DefaultValue Retry retry) {

    public record Retry(
            @DefaultValue("2") int maxRetries,
            @DefaultValue("300ms") Duration initialDelay,
            @DefaultValue("2.0") double multiplier,
            @DefaultValue("3s") Duration maxDelay) {
    }
}
```

## Rendering

Package `dev.aquilabot.reports.report`.

### Report

```java
public interface Report {

    /** Template name below {@code templates/reports/}, without the {@code .html} suffix. */
    String template();

    /** Human-readable title, used in the HTML title and the running header. */
    String title();

    /** File name offered when the PDF is downloaded. */
    String filename();
}
```

The implementing record is the template model, exposed to templates as `report`.

### ReportRenderer

```java
@Component
public class ReportRenderer {

    public ReportRenderer(ITemplateEngine templates) { ... }

    public HtmlDocument render(Report report) { ... }

    /** The main page only, with a {@code <base>} so a browser can load the assets from {@code assetBase}. */
    public String html(Report report, String assetBase) { ... }
}
```

- `render` processes `reports/<template>`, `reports/page-header` and `reports/page-footer` and attaches the assets.
- `html` processes only the main page. Pass `null` for no `<base>` element.
- The constructor loads every `.css`, `.woff2`, `.svg` and `.png` file from `classpath:report-assets/*`, sorted by file name.
- Templates receive `report`, `fmt` (`Formats.INSTANCE`) and `assetBase`, in a `Context` with `Locale.US`.

Rendering does not need a web request, so the same renderer works in a controller, a background job or a unit test.

### Formats

Exposed to templates as `fmt`. All methods use `Locale.US`.

```java
public final class Formats {

    public static final Formats INSTANCE = new Formats();

    public String money(BigDecimal amount) { ... }   // pattern "#,##0.00"

    public String date(LocalDate date) { ... }       // pattern "d MMM yyyy", e.g. 1 Sep 2026

    public String month(YearMonth month) { ... }     // pattern "MMMM yyyy", e.g. September 2026
}
```

### LineChart and BarChart

```java
public record LineChart(int width, int height, String line, String area, List<Label> yLabels, List<Label> xLabels) {

    public record Label(double x, double y, String text) {
    }

    public static LineChart of(List<BigDecimal> values, List<String> xLabels, int width, int height) { ... }
}

public record BarChart(int width, int height, List<Bar> bars) {

    public record Bar(String label, String value, double y, double length) {
    }

    public static BarChart of(List<String> labels, List<BigDecimal> values, int width) { ... }

    public int labelWidth() { ... }
}
```

See [Charts](/libs/spring-gotenberg-reports/guides/charts/).

## Combined report jobs

Package `dev.aquilabot.reports.job`.

### CombinedReportService

```java
@Service
public class CombinedReportService implements AutoCloseable {

    public CombinedReportService(SampleData data, ReportRenderer renderer, PdfEngine engine, ResultStore store,
                                 JobProperties properties, TaskScheduler scheduler, MeterRegistry meters) { ... }

    public ReportJob start(int accounts, int concurrency, Consumer<JobEvent> listener) { ... }

    @Override
    public void close() { ... }
}
```

- `start` throws `IllegalArgumentException` when `accounts` is outside 1 to `maxSections` or `concurrency` is outside 1 to `maxConcurrency`. Otherwise it emits `Queued` on the calling thread and returns a running `ReportJob`.
- `listener` is called from job threads, one event at a time. If it throws a `RuntimeException`, the job is cancelled with the reason `client disconnected`.
- `close` shuts down the job executor with `shutdownNow`.

### ReportJob

Handle on a running job. Instances are created only by `CombinedReportService` (the constructor is package-private).

```java
public final class ReportJob {

    public String id() { ... }

    public void cancel(String reason) { ... }

    public boolean isFinished() { ... }
}
```

`cancel` is idempotent and safe from any thread. The first reason wins, it interrupts the job's threads, and it has no effect once the job has produced its final event.

### JobEvent

```java
public sealed interface JobEvent {

    String name();

    record Queued(String jobId, int sections) implements JobEvent { ... }          // "queued"

    record Rendering(int completed, int total, String section) implements JobEvent { ... }  // "rendering"

    record Merging(int sections) implements JobEvent { ... }                       // "merging"

    record Done(String downloadUrl, long bytes, long elapsedMillis) implements JobEvent { ... }  // "done"

    record Failed(String reason) implements JobEvent { ... }                       // "failed"

    default boolean terminal() { ... }
}
```

`terminal()` is `true` for `Done` and `Failed`.

### JobProperties

```java
@ConfigurationProperties("reports.combined")
public record JobProperties(
        @DefaultValue("4") int concurrency,
        @DefaultValue("8") int maxConcurrency,
        @DefaultValue("200") int maxSections,
        @DefaultValue("2m") Duration timeout,
        @DefaultValue("5s") Duration heartbeat,
        @DefaultValue("15m") Duration retention) {
}
```

### ResultStore

Finished PDFs on local disk, single-node by design. The public constructor creates a temporary directory with the prefix `combined-reports-`.

```java
@Component
public class ResultStore {

    public ResultStore(JobProperties properties) { ... }

    /** Working directory for one job's intermediate files. */
    public Path workDirectory(String jobId) throws IOException { ... }

    public Path resultFile(String jobId) { ... }

    public Optional<Path> find(String jobId) { ... }

    @Scheduled(fixedDelayString = "${reports.combined.cleanup-interval:1m}")
    public void deleteExpired() { ... }
}
```

- `resultFile` parses `jobId` as a UUID and throws `IllegalArgumentException` if it is not one.
- `find` returns an empty `Optional` for a non-UUID id or a missing file.
- `deleteExpired` deletes `.pdf` files in the directory whose last-modified time is older than `retention`.

## Sample domain

Package `dev.aquilabot.reports.sample`. These records are the template models for the three sample reports.

```java
public record Invoice(String number, LocalDate issued, LocalDate due, Party seller, Party customer,
                      List<InvoiceLine> lines, BigDecimal taxRate) implements Report

public record InvoiceLine(String sku, String description, int quantity, BigDecimal unitPrice)

public record Statement(String accountNumber, Party holder, Party bank, YearMonth period,
                        BigDecimal openingBalance, List<Transaction> transactions) implements Report

public record Transaction(LocalDate date, String description, String reference, BigDecimal amount, BigDecimal balance)

public record PortfolioSummary(Party bank, YearMonth period, List<Statement> statements) implements Report

public record Party(String name, String street, String city, String email)
```

| Record | Derived methods |
|---|---|
| `Invoice` | `subtotal()`, `tax()`, `total()`, `taxPercent()` |
| `InvoiceLine` | `amount()` |
| `Statement` | `closingBalance()`, `credits()`, `debits()`, `balanceChart()` |
| `Transaction` | `credit()` |
| `PortfolioSummary` | `totalClosing()`, `transactionCount()`, `closingChart()` |

`SampleData` is a `@Component` that generates these from a seeded `Random`, so the same id always yields the same document:

```java
@Component
public class SampleData {

    public static final YearMonth PERIOD = YearMonth.of(2026, 9);

    public Invoice invoice(int number) { ... }

    public Statement statement(int account) { ... }

    public PortfolioSummary summary(int accounts) { ... }

    public static String accountNumber(int account) { ... }
}
```

## Web layer

Package `dev.aquilabot.reports.web`. All classes here are package-private.

| Class | Role |
|---|---|
| `ReportController` | `GET /api/reports/{type}/{id}` and `GET /preview/{type}/{id}` |
| `CombinedReportController` | `GET /api/combined-reports/stream` and `GET /api/combined-reports/{jobId}/pdf` |
| `PageController` | `GET /`, the demo page, with `JobProperties` in the model as `job` |
| `SampleReports` | Maps `type` and `id` to a sample `Report` |
| `ErrorHandling` | `@RestControllerAdvice` that maps `GotenbergException` and `IllegalArgumentException` to problem details |
| `WebConfiguration` | Serves `classpath:/report-assets/` under `/report-assets/**` for the preview |

See the [HTTP API reference](/libs/spring-gotenberg-reports/reference/http-api/).
