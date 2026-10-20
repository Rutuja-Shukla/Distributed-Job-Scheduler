package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/distributed-scheduler/job-scheduler/internal/domain"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
)

type LatencyStats struct {
	P50 float64
	P90 float64
	P95 float64
	P99 float64
	Avg float64
	Max float64
}

func calculatePercentiles(samples []float64) LatencyStats {
	if len(samples) == 0 {
		return LatencyStats{}
	}
	sort.Float64s(samples)
	n := float64(len(samples))

	var sum float64
	for _, v := range samples {
		sum += v
	}

	p := func(pct float64) float64 {
		idx := int(math.Ceil(pct/100.0*n)) - 1
		if idx < 0 {
			idx = 0
		}
		if idx >= len(samples) {
			idx = len(samples) - 1
		}
		return samples[idx]
	}

	return LatencyStats{
		P50: p(50),
		P90: p(90),
		P95: p(95),
		P99: p(99),
		Avg: sum / n,
		Max: samples[len(samples)-1],
	}
}

func main() {
	var (
		dbURL   = flag.String("db", "postgres://postgres:postgres@localhost:5432/scheduler?sslmode=disable", "PostgreSQL connection string")
		numJobs = flag.Int("jobs", 1000, "Number of jobs to enqueue")
		workers = flag.Int("workers", 16, "Number of concurrent workers")
		queue   = flag.String("queue", "benchmark", "Queue name")
	)
	flag.Parse()

	ctx := context.Background()
	poolConfig, err := pgxpool.ParseConfig(*dbURL)
	if err != nil {
		fmt.Printf("Error parsing DB URL: %v\n", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = int32(*workers + 10)

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		fmt.Printf("Error connecting to DB: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	pgStore := store.NewPostgresStore(pool)

	fmt.Printf("=== DISTRIBUTED JOB SCHEDULER LOAD TEST ===\n")
	fmt.Printf("Target: %d jobs, %d concurrent workers, Queue: %s\n\n", *numJobs, *workers, *queue)

	// Phase 1: Ingestion / Submission benchmark
	fmt.Printf("[1/3] Enqueuing %d jobs...\n", *numJobs)
	startEnqueue := time.Now()

	var wg sync.WaitGroup
	enqueueWorkers := 8
	jobsPerWorker := *numJobs / enqueueWorkers

	for i := 0; i < enqueueWorkers; i++ {
		wg.Add(1)
		go func(workerIdx int) {
			defer wg.Done()
			for j := 0; j < jobsPerWorker; j++ {
				key := fmt.Sprintf("bench-%d-%d", workerIdx, j)
				_, err := pgStore.SubmitJob(ctx, domain.SubmitJobInput{
					IdempotencyKey: &key,
					Queue:          *queue,
					TenantID:       fmt.Sprintf("tenant-%d", j%4),
					Type:           "benchmark_task",
					Payload:        json.RawMessage(`{"benchmark": true}`),
					Priority:       rand.Intn(10),
					MaxAttempts:    3,
					Delay:          0,
				})
				if err != nil {
					fmt.Printf("Enqueue error: %v\n", err)
				}
			}
		}(i)
	}
	wg.Wait()
	enqueueDuration := time.Since(startEnqueue)
	enqueueRate := float64(*numJobs) / enqueueDuration.Seconds()
	fmt.Printf("  -> Ingested %d jobs in %v (%.2f submissions/sec)\n\n", *numJobs, enqueueDuration, enqueueRate)

	// Phase 2: Consumption benchmark with N concurrent workers
	fmt.Printf("[2/3] Processing jobs with %d workers...\n", *workers)

	var (
		completedCount int64
		claimSamples   []float64
		queueDelays    []float64
		samplesMu      sync.Mutex
	)

	startDrain := time.Now()

	for i := 0; i < *workers; i++ {
		wg.Add(1)
		go func(workerIdx int) {
			defer wg.Done()
			workerID := fmt.Sprintf("bench-w-%d", workerIdx)

			for {
				if atomic.LoadInt64(&completedCount) >= int64(*numJobs) {
					return
				}

				claimStart := time.Now()
				job, err := pgStore.ClaimJob(ctx, *queue, workerID, 20*time.Second)
				claimLatency := time.Since(claimStart).Seconds() * 1000.0 // ms

				if err != nil {
					continue
				}

				if job == nil {
					// Check if done
					if atomic.LoadInt64(&completedCount) >= int64(*numJobs) {
						return
					}
					time.Sleep(5 * time.Millisecond)
					continue
				}

				queueDelay := time.Since(job.RunAt).Seconds() * 1000.0 // ms

				samplesMu.Lock()
				claimSamples = append(claimSamples, claimLatency)
				queueDelays = append(queueDelays, queueDelay)
				samplesMu.Unlock()

				// Simulate brief execution (1ms CPU/IO)
				time.Sleep(1 * time.Millisecond)

				_ = pgStore.CompleteJob(ctx, job.ID, workerID, []byte(`{"status":"ok"}`))
				atomic.AddInt64(&completedCount, 1)
			}
		}(i)
	}

	wg.Wait()
	drainDuration := time.Since(startDrain)
	throughput := float64(completedCount) / drainDuration.Seconds()

	claimStats := calculatePercentiles(claimSamples)
	delayStats := calculatePercentiles(queueDelays)

	// Phase 3: Output Benchmark Summary Table
	fmt.Printf("[3/3] Results:\n")
	fmt.Println("---------------------------------------------------------------")
	fmt.Printf("Total Jobs Executed:    %d\n", completedCount)
	fmt.Printf("Total Execution Time:   %v\n", drainDuration)
	fmt.Printf("Throughput:             %.2f jobs/sec\n", throughput)
	fmt.Println("---------------------------------------------------------------")
	fmt.Println("Metric                | p50 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Max (ms)")
	fmt.Println("----------------------|----------|----------|----------|----------|---------")
	fmt.Printf("Claim Latency         | %8.2f | %8.2f | %8.2f | %8.2f | %7.2f\n",
		claimStats.P50, claimStats.P90, claimStats.P95, claimStats.P99, claimStats.Max)
	fmt.Printf("Queue Delay           | %8.2f | %8.2f | %8.2f | %8.2f | %7.2f\n",
		delayStats.P50, delayStats.P90, delayStats.P95, delayStats.P99, delayStats.Max)
	fmt.Println("---------------------------------------------------------------")
}
