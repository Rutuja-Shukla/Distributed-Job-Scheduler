-- Migration 000001: Initial schema for durable job queue
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255),
    queue VARCHAR(64) NOT NULL DEFAULT 'default',
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    state VARCHAR(32) NOT NULL DEFAULT 'queued',
    priority INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    attempt INT NOT NULL DEFAULT 0,
    last_error TEXT,
    result JSONB,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_by VARCHAR(128),
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_job_state CHECK (state IN ('queued', 'running', 'completed', 'failed', 'dead_letter', 'cancelled'))
);

-- Partial unique index on idempotency_key to prevent duplicate submissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key 
    ON jobs (idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- High-performance claim index for SELECT ... FOR UPDATE SKIP LOCKED
-- Matches the WHERE clause and ORDER BY in worker claim queries:
-- WHERE queue = $1 AND (state = 'queued' AND run_at <= NOW() OR state = 'running' AND lease_expires_at <= NOW())
-- ORDER BY priority DESC, run_at ASC
CREATE INDEX IF NOT EXISTS idx_jobs_claimable 
    ON jobs (queue, priority DESC, run_at ASC) 
    WHERE state IN ('queued', 'running');

-- Concurrency tracking index to quickly evaluate running jobs per queue and tenant
CREATE INDEX IF NOT EXISTS idx_jobs_active_concurrency 
    ON jobs (queue, tenant_id) 
    WHERE state = 'running';

-- State & queue inspection index for Admin API
CREATE INDEX IF NOT EXISTS idx_jobs_queue_state 
    ON jobs (queue, state, created_at DESC);
