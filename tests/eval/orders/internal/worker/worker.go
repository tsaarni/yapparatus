// Package worker applies payment, shipping, and delivery events to orders.
package worker

import (
	"context"
	"log"
	"math/rand/v2"
	"time"

	"example.com/orders/internal/cache"
	"example.com/orders/internal/order"
	"example.com/orders/internal/store"
	"example.com/orders/internal/wire"
)

type Queue interface {
	Receive(ctx context.Context) ([]byte, func(), error) // message, ack
	Requeue(ctx context.Context, msg []byte, delay time.Duration) error
	DeadLetter(ctx context.Context, msg []byte) error
}

type Config struct {
	Concurrency int
	MaxAttempts int
	BaseDelay   time.Duration
}

type Worker struct {
	queue  Queue
	db     *store.DB
	orders *cache.Cache
	cfg    Config
}

func New(q Queue, db *store.DB, orders *cache.Cache, cfg Config) *Worker {
	return &Worker{queue: q, db: db, orders: orders, cfg: cfg}
}

func (w *Worker) Run() {
	for range w.cfg.Concurrency {
		go w.loop(context.Background())
	}
}

func (w *Worker) loop(ctx context.Context) {
	for {
		msg, ack, err := w.queue.Receive(ctx)
		if err != nil {
			log.Printf("receive: %v", err)
			continue
		}
		if err := w.handle(ctx, msg); err != nil {
			w.retry(ctx, msg, err)
		}
		ack()
	}
}

var events = map[uint8]order.Event{
	wire.TypePayment:  order.PaymentReceived,
	wire.TypeShipping: order.Shipped_,
	wire.TypeDelivery: order.DeliveryScanned,
}

func (w *Worker) handle(ctx context.Context, msg []byte) error {
	h, _, err := wire.Decode(msg)
	if err != nil {
		return err
	}
	id := orderID(h.OrderID)
	o, err := w.db.Get(ctx, id)
	if err != nil {
		return err
	}
	next, err := order.Transition(o.State, events[h.Type])
	if err != nil {
		return err
	}
	if err := w.db.SetState(ctx, id, next); err != nil {
		return err
	}
	w.orders.Invalidate(id)
	return nil
}

// retry sends a failed event again after an exponential backoff with full jitter:
// attempt n waits a random time between 0 and BaseDelay * 2^n, at most 30 seconds.
// After MaxAttempts the event goes to the dead-letter queue.
func (w *Worker) retry(ctx context.Context, msg []byte, cause error) {
	attempt := int(msg[12])<<24 | int(msg[13])<<16 | int(msg[14])<<8 | int(msg[15])
	if attempt+1 >= w.cfg.MaxAttempts {
		log.Printf("dead letter after %d attempts: %v", attempt+1, cause)
		w.queue.DeadLetter(ctx, msg)
		return
	}
	ceiling := min(w.cfg.BaseDelay<<attempt, 30*time.Second)
	delay := time.Duration(rand.Int64N(int64(ceiling)))
	msg[1] |= wire.FlagRetry
	msg[12], msg[13], msg[14], msg[15] = byte((attempt+1)>>24), byte((attempt+1)>>16), byte((attempt+1)>>8), byte(attempt+1)
	w.queue.Requeue(ctx, msg, delay)
}

func orderID(n uint64) string { return store.IDFromInt(n) }
