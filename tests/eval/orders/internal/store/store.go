// Package store reads and writes orders in PostgreSQL.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"example.com/orders/internal/order"
)

var ErrNotFound = errors.New("not found")

type DB struct{ sql *sql.DB }

type Order struct {
	ID         string      `json:"id"`
	CustomerID string      `json:"customerId"`
	State      order.State `json:"state"`
	TotalCents int64       `json:"totalCents"`
}

type NewOrder struct {
	CustomerID string `json:"customerId"`
	Items      []Item `json:"items"`
}

type Item struct {
	SKU        string `json:"sku"`
	Quantity   int    `json:"quantity"`
	PriceCents int64  `json:"priceCents"`
}

func Open(url string) (*DB, error) {
	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, err
	}
	return &DB{sql: db}, nil
}

func (db *DB) Get(ctx context.Context, id string) (Order, error) {
	var o Order
	err := db.sql.QueryRowContext(ctx,
		`SELECT id, customer_id, state, total_cents FROM orders WHERE id = $1`, id,
	).Scan(&o.ID, &o.CustomerID, &o.State, &o.TotalCents)
	if errors.Is(err, sql.ErrNoRows) {
		return Order{}, ErrNotFound
	}
	return o, err
}

func (db *DB) SetState(ctx context.Context, id string, state order.State) error {
	_, err := db.sql.ExecContext(ctx,
		`UPDATE orders SET state = $2, updated_at = now() WHERE id = $1`, id, state)
	return err
}

func (db *DB) Create(ctx context.Context, req NewOrder) (Order, error) {
	tx, err := db.sql.BeginTx(ctx, nil)
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback()
	var total int64
	for _, it := range req.Items {
		total += int64(it.Quantity) * it.PriceCents
	}
	o := Order{CustomerID: req.CustomerID, State: order.Pending, TotalCents: total}
	err = tx.QueryRowContext(ctx,
		`INSERT INTO orders (id, customer_id, total_cents) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
		req.CustomerID, total).Scan(&o.ID)
	if err != nil {
		return Order{}, err
	}
	for _, it := range req.Items {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO order_items (order_id, sku, quantity, price_cents) VALUES ($1, $2, $3, $4)`,
			o.ID, it.SKU, it.Quantity, it.PriceCents); err != nil {
			return Order{}, err
		}
	}
	return o, tx.Commit()
}

// IDFromInt formats the 64-bit order id that queue events carry as the order's UUID.
func IDFromInt(n uint64) string {
	return fmt.Sprintf("00000000-0000-0000-%04x-%012x", n>>48, n&0xffffffffffff)
}
