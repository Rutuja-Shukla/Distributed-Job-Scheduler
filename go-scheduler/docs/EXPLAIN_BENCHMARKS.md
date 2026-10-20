# Index Design & EXPLAIN ANALYZE Comparison

## The Claim Query Under Investigation

Workers poll PostgreSQL concurrently using the following query:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH next_job AS (
    SELECT id
    FROM jobs
    WHERE queue = 'default'
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
    claimed_by = 'worker-node-1',
    lease_expires_at = NOW() + (30 * INTERVAL '1 second'),
    updated_at = NOW()
FROM next_job
WHERE jobs.id = next_job.id
RETURNING jobs.id, jobs.state, jobs.attempt;
```

---

## 1. BEFORE Optimization: No Index (Sequential Scan)

With 500,000 historical jobs in the table (495,000 completed/dead_letter, 5,000 queued):

```text
QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------
Update on public.jobs  (cost=42158.42..42166.45 rows=1 width=85) (actual time=186.421..186.425 rows=1 loops=1)
  Buffers: shared hit=1420 read=32810
  CTE next_job
    ->  Limit  (cost=42158.40..42158.41 rows=1 width=28) (actual time=186.380..186.381 rows=1 loops=1)
          Output: jobs_1.id, jobs_1.priority, jobs_1.run_at
          Buffers: shared hit=1418 read=32810
          ->  LockRows  (cost=42158.40..43408.40 rows=125 width=28) (actual time=186.379..186.380 rows=1 loops=1)
                Output: jobs_1.id, jobs_1.priority, jobs_1.run_at, jobs_1.ctid
                Buffers: shared hit=1418 read=32810
                ->  Sort  (cost=42158.40..42158.71 rows=125 width=28) (actual time=186.345..186.346 rows=1 loops=1)
                      Output: jobs_1.id, jobs_1.priority, jobs_1.run_at, jobs_1.ctid
                      Sort Key: jobs_1.priority DESC, jobs_1.run_at ASC
                      Sort Method: top-N heapsort  Memory: 25kB
                      Buffers: shared hit=1418 read=32810
                      ->  Seq Scan on public.jobs jobs_1  (cost=0.00..42157.77 rows=125 width=28) (actual time=12.450..185.210 rows=4820 loops=1)
                            Output: jobs_1.id, jobs_1.priority, jobs_1.run_at, jobs_1.ctid
                            Filter: (((jobs_1.queue)::text = 'default'::text) AND ((((jobs_1.state)::text = 'queued'::text) AND (jobs_1.run_at <= now())) OR (((jobs_1.state)::text = 'running'::text) AND (jobs_1.lease_expires_at <= now()))))
                            Rows Removed by Filter: 495180
                            Buffers: shared hit=1418 read=32810
  ->  Nested Loop  (cost=0.01..8.04 rows=1 width=85) (actual time=186.402..186.405 rows=1 loops=1)
        Output: jobs.id, jobs.idempotency_key, jobs.queue, jobs.tenant_id, ...
        Buffers: shared hit=1420 read=32810
        ->  CTE Scan on next_job  (cost=0.00..0.02 rows=1 width=32) (actual time=186.384..186.384 rows=1 loops=1)
              Output: next_job.id
        ->  Index Scan using jobs_pkey on public.jobs  (cost=0.42..8.02 rows=1 width=61) (actual time=0.016..0.017 rows=1 loops=1)
              Output: jobs.ctid, jobs.id
              Index Cond: (jobs.id = next_job.id)
Planning Time: 0.284 ms
Execution Time: 186.512 ms
```

### Analysis of Unindexed Query:
1. **Full Sequential Scan:** Scanned 500,000 rows across 34,228 8KB disk blocks (~270MB of disk I/O per claim query!).
2. **High Execution Time:** 186.5 milliseconds per claim attempt.
3. **Catastrophic Concurrency Penalty:** Under 20 concurrent workers, 20 sequential scans running simultaneously cause buffer pool thrashing, disk saturation, and database lock contention.

---

## 2. AFTER Optimization: Partial Composite B-Tree Index

We create a **partial index** that excludes historical `completed`, `cancelled`, and `dead_letter` rows:

```sql
CREATE INDEX idx_jobs_claimable 
    ON jobs (queue, priority DESC, run_at ASC) 
    WHERE state IN ('queued', 'running');
```

```text
QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------
Update on public.jobs  (cost=0.42..16.48 rows=1 width=85) (actual time=0.182..0.184 rows=1 loops=1)
  Buffers: shared hit=7
  CTE next_job
    ->  Limit  (cost=0.28..8.44 rows=1 width=28) (actual time=0.138..0.139 rows=1 loops=1)
          Output: jobs_1.id, jobs_1.priority, jobs_1.run_at
          Buffers: shared hit=4
          ->  LockRows  (cost=0.28..1024.12 rows=125 width=28) (actual time=0.137..0.138 rows=1 loops=1)
                Output: jobs_1.id, jobs_1.priority, jobs_1.run_at, jobs_1.ctid
                Buffers: shared hit=4
                ->  Index Scan using idx_jobs_claimable on public.jobs jobs_1  (cost=0.28..1022.87 rows=125 width=28) (actual time=0.042..0.045 rows=1 loops=1)
                      Output: jobs_1.id, jobs_1.priority, jobs_1.run_at, jobs_1.ctid
                      Index Cond: ((jobs_1.queue)::text = 'default'::text)
                      Filter: ((((jobs_1.state)::text = 'queued'::text) AND (jobs_1.run_at <= now())) OR (((jobs_1.state)::text = 'running'::text) AND (jobs_1.lease_expires_at <= now())))
                      Buffers: shared hit=4
  ->  Nested Loop  (cost=0.01..8.04 rows=1 width=85) (actual time=0.155..0.158 rows=1 loops=1)
        Output: jobs.id, jobs.idempotency_key, jobs.queue, ...
        Buffers: shared hit=7
        ->  CTE Scan on next_job  (cost=0.00..0.02 rows=1 width=32) (actual time=0.140..0.141 rows=1 loops=1)
              Output: next_job.id
        ->  Index Scan using jobs_pkey on public.jobs  (cost=0.42..8.02 rows=1 width=61) (actual time=0.013..0.014 rows=1 loops=1)
              Output: jobs.ctid, jobs.id
              Index Cond: (jobs.id = next_job.id)
              Buffers: shared hit=3
Planning Time: 0.192 ms
Execution Time: 0.231 ms
```

---

## 3. Comparative Summary

| Metric | Before Index | After Partial Index | Improvement |
| :--- | :--- | :--- | :--- |
| **Execution Time** | **186.51 ms** | **0.23 ms** | **810x faster** |
| **Disk Blocks Read** | 32,810 blocks (~262 MB) | 0 blocks (Cached) | 100% elimination of disk reads |
| **Shared Buffer Hits** | 1,418 hits | 7 hits | 99.5% reduction in memory lookups |
| **Index Size** | N/A | ~48 kB (only active rows) | Negligible storage footprint |
| **Write Amplification** | None | Low (completed jobs never indexed) | Excellent insert/update throughput |

### Why the Partial Index is Crucial:
A non-partial index on `(queue, priority DESC, run_at ASC)` would index all 500,000+ completed jobs over months of execution. The index would bloat to hundreds of megabytes. 

By filtering with `WHERE state IN ('queued', 'running')`, the index **only contains active, pending, or in-flight jobs** (typically only a few dozen to a few thousand rows at any given moment). When a job completes, it is pruned from this partial index immediately, keeping it tiny, cache-resident in RAM, and lightning-fast.
