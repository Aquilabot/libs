---
title: Choosing a store
description: Pick between the in-memory store, the PostgreSQL store and your own IdempotencyStore.
---

The store holds one record per scope and key: the request fingerprint, the state (`IN_PROGRESS` or `COMPLETED`), the stored response and the expiry times. The filter calls the store through the `IdempotencyStore` interface. The auto-configuration picks the implementation:

| Situation | Store |
|---|---|
| The application defines an `IdempotencyStore` bean | That bean |
| `idempotency.store=memory` or not set | `InMemoryIdempotencyStore` |
| `idempotency.store=jdbc` | `JdbcIdempotencyStore` on the application's `DataSource` |

## In memory

`InMemoryIdempotencyStore` is the default. It keeps records in a `ConcurrentHashMap` and claims a key with an atomic `compute` on that map.

- Nothing is shared between instances. With two instances behind a load balancer, a retry that lands on the other instance runs the handler again.
- Records are lost on restart.
- Expired records are removed every 1000 claims and when you call `deleteExpired`.

Use it for tests, local development and applications that run as a single instance.

## PostgreSQL

Set the store type and give the application a `DataSource`:

```properties
idempotency.store=jdbc
spring.datasource.url=jdbc:postgresql://localhost:5432/app
```

This needs `spring-jdbc` on the classpath (through `spring-boot-starter-jdbc`) and exactly one `DataSource` candidate. With `idempotency.store=jdbc` and no `DataSource`, the application fails to start.

### Create the table

The schema ships in the jar at `dev/aquilabot/idempotency/schema-postgresql.sql`:

```sql title="schema-postgresql.sql"
CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope           text        NOT NULL,
    idempotency_key text        NOT NULL,
    fingerprint     text        NOT NULL,
    token           text        NOT NULL,
    state           text        NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
    status          integer,
    headers         text,
    body            bytea,
    created_at      timestamptz NOT NULL,
    locked_until    timestamptz NOT NULL,
    expires_at      timestamptz NOT NULL,
    PRIMARY KEY (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
```

Copy it into a Flyway or Liquibase migration. For development, `idempotency.jdbc.initialize-schema=true` runs the script at startup. The statements use `IF NOT EXISTS`, so running the script twice is safe.

To use another table name, set `idempotency.jdbc.table-name`. The name must match `[A-Za-z_][A-Za-z0-9_]{0,62}`, so letters, digits and underscores only and no schema prefix. `JdbcIdempotencyStore` throws `IllegalArgumentException` for any other value. With `initialize-schema=true`, the script is run with `idempotency_keys` replaced by your name, which also renames the index.

### How the claim works

A claim is one statement:

```sql
INSERT INTO idempotency_keys AS t
    (scope, idempotency_key, fingerprint, token, state, created_at, locked_until, expires_at)
VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)
ON CONFLICT (scope, idempotency_key) DO UPDATE
    SET fingerprint = EXCLUDED.fingerprint,
        token = EXCLUDED.token,
        state = 'IN_PROGRESS',
        status = NULL,
        headers = NULL,
        body = NULL,
        created_at = EXCLUDED.created_at,
        locked_until = EXCLUDED.locked_until,
        expires_at = EXCLUDED.expires_at
    WHERE t.expires_at <= EXCLUDED.created_at
       OR (t.state = 'IN_PROGRESS' AND t.locked_until <= EXCLUDED.created_at)
RETURNING token
```

A returned row means this request owns the key: no row existed, or the existing row had expired or was an abandoned in-progress claim. No returned row means another request owns the key, and the store reads that row to decide between replay, 409 and 422. The primary key on `(scope, idempotency_key)` makes concurrent inserts conflict, so only one wins.

Each statement runs in its own short transaction, started by the store with `REQUIRES_NEW`. It commits even when the connection pool has auto-commit turned off or the caller is inside another transaction. No row lock or transaction is held while the handler runs.

`complete` and `release` match on a random token that the filter generates per claim. A request that lost its claim cannot overwrite or delete the row of the new owner.

### Clocks

Times come from the application's `Clock`, never from `now()` in the database. If the application defines a single `Clock` bean, or a primary one, the filter uses it. Otherwise it uses `Clock.systemUTC()`. With several instances, keep their clocks in sync, for example with NTP.

### Delete expired rows

`claim` ignores expired rows and takes them over, but they stay in the table until something deletes them. The library does not schedule cleanup. Call `deleteExpired` from a scheduled job:

```java title="IdempotencyCleanup.java"
import dev.aquilabot.idempotency.store.IdempotencyStore;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class IdempotencyCleanup {

    private final IdempotencyStore store;

    IdempotencyCleanup(IdempotencyStore store) {
        this.store = store;
    }

    @Scheduled(cron = "0 0 * * * *")
    void deleteExpired() {
        store.deleteExpired(Instant.now());
    }
}
```

This needs `@EnableScheduling` on a configuration class. `deleteExpired` removes rows whose `expires_at` has passed and in-progress rows whose `locked_until` has passed, and returns the number of deleted rows. You can also delete rows with `expires_at <= now()` from `pg_cron`. The index on `expires_at` serves both.

## Your own store

Define a bean of type `IdempotencyStore` and the auto-configuration creates neither built-in store, whatever `idempotency.store` says. The interface has four methods:

```java
public interface IdempotencyStore {

    ClaimResult claim(ClaimRequest request);

    boolean complete(String scope, String key, String token, StoredResponse response);

    boolean release(String scope, String key, String token);

    int deleteExpired(Instant now);
}
```

The contract that matters is `claim`. For one scope and key, at most one caller may get `ClaimResult.Acquired` until that claim is completed, released or expires. All time comparisons must use the `now` passed in by the caller. See the [API reference](/libs/spring-idempotency/reference/api/#idempotencystore) for each method's rules.

The same bean mechanism lets you point the PostgreSQL store at a `DataSource` other than the primary one:

```java
@Bean
IdempotencyStore idempotencyStore(@Qualifier("keysDataSource") DataSource dataSource) {
    return new JdbcIdempotencyStore(dataSource, "idempotency_keys");
}
```

When you construct `JdbcIdempotencyStore` yourself, `idempotency.jdbc.*` is not applied. Call `createSchema()` on it if you want the table created at startup.
