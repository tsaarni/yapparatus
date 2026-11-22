// Package order defines the life cycle of an order.
package order

import "fmt"

type State string

const (
	Pending   State = "pending"
	Paid      State = "paid"
	Shipped   State = "shipped"
	Delivered State = "delivered"
	Cancelled State = "cancelled"
)

type Event string

const (
	PaymentReceived Event = "payment_received"
	PaymentFailed   Event = "payment_failed"
	Shipped_        Event = "shipped"
	DeliveryScanned Event = "delivery_scanned"
	Cancel          Event = "cancel"
)

var transitions = map[State]map[Event]State{
	Pending: {PaymentReceived: Paid, PaymentFailed: Pending, Cancel: Cancelled},
	Paid:    {Shipped_: Shipped, Cancel: Cancelled},
	Shipped: {DeliveryScanned: Delivered},
}

// Transition returns the state that event moves an order in state from to.
// Delivered and Cancelled are final: every event on them is an error.
func Transition(from State, event Event) (State, error) {
	next, ok := transitions[from][event]
	if !ok {
		return from, fmt.Errorf("order in state %s cannot take event %s", from, event)
	}
	return next, nil
}
