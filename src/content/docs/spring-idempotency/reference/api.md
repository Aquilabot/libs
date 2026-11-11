---
title: API
description: Public types of spring-idempotency, with signatures from the source, and the HTTP behaviour of the filter.
---

Signatures are copied from the source of version `0.1.0-SNAPSHOT`. Method bodies are left out.

## Package dev.aquilabot.idempotency

### Idempotent

Marks a controller method, or every handler method of a controller class, as protected by the `Idempotency-Key` header.

```java
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Idempotent {

    boolean required() default true;

    String ttl() default "";
}
```

| Attribute | Default | Meaning |
|---|---|---|
| `required` | `true` | When `true`, a request without the header gets 400. When `false`, it runs the handler normally and nothing is stored. |
| `ttl` | `""` | How long the key is kept, for example `"10m"`, `"24h"` or `"PT1H"`. Empty means `idempotency.ttl`. |

The method annotation wins over the class annotation. Handlers with asynchronous return types are rejected, see [protecting endpoints](/libs/spring-idempotency/guides/protecting-endpoints/#handlers-that-cannot-be-protected).

### IdempotencyScopeResolver

Decides which client a key belongs to.

```java
@FunctionalInterface
public interface IdempotencyScopeResolver {

    String resolve(HttpServletRequest request);

    static IdempotencyScopeResolver principalName();
}
```

`principalName()` returns the principal's name, or `""` when `request.getUserPrincipal()` is `null`. It is the default bean. `resolve` must not return `null`.

### IdempotencyProperties

`@ConfigurationProperties("idempotency")`. Getters and setters for each property in the [configuration reference](/libs/spring-idempotency/reference/configuration/). Nested types:

```java
public enum StoreType {
    MEMORY,
    JDBC
}

public static class Jdbc {
    public String getTableName();
    public void setTableName(String tableName);
    public boolean isInitializeSchema();
    public void setInitializeSchema(boolean initializeSchema);
}
```

## Package dev.aquilabot.idempotency.store

### IdempotencyStore

```java
public interface IdempotencyStore {

    ClaimResult claim(ClaimRequest request);

    boolean complete(String scope, String key, String token, StoredResponse response);

    boolean release(String scope, String key, String token);

    int deleteExpired(Instant now);
}
```

| Method | Contract |
|---|---|
| `claim` | Claims a key atomically. Returns `ClaimResult.Acquired` when there was no record, when the record has expired (`expiresAt <= now`), or when it is an abandoned in-progress claim (`lockedUntil <= now`). Otherwise returns `ClaimResult.Existing` with the record. For one scope and key, at most one caller gets `Acquired` until that claim is completed, released or expires. |
| `complete` | Stores the response and marks the record `COMPLETED`. Returns `false` when no in-progress claim with this `token` exists, for example because it was taken over after its lock expired. |
| `release` | Deletes an in-progress claim so the next request with the key runs the handler again. Returns `false` when no in-progress claim with this `token` exists. A completed record cannot be released. |
| `deleteExpired` | Deletes expired records and in-progress claims whose lock has expired. Returns the number of deleted records. `claim` already ignores such records, so this only reclaims space. |

All time comparisons use the `now` passed in by the caller, never the store's own clock. `IdempotencyStoreContract` in the test sources holds the tests both built-in stores pass.

### ClaimRequest

```java
public record ClaimRequest(String scope, String key, String fingerprint, String token,
                           Instant now, Instant lockedUntil, Instant expiresAt)
```

| Component | Meaning |
|---|---|
| `scope` | Client the key belongs to. Empty for a global scope. |
| `key` | The parsed `Idempotency-Key` value. |
| `fingerprint` | Hash of method, path and body of the request. |
| `token` | Random value that identifies this claim in `complete` and `release`. The filter uses a random UUID. |
| `now` | Current time. |
| `lockedUntil` | Until when an in-progress claim blocks other requests. |
| `expiresAt` | When the record, completed or not, is forgotten. |

The constructor throws `NullPointerException` when any component is `null`.

### ClaimResult

```java
public sealed interface ClaimResult {

    record Acquired() implements ClaimResult {
    }

    record Existing(IdempotencyRecord record) implements ClaimResult {
    }
}
```

`Acquired` means the caller owns the key and runs the handler. `Existing` means another request already holds or completed the key.

### IdempotencyRecord

```java
public record IdempotencyRecord(String fingerprint, State state, StoredResponse response, Instant expiresAt) {

    public enum State {
        IN_PROGRESS,
        COMPLETED
    }
}
```

`response` is `null` while the state is `IN_PROGRESS`.

### StoredResponse

```java
public record StoredResponse(int status, Map<String, List<String>> headers, byte[] body) {

    public byte[] body();

    public String encodeHeaders();

    public static Map<String, List<String>> decodeHeaders(String encoded);
}
```

The constructor copies `headers` into an unmodifiable map that keeps insertion order, and copies `body` (a `null` body becomes an empty array). `body()` returns a copy. `equals` and `hashCode` compare the body by content. `encodeHeaders` writes one `name: value` line per header value, and `decodeHeaders` reverses it. The JDBC store uses this format for the `headers` column.

### InMemoryIdempotencyStore

```java
public class InMemoryIdempotencyStore implements IdempotencyStore {

    public int size();
}
```

Keeps records in a `ConcurrentHashMap`. Removes expired entries every 1000 claims and in `deleteExpired`. `size()` returns the number of stored keys and exists for tests.

### JdbcIdempotencyStore

```java
public class JdbcIdempotencyStore implements IdempotencyStore {

    public static final String DEFAULT_TABLE = "idempotency_keys";
    public static final String SCHEMA_LOCATION = "dev/aquilabot/idempotency/schema-postgresql.sql";

    public JdbcIdempotencyStore(DataSource dataSource);

    public JdbcIdempotencyStore(DataSource dataSource, String table);

    public void createSchema();
}
```

Stores records in a PostgreSQL table. The constructor throws `IllegalArgumentException` when `table` is `null` or does not match `[A-Za-z_][A-Za-z0-9_]{0,62}`. `createSchema()` runs the bundled script with the table name replaced and is safe to run more than once. Every statement runs in its own transaction with `REQUIRES_NEW` propagation. See [choosing a store](/libs/spring-idempotency/guides/choosing-a-store/#postgresql).

## Package dev.aquilabot.idempotency.web

### IdempotencyFilter

```java
public class IdempotencyFilter extends OncePerRequestFilter {

    public IdempotencyFilter(IdempotencyStore store, IdempotencyScopeResolver scopeResolver,
                             IdempotencyProperties properties, Clock clock,
                             Supplier<List<RequestMappingHandlerMapping>> handlerMappings);
}
```

The auto-configuration creates it and registers it as `idempotencyFilter`. You only need the constructor to register the filter by hand, for example outside Spring Boot auto-configuration.

### IdempotencyKeys

```java
public final class IdempotencyKeys {

    public static Optional<String> parse(String headerValue, int maxLength);
}
```

Returns the key, or `Optional.empty()` when the header value is not a valid key. Rules are in [error responses](/libs/spring-idempotency/guides/error-responses/#valid-keys).

### RequestFingerprint

```java
public final class RequestFingerprint {

    public static String of(String method, String pathAndQuery, byte[] body);
}
```

Returns the lowercase hex SHA-256 of `method`, a newline, `pathAndQuery`, a newline and `body`. Always 64 characters.

## Package dev.aquilabot.idempotency.autoconfigure

### IdempotencyAutoConfiguration

```java
@AutoConfiguration(afterName = "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass(DispatcherServlet.class)
@ConditionalOnBooleanProperty(name = "idempotency.enabled", matchIfMissing = true)
@EnableConfigurationProperties(IdempotencyProperties.class)
public class IdempotencyAutoConfiguration
```

| Bean | Condition |
|---|---|
| `IdempotencyScopeResolver` (`principalName()`) | No other `IdempotencyScopeResolver` bean |
| `InMemoryIdempotencyStore` | No `IdempotencyStore` bean, and `idempotency.store` is `memory` or missing |
| `JdbcIdempotencyStore` | No `IdempotencyStore` bean, `idempotency.store=jdbc`, `JdbcTemplate` on the classpath, a single `DataSource` candidate |
| `FilterRegistrationBean<IdempotencyFilter>` named `idempotencyFilter` | Always, when the auto-configuration is active |

## HTTP behaviour

### Headers

| Header | Direction | Default name | Property |
|---|---|---|---|
| Idempotency key | Request | `Idempotency-Key` | `idempotency.header-name` |
| Replay marker, value `true` | Response | `Idempotent-Replayed` | `idempotency.replayed-header-name` |

### Outcomes

| Case | Status | Handler runs |
|---|---|---|
| First request with a new key | Handler's status | Yes |
| Retry with the same key, method, path, query and body | Stored status, `Idempotent-Replayed: true` | No |
| Same key, different method, path, query or body | 422 | No |
| Same key while the first request is still running | 409 | No |
| No key on an endpoint that requires one | 400 | No |
| Key empty, too long or not printable ASCII | 400 | No |
| Same key after the TTL | Handler's status | Yes |
| Same key after an in-progress claim's lock timeout | Handler's status | Yes |
| Handler returned 5xx or 429, threw, or called `sendError` | Handler's status, key released | Yes, again on retry |
| Handler returned 2xx, 3xx or another 4xx | Handler's status, response stored | No on retry |
| `@Idempotent(required = false)` without a key | Handler's status | Yes, every time |
| Endpoint without the annotation or a matching pattern | Handler's status | Yes, every time |

`IdempotencyFilterTest` and `PathPatternTest` cover these rows with MockMvc, with two exceptions. A changed query string is covered at the unit level by `RequestFingerprintTest`, and storing a 3xx follows from the status check in the filter but has no test of its own.

### Problem bodies

The 400, 409 and 422 responses use `application/problem+json`:

```json
{"type":"about:blank","title":"Conflict","status":409,"detail":"A request with this Idempotency-Key is still being processed. Retry later.","instance":"/orders"}
```

The `detail` texts are listed in [error responses](/libs/spring-idempotency/guides/error-responses/#status-codes).
