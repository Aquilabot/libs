---
title: Quick start
description: Protect one POST endpoint with @Idempotent and watch a retry get replayed.
---

This page assumes a Spring Boot 4.1 application with `spring-boot-starter-webmvc` and the library on the classpath. See [installation](/libs/spring-idempotency/installation/).

## Annotate a controller method

```java title="OrdersController.java"
import dev.aquilabot.idempotency.Idempotent;
import java.net.URI;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
class OrdersController {

    record NewOrder(String item, int quantity) {
    }

    record Order(long id, String item, int quantity) {
    }

    private final AtomicLong ids = new AtomicLong();

    @Idempotent
    @PostMapping
    ResponseEntity<Order> create(@RequestBody NewOrder body) {
        Order order = new Order(ids.incrementAndGet(), body.item(), body.quantity());
        return ResponseEntity.created(URI.create("/orders/" + order.id())).body(order);
    }
}
```

No configuration is needed. The default store keeps keys in memory.

## Send a request

Start the application and send a POST with an `Idempotency-Key` header. The draft defines the key as a quoted string, so the value includes the double quotes.

```bash
curl -si -X POST localhost:8080/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: "order-4711"' \
  -d '{"item":"notebook","quantity":2}'
```

The handler runs and the response is stored. Output, trimmed to the relevant headers:

```http
HTTP/1.1 201
Location: /orders/1
Content-Type: application/json

{"id":1,"item":"notebook","quantity":2}
```

## Retry with the same key

Run the same command again. The handler does not run. The filter replays the stored status, headers and body, and adds `Idempotent-Replayed: true`:

```http
HTTP/1.1 201
Content-Type: application/json
Location: /orders/1
Idempotent-Replayed: true

{"id":1,"item":"notebook","quantity":2}
```

The order id is still 1, because `create` ran once. A bare value such as `-H 'Idempotency-Key: order-4711'` is the same key as `"order-4711"` and is replayed too.

## Reuse the key for a different request

Change the body and keep the key:

```bash
curl -si -X POST localhost:8080/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: "order-4711"' \
  -d '{"item":"notebook","quantity":3}'
```

The fingerprint no longer matches, so the filter answers 422 without running the handler:

```http
HTTP/1.1 422
Content-Type: application/problem+json

{"type":"about:blank","title":"Unprocessable Content","status":422,"detail":"This Idempotency-Key was already used for a different request.","instance":"/orders"}
```

## Leave the key out

`@Idempotent` requires the header by default:

```bash
curl -si -X POST localhost:8080/orders \
  -H 'Content-Type: application/json' \
  -d '{"item":"notebook","quantity":2}'
```

```http
HTTP/1.1 400
Content-Type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"This request requires an Idempotency-Key header.","instance":"/orders"}
```

## Next steps

- Make the key optional, set a TTL per endpoint, or protect paths without annotations: [protecting endpoints](/libs/spring-idempotency/guides/protecting-endpoints/).
- Run more than one instance: [choosing a store](/libs/spring-idempotency/guides/choosing-a-store/).
- All status codes and bodies: [error responses](/libs/spring-idempotency/guides/error-responses/).
