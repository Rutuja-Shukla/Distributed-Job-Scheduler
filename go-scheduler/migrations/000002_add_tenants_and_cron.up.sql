-- Migration 000002: Add Cron and Scheduled Jobs Table
CREATE TABLE IF NOT EXISTS cron_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL UNIQUE,
    expression VARCHAR(64) NOT NULL,
    queue VARCHAR(64) NOT NULL DEFAULT 'default',
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    priority INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_due 
    ON cron_jobs (next_run_at) 
    WHERE is_active = true;

-- Tenant queue configurations (weights and max concurrency limits)
CREATE TABLE IF NOT EXISTS queue_configs (
    queue VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    weight INT NOT NULL DEFAULT 1,
    max_concurrency INT NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (queue, tenant_id)
);
