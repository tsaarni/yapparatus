package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"example.com/orders/internal/cache"
	"example.com/orders/internal/order"
	"example.com/orders/internal/store"
)

// Register adds the order routes to mux.
//
//	GET  /orders/{id}         one order, from the cache
//	POST /orders              create an order in state Pending
//	POST /orders/{id}/cancel  cancel a Pending or Paid order
//	GET  /healthz             liveness
func Register(mux *http.ServeMux, orders *cache.Cache, db *store.DB) {
	mux.HandleFunc("GET /orders/{id}", func(w http.ResponseWriter, r *http.Request) {
		o, err := orders.Get(r.Context(), r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "no such order", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(o)
	})

	mux.HandleFunc("POST /orders", func(w http.ResponseWriter, r *http.Request) {
		var req store.NewOrder
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		o, err := db.Create(r.Context(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(o)
	})

	mux.HandleFunc("POST /orders/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		o, err := orders.Get(r.Context(), id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		next, err := order.Transition(o.State, order.Cancel)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if err := db.SetState(r.Context(), id, next); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		orders.Invalidate(id)
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}
