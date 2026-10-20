package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/distributed-scheduler/job-scheduler/internal/domain"
)

// Store defines the storage operations for distributed job execution.
type Store interface {
	SubmitJob(ctx context.Context, input domain.SubmitJobInput) (*domain.Job, error)
	ClaimJob(ctx context.Context, queue string, workerID string, leaseDuration time.Duration) (*domain.Job, error)
	Heartbeat(ctx context.Context, jobID uuid.UUID, workerID string, extension time.Duration) (time.Time, error)
	CompleteJob(ctx context.Context, jobID uuid.UUID, workerID string, result []byte) error
	FailJob(ctx context.Context, jobID uuid.UUID, workerID string, errMsg string) (bool, time.Time, error)
	ReleaseJob(ctx context.Context, jobID uuid.UUID, workerID string) error
	GetJob(ctx context.Context, jobID uuid.UUID) (*domain.Job, error)
	ListJobs(ctx context.Context, queue string, state domain.JobState, limit int, offset int) ([]domain.Job, error)
	CancelJob(ctx context.Context, jobID uuid.UUID) (*domain.Job, error)
	RequeueDeadLetter(ctx context.Context, jobID uuid.UUID) (*domain.Job, error)

	// Leader Election via Postgres Advisory Lock
	TryAcquireLeaderLock(ctx context.Context, lockKey int64) (bool, error)
	ReleaseLeaderLock(ctx context.Context, lockKey int64) error

	// Cron / Scheduled Jobs
	ListDueCronJobs(ctx context.Context) ([]domain.CronJob, error)
	UpdateCronNextRun(ctx context.Context, id uuid.UUID, nextRun time.Time) error
	CreateCronJob(ctx context.Context, cron domain.CronJob) (*domain.CronJob, error)
}

type PostgresStore struct {
	pool *pgxpool.Pool
	rnd  *rand.Rand
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{
		pool: pool,
		rnd:  rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// SubmitJob inserts a new job into the queue.
// If an idempotency_key is provided and already exists, it handles the collision gracefully.
func (s *PostgresStore) SubmitJob(ctx context.Context, in domain.SubmitJobInput) (*domain.Job, error) {
	if in.Queue == "" {
		in.Queue = "default"
	}
	if in.TenantID == "" {
		in.TenantID = "default"
	}
	if in.MaxAttempts <= 0 {
		in.MaxAttempts = 3
	}

	delaySeconds := int(in.Delay.Seconds())

	query := `
		INSERT INTO jobs (
			idempotency_key, queue, tenant_id, type, payload,
			state, priority, max_attempts, run_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			'queued', $6, $7, NOW() + ($8 * INTERVAL '1 second'), NOW(), NOW()
		)
		RETURNING id, idempotency_key, queue, tenant_id, type, payload,
		          state, priority, max_attempts, attempt, last_error, result,
		          run_at, claimed_by, lease_expires_at, created_at, updated_at, completed_at;
	`

	job := &domain.Job{}
	err := s.pool.QueryRow(ctx, query,
		in.IdempotencyKey,
		in.Queue,
		in.TenantID,
		in.Type,
		in.Payload,
		in.Priority,
		in.MaxAttempts,
		delaySeconds,
	).Scan(
		&job.ID, &job.IdempotencyKey, &job.Queue, &job.TenantID, &job.Type, &job.Payload,
		&job.State, &job.Priority, &job.MaxAttempts, &job.Attempt, &job.LastError, &job.Result,
		&job.RunAt, &job.ClaimedBy, &job.LeaseExpiresAt, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return nil, domain.ErrDuplicateIdempotencyKey
		}
		return nil, fmt.Errorf("failed to submit job: %w", err)
	}

	return job, nil
}

// ClaimJob uses SELECT ... FOR UPDATE SKIP LOCKED with an atomic visibility lease.
// It checks whether a job is claimable using the authoritative database clock (NOW()).
// A job is claimable if:
// 1. state = 'queued' AND run_at <= NOW()
// OR
// 2. state = 'running' AND lease_expires_at <= NOW() (worker crash recovery)
func (s *PostgresStore) ClaimJob(ctx context.Context, queue string, workerID string, leaseDuration time.Duration) (*domain.Job, error) {
	leaseSeconds := int(leaseDuration.Seconds())
	if leaseSeconds <= 0 {
		leaseSeconds = 30
	}

	query := `
		WITH next_job AS (
			SELECT id
			FROM jobs
			WHERE queue = $1
			  AND (
				(state = 'queued' AND run_at <= NOW())
				OR
				(state = 'running' AND lease_expires_at <= NOW())
			  )
			ORDER BY priority DESC, run_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE jobs
		SET state = 'running',
		    attempt = attempt + 1,
		    claimed_by = $2,
		    lease_expires_at = NOW() + ($3 * INTERVAL '1 second'),
		    updated_at = NOW()
		FROM next_job
		WHERE jobs.id = next_job.id
		RETURNING jobs.id, jobs.idempotency_key, jobs.queue, jobs.tenant_id, jobs.type, jobs.payload,
		          jobs.state, jobs.priority, jobs.max_attempts, jobs.attempt, jobs.last_error, jobs.result,
		          jobs.run_at, jobs.claimed_by, jobs.lease_expires_at, jobs.created_at, jobs.updated_at, jobs.completed_at;
	`

	job := &domain.Job{}
	err := s.pool.QueryRow(ctx, query, queue, workerID, leaseSeconds).Scan(
		&job.ID, &job.IdempotencyKey, &job.Queue, &job.TenantID, &job.Type, &job.Payload,
		&job.State, &job.Priority, &job.MaxAttempts, &job.Attempt, &job.LastError, &job.Result,
		&job.RunAt, &job.ClaimedBy, &job.LeaseExpiresAt, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // No jobs available right now
		}
		return nil, fmt.Errorf("failed to claim job: %w", err)
	}

	return job, nil
}

// Heartbeat extends the visibility lease of an active job.
// Safe against lost updates and clock skew: the query checks `lease_expires_at > NOW()`.
// If the lease has already expired, zero rows are affected and ErrLeaseLost is returned.
func (s *PostgresStore) Heartbeat(ctx context.Context, jobID uuid.UUID, workerID string, extension time.Duration) (time.Time, error) {
	extensionSeconds := int(extension.Seconds())
	if extensionSeconds <= 0 {
		extensionSeconds = 30
	}

	query := `
		UPDATE jobs
		SET lease_expires_at = NOW() + ($3 * INTERVAL '1 second'),
		    updated_at = NOW()
		WHERE id = $1
		  AND claimed_by = $2
		  AND state = 'running'
		  AND lease_expires_at > NOW()
		RETURNING lease_expires_at;
	`

	var newExpiry time.Time
	err := s.pool.QueryRow(ctx, query, jobID, workerID, extensionSeconds).Scan(&newExpiry)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return time.Time{}, domain.ErrLeaseLost
		}
		return time.Time{}, fmt.Errorf("heartbeat failed: %w", err)
	}

	return newExpiry, nil
}

// CompleteJob transitions an actively leased job to 'completed' and records its result.
func (s *PostgresStore) CompleteJob(ctx context.Context, jobID uuid.UUID, workerID string, result []byte) error {
	query := `
		UPDATE jobs
		SET state = 'completed',
		    result = $3,
		    completed_at = NOW(),
		    lease_expires_at = NULL,
		    updated_at = NOW()
		WHERE id = $1
		  AND claimed_by = $2
		  AND state = 'running'
		  AND lease_expires_at > NOW();
	`

	cmdTag, err := s.pool.Exec(ctx, query, jobID, workerID, result)
	if err != nil {
		return fmt.Errorf("failed to complete job: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return domain.ErrLeaseLost
	}
	return nil
}

// FailJob records failure information and determines whether to retry or move to dead_letter.
// Retries use exponential backoff with full jitter: delay = rand(0, base * 2^attempt).
func (s *PostgresStore) FailJob(ctx context.Context, jobID uuid.UUID, workerID string, errMsg string) (bool, time.Time, error) {
	// Fetch current attempt & max_attempts within the same transaction or query
	job, err := s.GetJob(ctx, jobID)
	if err != nil {
		return false, time.Time{}, err
	}

	if job.ClaimedBy == nil || *job.ClaimedBy != workerID {
		return false, time.Time{}, domain.ErrLeaseLost
	}

	willRetry := job.Attempt < job.MaxAttempts
	if !willRetry {
		// Exhausted retries -> Dead Letter Queue
		query := `
			UPDATE jobs
			SET state = 'dead_letter',
			    last_error = $2,
			    lease_expires_at = NULL,
			    claimed_by = NULL,
			    updated_at = NOW()
			WHERE id = $1 AND state = 'running';
		`
		_, err := s.pool.Exec(ctx, query, jobID, errMsg)
		return false, time.Time{}, err
	}

	// Calculate exponential backoff with full jitter
	// Base backoff: 2 seconds, Max: 300 seconds
	baseBackoff := 2.0
	maxBackoff := 300.0
	backoffCap := math.Min(maxBackoff, baseBackoff*math.Pow(2, float64(job.Attempt-1)))
	jitteredDelaySeconds := int(rand.Float64() * backoffCap)
	if jitteredDelaySeconds < 1 {
		jitteredDelaySeconds = 1
	}

	query := `
		UPDATE jobs
		SET state = 'queued',
		    last_error = $2,
		    run_at = NOW() + ($3 * INTERVAL '1 second'),
		    lease_expires_at = NULL,
		    claimed_by = NULL,
		    updated_at = NOW()
		WHERE id = $1 AND state = 'running'
		RETURNING run_at;
	`

	var nextRunAt time.Time
	err = s.pool.QueryRow(ctx, query, jobID, errMsg, jitteredDelaySeconds).Scan(&nextRunAt)
	if err != nil {
		return false, time.Time{}, fmt.Errorf("failed to schedule retry: %w", err)
	}

	return true, nextRunAt, nil
}

// ReleaseJob is invoked during graceful shutdown to return a claimed job to 'queued' state immediately.
func (s *PostgresStore) ReleaseJob(ctx context.Context, jobID uuid.UUID, workerID string) error {
	query := `
		UPDATE jobs
		SET state = 'queued',
		    attempt = GREATEST(attempt - 1, 0),
		    claimed_by = NULL,
		    lease_expires_at = NULL,
		    updated_at = NOW()
		WHERE id = $1
		  AND claimed_by = $2
		  AND state = 'running';
	`
	_, err := s.pool.Exec(ctx, query, jobID, workerID)
	return err
}

func (s *PostgresStore) GetJob(ctx context.Context, jobID uuid.UUID) (*domain.Job, error) {
	query := `
		SELECT id, idempotency_key, queue, tenant_id, type, payload,
		       state, priority, max_attempts, attempt, last_error, result,
		       run_at, claimed_by, lease_expires_at, created_at, updated_at, completed_at
		FROM jobs
		WHERE id = $1;
	`
	job := &domain.Job{}
	err := s.pool.QueryRow(ctx, query, jobID).Scan(
		&job.ID, &job.IdempotencyKey, &job.Queue, &job.TenantID, &job.Type, &job.Payload,
		&job.State, &job.Priority, &job.MaxAttempts, &job.Attempt, &job.LastError, &job.Result,
		&job.RunAt, &job.ClaimedBy, &job.LeaseExpiresAt, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrJobNotFound
		}
		return nil, err
	}
	return job, nil
}

func (s *PostgresStore) ListJobs(ctx context.Context, queue string, state domain.JobState, limit int, offset int) ([]domain.Job, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	query := `
		SELECT id, idempotency_key, queue, tenant_id, type, payload,
		       state, priority, max_attempts, attempt, last_error, result,
		       run_at, claimed_by, lease_expires_at, created_at, updated_at, completed_at
		FROM jobs
		WHERE ($1 = '' OR queue = $1)
		  AND ($2 = '' OR state = $2)
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4;
	`
	rows, err := s.pool.Query(ctx, query, queue, string(state), limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []domain.Job
	for rows.Next() {
		var j domain.Job
		err := rows.Scan(
			&j.ID, &j.IdempotencyKey, &j.Queue, &j.TenantID, &j.Type, &j.Payload,
			&j.State, &j.Priority, &j.MaxAttempts, &j.Attempt, &j.LastError, &j.Result,
			&j.RunAt, &j.ClaimedBy, &j.LeaseExpiresAt, &j.CreatedAt, &j.UpdatedAt, &j.CompletedAt,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (s *PostgresStore) CancelJob(ctx context.Context, jobID uuid.UUID) (*domain.Job, error) {
	query := `
		UPDATE jobs
		SET state = 'cancelled',
		    lease_expires_at = NULL,
		    updated_at = NOW()
		WHERE id = $1 AND state IN ('queued', 'running', 'dead_letter')
		RETURNING id, idempotency_key, queue, tenant_id, type, payload,
		          state, priority, max_attempts, attempt, last_error, result,
		          run_at, claimed_by, lease_expires_at, created_at, updated_at, completed_at;
	`
	job := &domain.Job{}
	err := s.pool.QueryRow(ctx, query, jobID).Scan(
		&job.ID, &job.IdempotencyKey, &job.Queue, &job.TenantID, &job.Type, &job.Payload,
		&job.State, &job.Priority, &job.MaxAttempts, &job.Attempt, &job.LastError, &job.Result,
		&job.RunAt, &job.ClaimedBy, &job.LeaseExpiresAt, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrInvalidStateTransition
		}
		return nil, err
	}
	return job, nil
}

func (s *PostgresStore) RequeueDeadLetter(ctx context.Context, jobID uuid.UUID) (*domain.Job, error) {
	query := `
		UPDATE jobs
		SET state = 'queued',
		    attempt = 0,
		    run_at = NOW(),
		    claimed_by = NULL,
		    lease_expires_at = NULL,
		    last_error = NULL,
		    updated_at = NOW()
		WHERE id = $1 AND state = 'dead_letter'
		RETURNING id, idempotency_key, queue, tenant_id, type, payload,
		          state, priority, max_attempts, attempt, last_error, result,
		          run_at, claimed_by, lease_expires_at, created_at, updated_at, completed_at;
	`
	job := &domain.Job{}
	err := s.pool.QueryRow(ctx, query, jobID).Scan(
		&job.ID, &job.IdempotencyKey, &job.Queue, &job.TenantID, &job.Type, &job.Payload,
		&job.State, &job.Priority, &job.MaxAttempts, &job.Attempt, &job.LastError, &job.Result,
		&job.RunAt, &job.ClaimedBy, &job.LeaseExpiresAt, &job.CreatedAt, &job.UpdatedAt, &job.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("job not found or not in dead_letter state: %w", domain.ErrJobNotFound)
		}
		return nil, err
	}
	return job, nil
}

// Leader Election using Postgres Advisory Lock
// PostgreSQL advisory locks provide distributed mutual exclusion without extra coordination systems (e.g. etcd, ZooKeeper).
func (s *PostgresStore) TryAcquireLeaderLock(ctx context.Context, lockKey int64) (bool, error) {
	var acquired bool
	err := s.pool.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", lockKey).Scan(&acquired)
	return acquired, err
}

func (s *PostgresStore) ReleaseLeaderLock(ctx context.Context, lockKey int64) error {
	var released bool
	return s.pool.QueryRow(ctx, "SELECT pg_advisory_unlock($1)", lockKey).Scan(&released)
}

func (s *PostgresStore) ListDueCronJobs(ctx context.Context) ([]domain.CronJob, error) {
	query := `
		SELECT id, name, expression, queue, tenant_id, type, payload,
		       priority, max_attempts, is_active, last_run_at, next_run_at, created_at, updated_at
		FROM cron_jobs
		WHERE is_active = true AND next_run_at <= NOW()
		FOR UPDATE SKIP LOCKED;
	`
	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var crons []domain.CronJob
	for rows.Next() {
		var c domain.CronJob
		err := rows.Scan(
			&c.ID, &c.Name, &c.Expression, &c.Queue, &c.TenantID, &c.Type, &c.Payload,
			&c.Priority, &c.MaxAttempts, &c.IsActive, &c.LastRunAt, &c.NextRunAt, &c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		crons = append(crons, c)
	}
	return crons, nil
}

func (s *PostgresStore) UpdateCronNextRun(ctx context.Context, id uuid.UUID, nextRun time.Time) error {
	query := `
		UPDATE cron_jobs
		SET last_run_at = NOW(),
		    next_run_at = $2,
		    updated_at = NOW()
		WHERE id = $1;
	`
	_, err := s.pool.Exec(ctx, query, id, nextRun)
	return err
}

func (s *PostgresStore) CreateCronJob(ctx context.Context, c domain.CronJob) (*domain.CronJob, error) {
	query := `
		INSERT INTO cron_jobs (
			name, expression, queue, tenant_id, type, payload,
			priority, max_attempts, is_active, next_run_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, NOW(), NOW()
		)
		RETURNING id, name, expression, queue, tenant_id, type, payload,
		          priority, max_attempts, is_active, last_run_at, next_run_at, created_at, updated_at;
	`
	out := &domain.CronJob{}
	err := s.pool.QueryRow(ctx, query,
		c.Name, c.Expression, c.Queue, c.TenantID, c.Type, c.Payload,
		c.Priority, c.MaxAttempts, c.IsActive, c.NextRunAt,
	).Scan(
		&out.ID, &out.Name, &out.Expression, &out.Queue, &out.TenantID, &out.Type, &out.Payload,
		&out.Priority, &out.MaxAttempts, &out.IsActive, &out.LastRunAt, &out.NextRunAt, &out.CreatedAt, &out.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return out, nil
}
