package domain

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

type JobState string

const (
	StateQueued     JobState = "queued"
	StateRunning    JobState = "running"
	StateCompleted  JobState = "completed"
	StateFailed     JobState = "failed"
	StateDeadLetter JobState = "dead_letter"
	StateCancelled  JobState = "cancelled"
)

var (
	ErrJobNotFound             = errors.New("job not found")
	ErrLeaseLost               = errors.New("lease expired or held by another worker")
	ErrAlreadyClaimed          = errors.New("job is already claimed by another worker")
	ErrDuplicateIdempotencyKey = errors.New("a job with this idempotency key already exists")
	ErrInvalidStateTransition  = errors.New("invalid job state transition")
	ErrConcurrencyLimitReached = errors.New("concurrency limit reached for queue/tenant")
	ErrInvalidCronExpression   = errors.New("invalid cron expression")
)

type Job struct {
	ID             uuid.UUID       `json:"id"`
	IdempotencyKey *string         `json:"idempotency_key,omitempty"`
	Queue          string          `json:"queue"`
	TenantID       string          `json:"tenant_id"`
	Type           string          `json:"type"`
	Payload        json.RawMessage `json:"payload"`
	State          JobState        `json:"state"`
	Priority       int             `json:"priority"`
	MaxAttempts    int             `json:"max_attempts"`
	Attempt        int             `json:"attempt"`
	LastError      *string         `json:"last_error,omitempty"`
	Result         json.RawMessage `json:"result,omitempty"`
	RunAt          time.Time       `json:"run_at"`
	ClaimedBy      *string         `json:"claimed_by,omitempty"`
	LeaseExpiresAt *time.Time      `json:"lease_expires_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
}

type SubmitJobInput struct {
	IdempotencyKey *string         `json:"idempotency_key,omitempty"`
	Queue          string          `json:"queue"`
	TenantID       string          `json:"tenant_id"`
	Type           string          `json:"type"`
	Payload        json.RawMessage `json:"payload"`
	Priority       int             `json:"priority"`
	MaxAttempts    int             `json:"max_attempts"`
	Delay          time.Duration   `json:"delay"`
}

type CronJob struct {
	ID          uuid.UUID       `json:"id"`
	Name        string          `json:"name"`
	Expression  string          `json:"expression"`
	Queue       string          `json:"queue"`
	TenantID    string          `json:"tenant_id"`
	Type        string          `json:"type"`
	Payload     json.RawMessage `json:"payload"`
	Priority    int             `json:"priority"`
	MaxAttempts int             `json:"max_attempts"`
	IsActive    bool            `json:"is_active"`
	LastRunAt   *time.Time      `json:"last_run_at,omitempty"`
	NextRunAt   time.Time       `json:"next_run_at"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type QueueConfig struct {
	Queue          string `json:"queue"`
	TenantID       string `json:"tenant_id"`
	Weight         int    `json:"weight"`
	MaxConcurrency int    `json:"max_concurrency"`
}
