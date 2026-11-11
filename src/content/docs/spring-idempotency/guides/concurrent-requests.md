---
title: Concurrent requests and retries
description: What happens when retries arrive while the first request is still running, when an instance crashes, and when a handler fails.
---

A key moves through two states in the store: `IN_PROGRESS` while the first request runs, then `COMPLETED` with the stored response. A failed attempt removes the record instead.

## Two timestamps per claim

When the filter claims a key, it computes two instants from the application's `Clock`:

- `expiresAt` is now plus the TTL (`idempotency.ttl` or `@Idempotent(ttl = ...)`). After that, the record is ignored and the key can be claimed again, completed or not.
- `lockedUntil` is now plus `idempotency.lock-timeout`, capped at `expiresAt`. Until then, an `IN_PROGRESS` record blocks other requests with the same key. After that, a new request may take the claim over.

Defaults are 24 hours and 1 minute.

## Retries while the first request runs

A request whose key is `IN_PROGRESS` with a matching fingerprint gets 409 and the handler does not run:

```json
{"type":"about:blank","title":"Conflict","status":409,"detail":"A request with this Idempotency-Key is still being processed. Retry later.","instance":"/orders"}
```

The response has no `Retry-After` header. The client should retry later with the same key. Once the first request has completed, the retry is a replay.

If the fingerprint differs, the answer is 422 regardless of the state. The fingerprint check comes first.

## Across instances

With `JdbcIdempotencyStore`, the claim is a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE` statement, and the primary key on `(scope, idempotency_key)` lets only one concurrent insert win. See [choosing a store](/libs/spring-idempotency/guides/choosing-a-store/#how-the-claim-works).

When the claim loses but the winner's row is gone by the time the store reads it (the owner released the key in between), the store tries the claim again, up to 3 attempts. If it is still racing after that, it reports the key as in progress and the client gets 409.

The integration test `ConcurrentRequestsIT` checks this end to end. It starts two instances of a demo application on real Tomcat ports, both using the JDBC store on one PostgreSQL 17 container, with HikariCP auto-commit turned off. It sends 50 POST requests with one key, alternating between the instances, to a handler that sleeps 300 ms. It runs once with all requests at the same moment and once with requests 10 ms apart. Both runs assert that:

- the handler ran exactly once across both instances,
- exactly one response is the original 201,
- every other response is a replay of that 201 with the same body, or a 409 with `application/problem+json`,
- after the burst, a retry on either instance is a replay.

`IdempotencyStoreContract` runs 32 threads claiming one key at once against both stores and asserts that exactly one gets `ClaimResult.Acquired`.

## Crashed instances

If the instance that runs the handler dies, nobody completes or releases the claim. Retries get 409 until `lockedUntil` passes. After that, the next retry claims the key and runs the handler. The test `inFlightClaimIsReleasedAfterTheLockTimeout` covers this with a claim from a "crashed" instance and a clock moved forward 61 seconds.

## Handlers slower than the lock timeout

Set `idempotency.lock-timeout` above the slowest protected handler. If a handler runs longer, a retry can take over the claim and run the handler a second time. Each claim has its own random token, so when the first handler finishes, `complete` finds no row with its token and returns `false`. The filter then logs a warning and sends the response without storing it:

```text
Idempotency claim was taken over before the response was stored (key order-4711). The handler took longer than idempotency.lock-timeout.
```

## Which results are stored

After the handler returns, the filter decides from the response:

| Handler result | What the filter does | Retry with the same key |
|---|---|---|
| 2xx, 3xx, or 4xx other than 429 | Stores the response | Replay, handler does not run |
| 5xx or 429 | Releases the key | Handler runs again |
| Exception thrown | Releases the key, rethrows | Handler runs again |
| `sendError` called | Releases the key | Handler runs again |

A 5xx or 429 asks the client to try again later, so storing it would make the retry pointless. A 400 for a missing field gives the same 400 on retry, so replaying it is correct.

`sendError` covers, for example, a `ResponseStatusException` that Spring turns into `sendError` because problem details are not enabled. The container renders that body after the filter has returned, so the filter cannot store it.

Only the headers in `idempotency.stored-headers` are stored and replayed. The default is `Content-Type`, `Content-Language`, `Location` and `ETag`. Other headers, such as `Set-Cookie` or custom `X-` headers, are dropped from replays.

## When the store fails

- If `claim` throws, for example because the database is down, the exception propagates and the request fails. The handler does not run without a claim.
- If storing the response throws, the filter logs an error and still sends the response to the client. The record stays `IN_PROGRESS`, so a retry gets 409 until the lock timeout passes and then runs the handler again.
- If releasing the key throws, the filter logs an error. The key is freed when the lock timeout passes.
