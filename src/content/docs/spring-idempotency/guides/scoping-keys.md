---
title: Scoping keys
description: Keep keys from different users, API clients or tenants apart with an IdempotencyScopeResolver.
---

Keys are unique per scope, not globally. The store's primary key is `(scope, idempotency_key)`. Two clients that happen to send the same key get separate records and never see each other's responses.

## Default scope

The auto-configuration registers `IdempotencyScopeResolver.principalName()`. It returns `request.getUserPrincipal().getName()`, or the empty string when there is no principal. All anonymous requests share the empty scope.

The test `keysAreScopedPerPrincipal` shows the effect. Alice and Bob send the same key with different bodies. Both requests run the handler and get 201. Alice's retry is a replay of her own response. Bob's request is not a 422, because his key lives in a different scope.

The filter is registered with order `Ordered.LOWEST_PRECEDENCE - 100` (`idempotency.filter-order`). Spring Security's filter chain runs at a lower order by default, so the principal is set by the time the filter resolves the scope. If you change `idempotency.filter-order`, keep the filter after your authentication filter.

## Custom scope

Define a bean of type `IdempotencyScopeResolver` to replace the default. The interface has one method:

```java
@FunctionalInterface
public interface IdempotencyScopeResolver {

    String resolve(HttpServletRequest request);

    static IdempotencyScopeResolver principalName() { ... }
}
```

Scope by tenant:

```java title="IdempotencyConfig.java"
import dev.aquilabot.idempotency.IdempotencyScopeResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class IdempotencyConfig {

    @Bean
    IdempotencyScopeResolver idempotencyScopeResolver() {
        return request -> {
            String tenant = request.getHeader("X-Tenant-Id");
            return tenant == null ? "" : tenant;
        };
    }
}
```

:::caution
`resolve` must not return `null`. The filter passes the scope to `ClaimRequest`, whose constructor rejects `null` with a `NullPointerException`, and the request fails with 500. Return the empty string for "no scope".
:::

Pick a value the server has verified, such as an authenticated principal, an API key that was checked, or a tenant id from a validated token. A raw header that the client controls lets one client choose another client's scope.

## When the scope is resolved

The resolver is called only for protected requests that carry a valid key, after the key is parsed and before the store is asked to claim it. Requests that get 400 for a missing or invalid key never reach the resolver.
