package main

import (
	"flag"
	"log"
	"net/http"

	"example.com/orders/internal/api"
	"example.com/orders/internal/cache"
	"example.com/orders/internal/store"
	"example.com/orders/internal/worker"
)

func main() {
	configPath := flag.String("config", "config.yaml", "configuration file")
	flag.Parse()

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := store.Open(cfg.Database)
	if err != nil {
		log.Fatalf("database: %v", err)
	}

	orders := cache.New(db, cfg.Cache.Size, cfg.Cache.TTL)

	w := worker.New(cfg.Queue, db, orders, cfg.Worker)
	go w.Run()

	mux := http.NewServeMux()
	api.Register(mux, orders, db)
	log.Printf("listening on %s", cfg.Listen)
	log.Fatal(http.ListenAndServe(cfg.Listen, mux))
}
