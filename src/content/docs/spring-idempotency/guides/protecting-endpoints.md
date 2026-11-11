---
title: Protecting endpoints
description: Choose which requests the filter handles, with @Idempotent or with path patterns.
---

The filter only acts on protected requests. Every other request passes through untouched, even when it carries an `Idempotency-Key` header. A request is protected in one of two ways: its handler method has `@Idempotent`, or its path and method match `idempotency.path-patterns` and `idempotency.methods`.

## On a method

```java
@Idempotent
@PostMapping
ResponseEntity<Order> create(@RequestBody NewOrder body) {
    // ...
}
```

`@Idempotent` works on any handler method found through `RequestMappingHandlerMapping`, whatever its HTTP method. The tests cover POST and PATCH.

## On a controller class

Put the annotation on the class to protect every handler method in it:

```java
@Idempotent
@RestController
@RequestMapping("/tasks")
class TasksController {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    String create() {
        // ...
    }
}
```

The filter looks for the annotation on the method first and falls back to the class.

## Optional keys

By default a protected request without the header gets 400. With `required = false`, a request without the header runs the handler normally and nothing is stored. A request with the header is handled as usual.

```java
@Idempotent(required = false)
@PostMapping("/optional")
Note optional(@RequestBody NewNote body) {
    // ...
}
```

Use this while clients are migrating to sending keys.

## TTL per endpoint

A key is kept for `idempotency.ttl` after the first request, 24 hours by default. After that the same key runs the handler again. Override the TTL on one endpoint with `ttl`:

```java
@Idempotent(ttl = "10m")
@PostMapping("/short-ttl")
Note shortTtl(@RequestBody NewNote body) {
    // ...
}
```

The value is parsed with Spring Boot's `DurationStyle.detectAndParse`, so both the simple form (`"10m"`, `"24h"`) and ISO-8601 (`"PT1H"`) work. An empty string, the default, means `idempotency.ttl`.

## By configuration

Endpoints you cannot annotate, for example in a library or in functional endpoints (`RouterFunction`), can be protected by path:

```properties
idempotency.path-patterns=/api/orders/**,/api/payouts/**
idempotency.methods=POST,PATCH
idempotency.required=true
```

- `idempotency.path-patterns` uses Spring `PathPattern` syntax. The patterns are matched against the request path without the servlet context path.
- `idempotency.methods` lists the HTTP methods the patterns apply to. The default is `POST, PATCH`. A GET to a matching path is not protected.
- `idempotency.required` decides whether matched requests need a key. It applies only to path patterns.
- Path-pattern requests use `idempotency.ttl`. There is no per-pattern TTL.

When a handler method has `@Idempotent`, the annotation's settings win over any matching path pattern.

## Handlers that cannot be protected

`@Idempotent` on a handler whose return type is `Callable`, `CompletionStage` (which includes `CompletableFuture`), `DeferredResult`, `WebAsyncTask`, `ResponseBodyEmitter` (which includes `SseEmitter`) or `StreamingResponseBody` fails. The filter throws `IllegalStateException` with the message `@Idempotent does not support asynchronous handlers: ...`. The check runs when a request reaches that handler, not at startup. The response of an asynchronous handler is written after the filter returns, so it cannot be stored.

Avoid `@Idempotent` on large uploads or downloads. The filter reads the whole request body into memory before the handler runs, and holds the whole response body until it is stored.

## Cost for unprotected requests

To know whether a request is protected, the filter looks up the handler through the application's `RequestMappingHandlerMapping` beans. That lookup runs for every request that reaches the filter, protected or not. The annotation result is cached per handler method.
