package telemetry

import (
	"context"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

var (
	Tracer = otel.Tracer("distributed-scheduler")

	JobsSubmittedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "scheduler_jobs_submitted_total",
			Help: "Total count of jobs submitted to the queue",
		},
		[]string{"queue", "tenant_id", "type"},
	)

	JobsClaimedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "scheduler_jobs_claimed_total",
			Help: "Total count of jobs claimed by workers",
		},
		[]string{"queue", "worker_id"},
	)

	JobsCompletedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "scheduler_jobs_completed_total",
			Help: "Total count of jobs successfully executed",
		},
		[]string{"queue", "type"},
	)

	JobsFailedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "scheduler_jobs_failed_total",
			Help: "Total count of job execution failures (will retry)",
		},
		[]string{"queue", "type"},
	)

	JobsDeadLetterTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "scheduler_jobs_dead_letter_total",
			Help: "Total count of jobs sent to dead-letter queue after exhausting attempts",
		},
		[]string{"queue", "type"},
	)

	ClaimDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "scheduler_claim_duration_seconds",
			Help:    "Duration spent executing the SELECT FOR UPDATE SKIP LOCKED claim query",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5},
		},
		[]string{"queue"},
	)

	JobExecutionDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "scheduler_job_execution_duration_seconds",
			Help:    "Duration of job payload execution inside worker",
			Buckets: []float64{0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60},
		},
		[]string{"queue", "type"},
	)

	QueueDelayDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "scheduler_queue_delay_seconds",
			Help:    "Time elapsed between scheduled run_at and worker claim timestamp",
			Buckets: []float64{0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300},
		},
		[]string{"queue"},
	)
)

func StartSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	return Tracer.Start(ctx, name)
}
