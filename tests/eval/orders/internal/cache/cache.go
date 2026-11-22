// Package cache keeps recently read orders in memory in front of the database.
package cache

import (
	"container/list"
	"context"
	"sync"
	"time"

	"example.com/orders/internal/store"
)

type entry struct {
	id      string
	order   store.Order
	expires time.Time
}

// Cache is a read-through LRU cache with a time to live.
type Cache struct {
	mu    sync.Mutex
	db    *store.DB
	size  int
	ttl   time.Duration
	order *list.List
	items map[string]*list.Element
}

func New(db *store.DB, size int, ttl time.Duration) *Cache {
	return &Cache{db: db, size: size, ttl: ttl, order: list.New(), items: map[string]*list.Element{}}
}

// Get returns the order from memory when it is fresh, and reads it from the database otherwise.
func (c *Cache) Get(ctx context.Context, id string) (store.Order, error) {
	c.mu.Lock()
	if el, ok := c.items[id]; ok {
		e := el.Value.(*entry)
		if time.Now().Before(e.expires) {
			c.order.MoveToFront(el)
			c.mu.Unlock()
			return e.order, nil
		}
		c.order.Remove(el)
		delete(c.items, id)
	}
	c.mu.Unlock()

	o, err := c.db.Get(ctx, id)
	if err != nil {
		return store.Order{}, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[id] = c.order.PushFront(&entry{id: id, order: o, expires: time.Now().Add(c.ttl)})
	if c.order.Len() > c.size {
		oldest := c.order.Back()
		c.order.Remove(oldest)
		delete(c.items, oldest.Value.(*entry).id)
	}
	return o, nil
}

// Invalidate drops an order after a write, so the next read goes to the database.
func (c *Cache) Invalidate(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[id]; ok {
		c.order.Remove(el)
		delete(c.items, id)
	}
}
