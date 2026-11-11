---
title: Charts
description: Draw line and bar charts as inline SVG whose coordinates are computed in Java, so no JavaScript runs during printing.
---

Charts are inline SVG. `LineChart` and `BarChart` compute every coordinate in Java, and a Thymeleaf fragment places the computed strings into `<svg>` elements. No JavaScript runs in Chromium, so there is no need to wait for a chart to finish drawing before printing, and the output is the same in every browser.

## Line chart

`LineChart.of` takes evenly spaced y values, a list of x-axis labels, and the SVG viewBox size:

```java title="LineChart.java"
public record LineChart(int width, int height, String line, String area, List<Label> yLabels, List<Label> xLabels) {

    public record Label(double x, double y, String text) {
    }

    public static LineChart of(List<BigDecimal> values, List<String> xLabels, int width, int height) { ... }
}
```

| Component | Content |
|---|---|
| `line` | Space-separated `x,y` pairs for a `<polyline>`, one decimal place each |
| `area` | The same points closed down to the baseline, for a filled `<polygon>` |
| `yLabels` | Three labels: maximum, midpoint and minimum, formatted with `Formats.money` |
| `xLabels` | One label per entry in the `xLabels` argument, spread evenly from left to right |

The plot area leaves 64 units on the left for the y labels, 8 on the right, 8 at the top and 22 at the bottom. `of` throws `IllegalArgumentException` when there are fewer than two values. When all values are equal the span is treated as 1, so the line is drawn flat at the top of the plot.

`Statement.balanceChart()` builds the daily balance chart, one point per day of the month:

```java title="Statement.java"
public LineChart balanceChart() {
    List<BigDecimal> daily = new ArrayList<>();
    BigDecimal balance = openingBalance;
    int index = 0;
    for (int day = 1; day <= period.lengthOfMonth(); day++) {
        while (index < transactions.size() && transactions.get(index).date().getDayOfMonth() == day) {
            balance = transactions.get(index++).balance();
        }
        daily.add(balance);
    }
    Formats fmt = Formats.INSTANCE;
    List<String> labels = List.of(fmt.date(period.atDay(1)), fmt.date(period.atDay(15)), fmt.date(period.atEndOfMonth()));
    return LineChart.of(daily, labels, 640, 150);
}
```

`SampleDataTest.chartHasOnePointPerDay` checks that `line()` has one point per day of the period.

## Bar chart

`BarChart.of` draws one horizontal bar per labelled value:

```java title="BarChart.java"
public record BarChart(int width, int height, List<Bar> bars) {

    public record Bar(String label, String value, double y, double length) {
    }

    public static BarChart of(List<String> labels, List<BigDecimal> values, int width) { ... }

    public int labelWidth() { ... }
}
```

Each row is 18 units high, so `height` is `values.size() * 18`. Labels get 150 units (`labelWidth()`) and the value text 90 units; the bar length scales the remaining width against the largest value. Negative values get a zero-length bar. `Bar.value` is the amount formatted with `Formats.money`.

`PortfolioSummary.closingChart()` uses it for the closing balance per account:

```java title="PortfolioSummary.java"
public BarChart closingChart() {
    return BarChart.of(
            statements.stream().map(s -> s.holder().name()).toList(),
            statements.stream().map(Statement::closingBalance).toList(),
            640);
}
```

## Place the chart in a template

`fragments.html` has one fragment per chart type. The line chart fragment:

```html title="fragments.html"
<svg th:fragment="line-chart(chart)" class="chart" th:viewBox="|0 0 ${chart.width} ${chart.height}|"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Balance over the period">
  <polygon class="area" th:points="${chart.area}"/>
  <polyline class="line" th:points="${chart.line}"/>
  <text th:each="label : ${chart.yLabels}" class="axis" text-anchor="end"
        th:x="${label.x}" th:y="${label.y}" th:text="${label.text}">0</text>
  <text th:each="label, it : ${chart.xLabels}" class="axis"
        th:attr="text-anchor=${it.first ? 'start' : (it.last ? 'end' : 'middle')}"
        th:x="${label.x}" th:y="${label.y}" th:text="${label.text}">day</text>
</svg>
```

Include it from a report template inside a figure:

```html title="statement.html"
<figure class="chart-box">
  <figcaption>Daily balance</figcaption>
  <svg th:replace="~{reports/fragments :: line-chart(${report.balanceChart})}"></svg>
</figure>
```

The bar chart works the same way with `bar-chart(${report.closingChart})`.

## Styling

`report.css` styles the SVG through classes, so colors stay in the stylesheet:

```css title="report.css"
.chart-box { margin: 0 0 6mm; break-inside: avoid; }
.chart { width: 100%; height: auto; display: block; }
.chart .line { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.chart .area { fill: var(--accent-soft); stroke: none; }
.chart .bar { fill: var(--accent); }
.chart .axis { font-size: 9px; fill: var(--muted); }
```

`break-inside: avoid` on `.chart-box` keeps a chart on one page. The SVG scales to the content width because its size comes from `viewBox`, not from fixed pixel dimensions.

## Other options

The README's migration notes suggest SVG computed in Java, as here, or a chart library that can render SVG on the server. The project does not include such a library.
