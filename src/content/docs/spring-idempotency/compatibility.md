---
title: Compatibility
description: Versions the library is built and tested against, its requirements, license and known limitations.
---

## Version

The current version is `0.1.0-SNAPSHOT`. There are no tagged releases, and the artifact is not published to Maven Central or another public repository. Install it by building from source, see [installation](/libs/spring-idempotency/installation/).

## Build and test matrix

| Component | Version | Source |
|---|---|---|
| Java | 21 (`maven.compiler.release`) | `pom.xml` |
| JDK in CI | Temurin 21 | `.github/workflows/ci.yml` |
| Spring Boot | 4.1.1 (`spring-boot-starter-parent`) | `pom.xml` |
| Maven | 3.9.16 through the Maven wrapper 3.3.4 | `.mvn/wrapper/maven-wrapper.properties` |
| PostgreSQL | 17, image `postgres:17-alpine` through Testcontainers | integration tests |
| Servlet container in tests | Tomcat, from `spring-boot-starter-webmvc` | `ConcurrentRequestsIT` |

Dependency versions other than these are managed by the Spring Boot parent.

CI runs `./mvnw -B verify` on `ubuntu-latest` for every push to `main` and every pull request. `verify` runs the unit and MockMvc tests with Surefire, then the integration tests (`*IT`) with Failsafe. The integration tests are annotated `@Testcontainers(disabledWithoutDocker = true)` and are skipped when Docker is not available.

## Requirements

- Java 21 or later.
- Spring Boot 4.1 with Spring MVC on a servlet container. The auto-configuration only activates in a servlet web application with `DispatcherServlet` on the classpath.
- For `JdbcIdempotencyStore`: PostgreSQL, `spring-jdbc` and a `DataSource`. The claim uses `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ... RETURNING`, which is PostgreSQL syntax. Other databases are not supported by this store.

## License

MIT. Copyright (c) 2026 Jean Carlo Benites Porras. See [LICENSE](https://github.com/Aquilabot/spring-idempotency/blob/main/LICENSE).

## Known limitations

- Spring MVC on servlets only. No WebFlux.
- Asynchronous handlers (`Callable`, `CompletionStage`, `DeferredResult`, `WebAsyncTask`, `ResponseBodyEmitter`, `StreamingResponseBody`) are rejected with an `IllegalStateException` when a request reaches them. Their response is written after the filter returns, so it cannot be stored.
- The whole request body is read into memory before the handler runs, and the whole response body is held until it is stored. Do not protect large uploads or downloads.
- The filter finds the handler through `RequestMappingHandlerMapping`. Functional endpoints (`RouterFunction`) can only be protected with `idempotency.path-patterns`.
- That handler lookup runs once more per request, also for requests that are not protected.
- The fingerprint compares the body byte for byte. The same JSON with different key order or whitespace gets 422.
- File parts of multipart requests are not part of the fingerprint.
- A response sent with `sendError` is not stored. The container renders its body after the filter has returned. The key is released instead.
- If storing the response fails, the client still gets the response. A retry then sees 409 until `idempotency.lock-timeout` passes, and after that runs the handler again.
- If the store is unavailable when a request arrives, `claim` throws and the request fails. The handler does not run without a claim.
- A handler that runs longer than `idempotency.lock-timeout` can run twice if a retry takes over the claim.
- The in-memory store is not shared between instances and loses its records on restart.
- The JDBC store uses the application's clock, not the database clock. Instance clocks must be in sync.
- Expired rows in PostgreSQL stay in the table until you call `deleteExpired` or delete them yourself.
- A 409 response carries no `Retry-After` header.
