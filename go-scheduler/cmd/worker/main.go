package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/distributed-scheduler/job-scheduler/internal/domain"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
	"github.com/distributed-scheduler/job-scheduler/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/scheduler?sslmode=disable"
	}

	queue := os.Getenv("QUEUE")
	if queue == "" {
		queue = "default"
	}

	concurrency := 4
	if cStr := os.Getenv("CONCURRENCY"); cStr != "" {
		if c, err := strconv.Atoi(cStr); err == nil {
			concurrency = c
		}
	}

	workerID := os.Getenv("WORKER_ID")
	if workerID == "" {
		workerID = fmt.Sprintf("worker-proc-%d", os.Getpid())
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		logger.Error("unable to parse database url", "error", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = int32(concurrency + 5)

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		logger.Error("failed to connect to postgres pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	pgStore := store.NewPostgresStore(pool)

	w := worker.NewWorker(worker.Config{
		WorkerID:      workerID,
		Queue:         queue,
		Concurrency:   concurrency,
		PollInterval:  250 * time.Millisecond,
		LeaseDuration: 15 * time.Second,
	}, pgStore, logger)

	// Register sample handlers demonstrating idempotency and error handling
	w.RegisterHandler("email_send", func(ctx context.Context, job *domain.Job) (json.RawMessage, error) {
		// Simulate fast I/O bound work
		time.Sleep(50 * time.Millisecond)
		return json.Marshal(map[string]any{"sent": true, "timestamp": time.Now().UTC()})
	})

	w.RegisterHandler("image_resize", func(ctx context.Context, job *domain.Job) (json.RawMessage, error) {
		// Simulate CPU bound work
		time.Sleep(100 * time.Millisecond)
		return json.Marshal(map[string]any{"dimensions": "800x600", "bytes": 102400})
	})

	w.RegisterHandler("flaky_api_call", func(ctx context.Context, job *domain.Job) (json.RawMessage, error) {
		// Simulates an upstream flake to test retry backoff & jitter
		if rand.Float64() < 0.6 {
			return nil, fmt.Errorf("upstream 503 service unavailable (transient)")
		}
		return json.Marshal(map[string]any{"status": "recovered"})
	})

	w.RegisterHandler("poison_pill", func(ctx context.Context, job *domain.Job) (json.RawMessage, error) {
		// Demonstrates deterministic failures that safely end up in DLQ without stalling the queue
		return nil, fmt.Errorf("unrecoverable data parsing failure in payload")
	})

	w.Start(ctx)

	<-ctx.Done()
	logger.Info("shutting down worker, waiting for in-flight jobs...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := w.Stop(shutdownCtx); err != nil {
		logger.Error("worker stop error", "error", err)
	}
	logger.Info("worker process exited cleanly")
}
