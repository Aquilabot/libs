---
title: Add a report template
description: Create a report record and a Thymeleaf template, expose it over HTTP, preview it in a browser and test it without Gotenberg.
---

A report has two parts: a Java record that implements `Report` and a Thymeleaf template under `src/main/resources/templates/reports/`. The record is the template model. Derived values such as totals or chart geometry are plain methods on it.

## The Report interface

```java title="Report.java"
public interface Report {

    /** Template name below {@code templates/reports/}, without the {@code .html} suffix. */
    String template();

    /** Human-readable title, used in the HTML title and the running header. */
    String title();

    /** File name offered when the PDF is downloaded. */
    String filename();
}
```

`ReportRenderer` passes three variables to every template:

| Variable | Value |
|---|---|
| `report` | The `Report` instance |
| `fmt` | `Formats.INSTANCE`, with `money(BigDecimal)`, `date(LocalDate)` and `month(YearMonth)`, all fixed to `Locale.US` |
| `assetBase` | An empty string when rendering for Gotenberg, `/report-assets/` for the browser preview |

## 1. Write the record

The sample `Invoice` shows the pattern. Totals are methods, so the template only reads them.

```java title="Invoice.java"
public record Invoice(String number, LocalDate issued, LocalDate due, Party seller, Party customer,
                      List<InvoiceLine> lines, BigDecimal taxRate) implements Report {

    public BigDecimal subtotal() {
        return lines.stream().map(InvoiceLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public BigDecimal tax() {
        return subtotal().multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
    }

    public BigDecimal total() {
        return subtotal().add(tax());
    }

    @Override
    public String template() {
        return "invoice";
    }

    @Override
    public String title() {
        return "Invoice " + number;
    }

    @Override
    public String filename() {
        return "invoice-" + number + ".pdf";
    }
}
```

(`taxPercent()` is omitted here.) The templates read these methods as properties: `invoice.html` uses `${report.total}` for `total()`.

## 2. Write the template

Create `src/main/resources/templates/reports/<template>.html`, where `<template>` is the value returned by `template()`. Start from `invoice.html`. It pulls shared parts from `fragments.html`:

| Fragment | Purpose |
|---|---|
| `head` | `<meta charset>`, the `<title>` from `report.title`, an optional `<base>` from `assetBase`, and `<link rel="stylesheet" href="report.css">` |
| `letterhead(issuer, heading, subtitle)` | Issuer name and address on the left, heading, subtitle and a "Synthetic data" badge on the right |
| `party(label, party)` | An address block for a `Party` |
| `line-chart(chart)` | Inline SVG for a `LineChart` |
| `bar-chart(chart)` | Inline SVG for a `BarChart` |

A trimmed version of `invoice.html`:

```html title="invoice.html"
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org" lang="en">
<head th:replace="~{reports/fragments :: head}"></head>
<body>
<header th:replace="~{reports/fragments :: letterhead(${report.seller}, 'Invoice', ${report.number})}"></header>

<table class="lines">
  <thead>
  <tr><th>SKU</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
  </thead>
  <tbody>
  <tr th:each="line : ${report.lines}">
    <td th:text="${line.sku}">SKU</td>
    <td th:text="${line.description}">Item</td>
    <td class="num" th:text="${line.quantity}">1</td>
    <td class="num" th:text="${fmt.money(line.unitPrice)}">0.00</td>
    <td class="num" th:text="${fmt.money(line.amount)}">0.00</td>
  </tr>
  </tbody>
</table>

<table class="totals">
  <tr class="grand"><th>Total due</th><td class="num" th:text="${fmt.money(report.total)}">0.00</td></tr>
</table>
</body>
</html>
```

Reference assets by bare file name, as in `href="report.css"`. Gotenberg receives all uploaded files in one flat directory, so paths such as `report-assets/report.css` do not resolve.

## 3. Use the shared stylesheet and assets

Shared print rules live in `src/main/resources/report-assets/report.css`. `ReportRenderer` loads every file in `report-assets/` that ends in `.css`, `.woff2`, `.svg` or `.png` once at startup, sorts them by name, and uploads all of them with every document. To add a logo, drop `logo.svg` into that directory and reference it as `src="logo.svg"`.

Rules in `report.css` that matter for printing:

```css title="report.css"
@page {
  size: A4;
  margin: 22mm 16mm 18mm 16mm;
}

.lines thead { display: table-header-group; } /* repeat the header row on every page */
.lines tr { break-inside: avoid; }
.totals { width: 45%; margin: 5mm 0 0 auto; break-inside: avoid; }
```

Page size and margins come from `@page`, because `GotenbergClient` sends `preferCssPageSize=true`. Change them in CSS, not in Java. The fonts are Noto Sans Regular and Bold as WOFF2, declared with `@font-face` under the family name `Report Sans`.

## 4. Expose it over HTTP

`ReportController` resolves `{type}/{id}` through `SampleReports.find`. Add a case to its `switch`, or write your own controller:

```java title="SampleReports.java"
return switch (type) {
    case "invoice" -> data.invoice(id);
    case "statement" -> data.statement(id);
    case "portfolio-summary" -> data.summary(Math.min(id, 200));
    default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown report type: " + type);
};
```

A minimal controller of your own needs the same three calls `ReportController` makes: build the record, `renderer.render(report)`, `engine.convertHtml(...)`, then stream the `PdfStream`:

```java
@GetMapping("/api/reports/invoice/{id}")
ResponseEntity<StreamingResponseBody> invoice(@PathVariable int id) {
    Report report = data.invoice(id);
    PdfStream pdf = engine.convertHtml(renderer.render(report));
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_PDF);
    headers.setContentDisposition(ContentDisposition.inline().filename(report.filename()).build());
    return ResponseEntity.ok().headers(headers).body(pdf::transferTo);
}
```

`convertHtml` runs before the response is committed, so a failed conversion still becomes a proper error response through `ErrorHandling`.

## 5. Preview in a browser

While you work on the layout, open `/preview/<type>/<id>`. `ReportRenderer.html(report, "/report-assets/")` renders the main page with `<base href="/report-assets/">`, and `WebConfiguration` serves `classpath:/report-assets/` under `/report-assets/**`. The browser loads the same stylesheet and fonts that Gotenberg receives. The running header and footer are not part of the preview.

Use the browser's print preview to check page breaks and the `@page` margins.

## 6. Test the HTML without Gotenberg

`ReportRenderer` is plain Thymeleaf outside any web request. The test helper `TestRenderers.renderer()` builds one with a `ClassLoaderTemplateResolver`, without starting Spring. `ReportRendererTest` asserts on the generated HTML:

```java title="ReportRendererTest.java"
@Test
void invoiceContainsCustomerLinesAndTotal() {
    Invoice invoice = data.invoice(7);

    HtmlDocument document = renderer.render(invoice);

    assertThat(document.indexHtml())
            .contains(invoice.customer().name())
            .contains(Formats.INSTANCE.money(invoice.total()))
            .contains("href=\"report.css\"")
            .doesNotContain("<base");
}
```

`ReportsApplicationIT` goes further: it fetches real PDFs from a Gotenberg container and checks extracted text and embedded font names with PDFBox. `Formats` uses one fixed locale so that text extracted from the PDF stays stable across machines.

## Related

- [Charts](/libs/spring-gotenberg-reports/guides/charts/)
- [Running headers and footers](/libs/spring-gotenberg-reports/guides/headers-and-footers/)
- [Java API](/libs/spring-gotenberg-reports/reference/java-api/)
