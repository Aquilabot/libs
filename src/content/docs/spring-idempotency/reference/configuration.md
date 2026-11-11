---
title: Configuration
description: Every idempotency.* property, with its type, default and effect.
---

All properties live under the `idempotency` prefix and bind to `dev.aquilabot.idempotency.IdempotencyProperties`, a standard `@ConfigurationProperties` class.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `idempotency.enabled` | `boolean` | `true` | Whether the auto-configuration runs. When `false`, no filter, store or scope resolver bean is registered. |
| `idempotency.header-name` | `String` | `Idempotency-Key` | Request header that carries the key. Also used in the `detail` text of error responses. |
| `idempotency.replayed-header-name` | `String` | `Idempotent-Replayed` | Header added to replayed responses, with the value `true`. |
| `idempotency.ttl` | `Duration` | `24h` | How long a key is kept after the first request. `@Idempotent(ttl = ...)` overrides it per endpoint. |
| `idempotency.lock-timeout` | `Duration` | `1m` | How long an in-progress claim blocks other requests with the same key. After that the key can be claimed again. Keep it above your slowest handler. Capped at the TTL. |
| `idempotency.max-key-length` | `int` | `255` | Longest accepted key, in characters. |
| `idempotency.stored-headers` | `List<String>` | `Content-Type, Content-Language, Location, ETag` | Response headers that are stored and replayed. Every other header is dropped. |
| `idempotency.path-patterns` | `List<String>` | empty | Spring `PathPattern` patterns, such as `/api/orders/**`, protected without an annotation. Matched against the path without the context path. |
| `idempotency.methods` | `List<String>` | `POST, PATCH` | HTTP methods that `path-patterns` applies to. Compared in upper case. |
| `idempotency.required` | `boolean` | `true` | Whether requests matched by `path-patterns` must carry a key. Does not affect `@Idempotent` endpoints. |
| `idempotency.store` | `StoreType` (`memory`, `jdbc`) | `memory` | Which store to create when the application defines no `IdempotencyStore` bean. |
| `idempotency.filter-order` | `int` | `Ordered.LOWEST_PRECEDENCE - 100` (2147483547) | Order of the servlet filter registration. The default runs after Spring Security. |
| `idempotency.jdbc.table-name` | `String` | `idempotency_keys` | Table used by the JDBC store. Must match `[A-Za-z_][A-Za-z0-9_]{0,62}`. |
| `idempotency.jdbc.initialize-schema` | `boolean` | `false` | Run the bundled schema script at startup, with `CREATE ... IF NOT EXISTS`. Use a migration tool in production. |

`Duration` values accept Spring Boot's formats, for example `90s`, `10m`, `24h` or `PT1H`.

## Examples

Protect paths by configuration and use PostgreSQL:

```properties title="application.properties"
idempotency.path-patterns=/api/orders/**,/api/payouts/**
idempotency.methods=POST,PATCH
idempotency.store=jdbc
idempotency.jdbc.initialize-schema=true
```

Shorter key lifetime, longer lock for slow handlers, and an extra replayed header:

```yaml title="application.yml"
idempotency:
  ttl: 6h
  lock-timeout: 2m
  stored-headers:
    - Content-Type
    - Content-Language
    - Location
    - ETag
    - Cache-Control
```

Setting `stored-headers` replaces the default list, so repeat the defaults you want to keep.

## Beans you can replace

The auto-configuration backs off when the application defines its own bean of these types:

| Type | Default | Notes |
|---|---|---|
| `IdempotencyStore` | `InMemoryIdempotencyStore` or `JdbcIdempotencyStore`, by `idempotency.store` | Any bean of this type disables both built-in stores. |
| `IdempotencyScopeResolver` | `IdempotencyScopeResolver.principalName()` | See [scoping keys](/libs/spring-idempotency/guides/scoping-keys/). |
| `java.time.Clock` | `Clock.systemUTC()` | Used when the context has a single `Clock` bean or a primary one. |

The filter itself is registered as a `FilterRegistrationBean<IdempotencyFilter>` named `idempotencyFilter`. It has no back-off condition. To turn the filter off, set `idempotency.enabled=false`.
