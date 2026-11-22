# Benchmarks

- `get-latency.csv`: `GET /orders/{id}` against a 4-core instance, cache hit and miss, by number of concurrent clients. Measured with `wrk2` for 60 s per row.
- `queue-depth.csv`: the `order-events` queue during the payment-provider outage on 2026-09-14, 10:30 to 11:00 UTC. The provider failed every call, so the worker retried until events reached the dead-letter queue.
