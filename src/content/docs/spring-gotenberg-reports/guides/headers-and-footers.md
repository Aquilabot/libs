---
title: Running headers and footers
description: How the page header and footer templates are rendered, what Chromium allows inside them, and how page numbers work.
---

Every PDF gets a running header and footer on each page. They come from two Thymeleaf templates, `templates/reports/page-header.html` and `templates/reports/page-footer.html`, which are shared by all reports.

## How they reach Gotenberg

`ReportRenderer.render(report)` processes both templates with the same model as the main page (`report`, `fmt`, `assetBase`) and stores the results in `HtmlDocument.headerHtml` and `HtmlDocument.footerHtml`. `GotenbergClient.convertHtml` uploads them as `header.html` and `footer.html`, the file names Gotenberg's Chromium route expects. If either value is `null`, that file is left out of the form. `GotenbergClientTest.sendsMultipartFormAndStreamsPdfBack` checks this with a document that has a footer and no header.

## What Chromium allows

Chromium renders the header and footer in isolation from the main page:

- They cannot load external stylesheets or web fonts. Styles go in an inline `<style>` element.
- Sizes must be explicit. The templates set `font-size: 8pt`.
- The font is whatever `sans-serif` resolves to in the Gotenberg image. Noto Sans from `report-assets/` is not available here.
- The space they get is the top and bottom margin of the `@page` rule in `report.css` (`22mm` top, `18mm` bottom).

## Page numbers

Chromium fills elements with the classes `pageNumber` and `totalPages` when it prints the footer:

```html title="page-footer.html"
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org" lang="en">
<!-- Chromium fills .pageNumber and .totalPages when it prints this footer. -->
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; }
    .bar { box-sizing: border-box; width: 100%; padding: 5mm 16mm 0; display: flex; justify-content: space-between;
           font-family: sans-serif; font-size: 8pt; color: #5b6472; }
  </style>
</head>
<body>
<div class="bar">
  <span th:text="${report.filename}">file.pdf</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>
</body>
</html>
```

The header shows `report.title` on the left and a fixed "Synthetic data. Not a real document." notice on the right, with a thin bottom border.

`ReportsApplicationIT.statementSpansPagesWithRunningFooter` fetches a multi-page statement from a real Gotenberg container and checks that the extracted text contains `Page 1 of N` and `Page N of N`.

## Page numbers in combined reports

Each section of a combined report is printed separately and then merged. Page numbers therefore restart in every section ("Page 1 of 3" for each statement). The README notes that global numbering would need a second pass, for example stamping numbers onto the merged PDF. The project does not do this.

## Changing the header or footer

- Keep the left and right padding of `.bar` in line with the `@page` side margins (`16mm`), so the header lines up with the body text.
- If the header grows taller, raise the top margin in `@page`, since that margin is all the space the header gets.
- To use a different header per report, add a field or method to your `Report` record and branch on it in the template. `ReportRenderer` always uses the same two template names.
