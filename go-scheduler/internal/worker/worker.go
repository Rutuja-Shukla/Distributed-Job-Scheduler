package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/distributed-scheduler/job-scheduler/internal/domain"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
	"github.com/distributed-scheduler/job-scheduler/internal/telemetry"
)

// HandlerFunc is the execution signature for a job type.
type HandlerFunc func(ctx context.Context, job *domain.Job) (json.RawMessage, error)

type Config struct {
	WorkerID      string
	Queue         string
	Concurrency   int
	PollInterval  time.Duration
	LeaseDuration time.Duration
}

type Worker struct {
	cfg       Config
	store     store.Store
	logger    *slog.Logger
	handlers  map[string]HandlerFunc
	handlersMu sync.RWMutex

	activeJobs   map[uuid.UUID]context.CancelFunc
	activeJobsMu sync.Mutex

	stopCh chan struct{}
	wg     sync.WaitGroup
}

func NewWorker(cfg Config, s store.Store, logger *slog.Logger) *Worker {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 5
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 500 * time.Millisecond
	}
	if cfg.LeaseDuration <= 0 {
		cfg.LeaseDuration = 30 * time.Second
	}
	if cfg.Queue == "" {
		cfg.Queue = "default"
	}
	if cfg.WorkerID == "" {
		cfg.WorkerID = fmt.Sprintf("worker-%s", uuid.New().String()[:8])
	}

	return &Worker{
		cfg:        cfg,
		store:      s,
		logger:     logger.With("worker_id", cfg.WorkerID, "queue", cfg.Queue),
		handlers:   make(map[string]HandlerFunc),
		activeJobs: make(map[uuid.UUID]context.CancelFunc),
		stopCh:     make(chan struct{}),
	}
}

func (w *Worker) RegisterHandler(jobType string, h HandlerFunc) {
	w.handlersMu.Lock()
	defer w.handlersMu.Unlock()
	w.handlers[jobType] = h
}

func (w *Worker) Start(ctx context.Context) {
	w.logger.Info("starting worker pool", "concurrency", w.cfg.Concurrency)
	for i := 0; i < w.cfg.Concurrency; i++ {
		w.wg.Add(1)
		go w.workerLoop(ctx, i)
	}
}

// Stop initiates graceful shutdown: stops new claims, releases in-flight jobs if context expires.
func (w *Worker) Stop(ctx context.Context) error {
	w.logger.Info("shutting down worker pool...")
	close(w.stopCh)

	// Wait for worker goroutines with timeout
	done := make(chan struct{})
	go func() {
		w.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		w.logger.Info("all worker goroutines terminated cleanly")
		return nil
	case <-ctx.Done():
		w.logger.Warn("graceful shutdown timed out; cancelling active jobs and releasing leases")
		w.activeJobsMu.Lock()
		for jobID, cancel := range w.activeJobs {
			cancel()
			// Release back to queued state immediately so other workers don't wait for lease expiry
			_ = w.store.ReleaseJob(context.Background(), jobID, w.cfg.WorkerID)
		}
		w.activeJobsMu.Unlock()
		return ctx.Err()
	}
}

func (w *Worker) workerLoop(ctx context.Context, workerIndex int) {
	defer w.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		default:
		}

		job, err := w.store.ClaimJob(ctx, w.cfg.Queue, w.cfg.WorkerID, w.cfg.LeaseDuration)
		if err != nil {
			w.logger.Error("error claiming job", "error", err)
			time.Sleep(w.cfg.PollInterval)
			continue
		}

		if job == nil {
			// No jobs ready to claim
			select {
			case <-ctx.Done():
				return
			case <-w.stopCh:
				return
			case <-time.After(w.cfg.PollInterval):
				continue
			}
		}

		// Execute job with heartbeat extension
		w.processJob(ctx, job)
	}
}

func (w *Worker) processJob(parentCtx context.Context, job *domain.Job) {
	start := time.Now()
	jobCtx, cancel := context.WithCancel(parentCtx)
	defer cancel()

	w.activeJobsMu.Lock()
	w.activeJobs[job.ID] = cancel
	w.activeJobsMu.Unlock()

	defer func() {
		w.activeJobsMu.Lock()
		delete(w.activeJobs, job.ID)
		w.activeJobsMu.Unlock()
	}()

	// Start heartbeat goroutine to extend lease while execution is underway
	hbDone := make(chan struct{})
	var hbWg sync.WaitGroup
	hbWg.Add(1)

	go func() {
		defer hbWg.Done()
		// Heartbeat at 1/3 of the lease duration (e.g. every 10s for 30s lease)
		interval := w.cfg.LeaseDuration / 3
		if interval < time.Second {
			interval = time.Second
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-hbDone:
				return
			case <-jobCtx.Done():
				return
			case <-ticker.C:
				_, err := w.store.Heartbeat(jobCtx, job.ID, w.cfg.WorkerID, w.cfg.LeaseDuration)
				if err != nil {
					if errors.Is(err, domain.ErrLeaseLost) {
						w.logger.Error("lease lost during heartbeat! Aborting execution to prevent duplicate work", "job_id", job.ID)
						cancel() // Abort job execution immediately
						return
					}
					w.logger.Warn("heartbeat ping failed", "job_id", job.ID, "error", err)
				}
			}
		}
	}()

	// Look up handler for job type
	w.handlersMu.RLock()
	handler, exists := w.handlers[job.Type]
	w.handlersMu.RUnlock()

	var result json.RawMessage
	var execErr error

	if !exists {
		execErr = fmt.Errorf("no handler registered for job type: %s", job.Type)
	} else {
		// Run handler with panic recovery to prevent worker crash
		func() {
			defer func() {
				if r := recover(); r != nil {
					execErr = fmt.Errorf("job execution panicked: %v", r)
				}
			}()
			result, execErr = handler(jobCtx, job)
		}()
	}

	// Stop heartbeat loop before recording outcome
	close(hbDone)
	hbWg.Wait()

	telemetry.JobExecutionDuration.WithLabelValues(job.Queue, job.Type).Observe(time.Since(start).Seconds())

	if execErr != nil {
		w.logger.Warn("job failed", "job_id", job.ID, "error", execErr)
		willRetry, retryAt, failErr := w.store.FailJob(context.Background(), job.ID, w.cfg.WorkerID, execErr.Error())
		if failErr != nil {
			w.logger.Error("failed to record job failure in store", "job_id", job.ID, "error", failErr)
		} else if willRetry {
			w.logger.Info("job scheduled for retry", "job_id", job.ID, "retry_at", retryAt)
		} else {
			w.logger.Error("job moved to dead_letter queue", "job_id", job.ID)
		}
		return
	}

	// Job completed successfully
	err := w.store.CompleteJob(context.Background(), job.ID, w.cfg.WorkerID, result)
	if err != nil {
		w.logger.Error("failed to mark job completed in store", "job_id", job.ID, "error", err)
	} else {
		w.logger.Info("job completed successfully", "job_id", job.ID, "duration_ms", time.Since(start).Milliseconds())
	}
}
