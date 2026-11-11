---
title: Compatibility and limitations
description: Versions the project is built and tested against, runtime requirements, licenses and known limitations.
---

## Versions

Taken from `pom.xml`, the Maven Wrapper, the `Dockerfile`, `docker-compose.yml` and the CI workflow:

| Component | Version | Source |
|---|---|---|
| Project | `0.1.0-SNAPSHOT` | `pom.xml` |
| Java | 21 (`java.version`) | `pom.xml`; `eclipse-temurin:21-jdk` and `eclipse-temurin:21-jre` in the `Dockerfile`; Temurin 21 in CI |
| Spring Boot | 4.1.1 (`spring-boot-starter-parent`) | `pom.xml` |
| Gotenberg | `gotenberg/gotenberg:8` image tag | `docker-compose.yml`, `ReportsApplicationIT` |
| Apache PDFBox | 3.0.8, test scope | `pom.xml` |
| Maven | 3.9.16 through Maven Wrapper 3.3.4 | `.mvn/wrapper/maven-wrapper.properties` |

The README also lists Spring Framework 7.0.9, Thymeleaf 3.1.5, Testcontainers 2.0.5 and JUnit 6. These versions are managed by the Spring Boot parent rather than declared in `pom.xml`. The README notes that Spring Boot 4.1.1 was the newest stable release on Maven Central when the project was written, and that its published measurements used Gotenberg 8.32.0.

`gotenberg/gotenberg:8` is a floating major-version tag. Each run of the tests or of Docker Compose uses whatever Gotenberg 8.x release the tag points to at the time.

## Starters and dependencies

| Dependency | Scope |
|---|---|
| `spring-boot-starter-webmvc` | compile |
| `spring-boot-starter-restclient` | compile |
| `spring-boot-starter-thymeleaf` | compile |
| `spring-boot-starter-actuator` | compile |
| `spring-boot-starter-webmvc-test` | test |
| `spring-boot-starter-restclient-test` | test |
| `spring-boot-testcontainers` | test |
| `testcontainers-junit-jupiter` | test |
| `pdfbox` | test |

## Runtime requirements

- JDK 21 or newer to build and run outside Docker. The code relies on virtual threads.
- A Gotenberg 8 instance reachable at `gotenberg.url`. The HTTP client uses two routes: `/forms/chromium/convert/html` and `/forms/pdfengines/merge`, plus `/health` for the health check.
- Docker to run Gotenberg, the Compose stack or the integration tests.
- A writable temporary directory for combined-report work files and results.

## Tests

The repository has 24 tests in 5 classes:

| Class | Tests | Needs |
|---|---|---|
| `GotenbergClientTest` | 5 | Nothing. Uses an in-process HTTP server that plays Gotenberg. |
| `ReportRendererTest` | 4 | Nothing. Uses Thymeleaf without Spring. |
| `SampleDataTest` | 4 | Nothing |
| `CombinedReportServiceTest` | 5 | Nothing. Uses a fake `PdfEngine`. |
| `ReportsApplicationIT` | 6 | Docker. Starts `gotenberg/gotenberg:8` with Testcontainers and checks real PDFs with PDFBox. Skipped without Docker. |

CI runs `./mvnw -B verify` on `ubuntu-latest` with Temurin JDK 21, for pushes to `main` and for pull requests.

## License

The code is under the MIT License, copyright (c) 2026 Jean Carlo Benites Porras. See [`LICENSE`](https://github.com/Aquilabot/spring-gotenberg-reports/blob/main/LICENSE).

The bundled fonts, Noto Sans Regular and Bold (`NotoSans-Regular.woff2`, `NotoSans-Bold.woff2` in `src/main/resources/report-assets/`), are under the SIL Open Font License 1.1, copyright 2022 The Noto Project Authors. They were converted from TTF to WOFF2 with glyphs and names unchanged. The license text is in `report-assets/OFL.txt`.

## Known limitations

These are stated in the README and match the code:

- Page numbers in a combined report restart in every section ("Page 1 of 3" per statement), because each section is printed separately. Global numbering would need a second pass, for example stamping numbers onto the merged PDF.
- Each section embeds its own font subset, so a merged PDF carries the fonts once per section.
- Finished PDFs live on local disk (`ResultStore`) and job state in memory. With more than one instance you need sticky sessions or shared storage and a shared job registry.
- No authentication. The actuator health endpoint shows details. Put both behind your own security before exposing them.
- The running header and footer use whatever sans-serif font the Gotenberg image has, since Chromium does not load web fonts there.
- Chromium output is not PDF/A. Gotenberg can convert to PDF/A through its `pdfa` form field; this project does not use it.

Further points visible in the code:

- Reports come from `SampleData`, which generates deterministic fake data. There is no data access layer.
- The combined report is hardwired to one portfolio summary plus one statement per account.
- The download file name of a combined report is always `combined-report-2026-09.pdf`, taken from `SampleData.PERIOD`.
- `Formats` and the template context use `Locale.US`. Other locales need code changes.
