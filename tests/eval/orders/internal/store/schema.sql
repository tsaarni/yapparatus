CREATE TABLE customers (
    id         uuid PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id          uuid PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES customers (id),
    state       text NOT NULL DEFAULT 'pending',
    total_cents bigint NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    order_id    uuid NOT NULL REFERENCES orders (id),
    sku         text NOT NULL,
    quantity    integer NOT NULL CHECK (quantity > 0),
    price_cents bigint NOT NULL,
    PRIMARY KEY (order_id, sku)
);

CREATE INDEX orders_customer ON orders (customer_id);
