# orders

The order service stores customer orders and tracks them from checkout to delivery.

- `cmd/orders`: the server binary.
- `internal/api`: HTTP handlers.
- `internal/cache`: an in-memory read-through cache in front of PostgreSQL.
- `internal/store`: the PostgreSQL schema and queries.
- `internal/order`: the order state machine.
- `internal/worker`: consumes payment and shipping events from the `order-events` queue.
- `internal/wire`: the binary format of queue events.
- `bench`: benchmark results.

Run with `go run ./cmd/orders -config config.yaml`.
