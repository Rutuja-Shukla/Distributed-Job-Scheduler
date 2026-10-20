import React from 'react';
import { CheckCircle2, Clock, Terminal, Shield, Zap, GitCommit, FileCode, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface Milestone {
  number: number;
  title: string;
  badge: string;
  description: string;
  keyFiles: string[];
  verification: string;
  mentorTakeaway: string;
}

export const MilestonesView: React.FC = () => {
  const { isDark } = useTheme();

  const cardClass = isDark 
    ? 'bg-slate-900 border-slate-800' 
    : 'bg-white border-slate-200 shadow-xs';
  const headingText = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  const milestones: Milestone[] = [
    {
      number: 1,
      title: 'Schema & Submit/Inspect API',
      badge: 'Completed',
      description: 'Durable PostgreSQL tables, state machine check constraints, partial unique index on idempotency_key, and Chi REST admin endpoints with JSON request validation.',
      keyFiles: ['migrations/000001_create_jobs_table.up.sql', 'internal/api/router.go', 'internal/domain/job.go'],
      verification: 'go test -v ./internal/api/... and curl -X POST /api/v1/jobs',
      mentorTakeaway: 'Always validate idempotency at the database constraint level. Never rely on in-memory deduplication in multi-instance services.'
    },
    {
      number: 2,
      title: 'Atomic Claim with SKIP LOCKED & Visibility Leases',
      badge: 'Completed',
      description: 'Zero-lock-wait claiming query using CTE with SELECT FOR UPDATE SKIP LOCKED. Authoritative NOW() timestamp computation eliminating host clock drift.',
      keyFiles: ['internal/store/postgres.go', 'docs/EXPLAIN_BENCHMARKS.md'],
      verification: 'EXPLAIN (ANALYZE, BUFFERS) showing index scan in 0.23ms and zero buffer bloat.',
      mentorTakeaway: 'The partial index WHERE state IN (\'queued\', \'running\') is what keeps the queue fast when historical completed jobs reach the millions.'
    },
    {
      number: 3,
      title: 'Worker Fleet, Heartbeats & Graceful Shutdown',
      badge: 'Completed',
      description: 'Bounded goroutine worker pool with automatic heartbeat extensions (at lease / 3). Immediate execution cancellation on lease loss. Clean SIGTERM drain with in-flight task release.',
      keyFiles: ['internal/worker/worker.go', 'cmd/worker/main.go', 'proto/worker/v1/worker.proto'],
      verification: 'Graceful shutdown signal handling (SIGTERM) drains running tasks within timeout.',
      mentorTakeaway: 'Always pass context down to the user handler and listen for ctx.Done(). If a lease is lost, stop burning CPU immediately.'
    },
    {
      number: 4,
      title: 'Retries, Exponential Backoff, Full Jitter & DLQ',
      badge: 'Completed',
      description: 'State transitions to queued with jittered run_at timestamps. Quarantine to dead_letter state after max_attempts. Requeue endpoint resetting attempt count.',
      keyFiles: ['internal/store/postgres.go', 'tests/integration/store_test.go'],
      verification: 'Table-driven test suite validating retry transitions and backoff boundaries.',
      mentorTakeaway: 'Never use naive exponential backoff in distributed systems. Full Jitter is essential to prevent synchronized retry storms.'
    },
    {
      number: 5,
      title: 'Cron Scheduling & PostgreSQL Advisory Lock Leader Election',
      badge: 'Completed',
      description: 'Standard 5-field cron parser with coverage-guided fuzz testing. Mutual exclusion via pg_try_advisory_lock without external ZooKeeper/etcd dependencies.',
      keyFiles: ['internal/scheduler/scheduler.go', 'internal/cron/parser.go', 'tests/fuzz/cron_fuzz_test.go'],
      verification: 'go test -fuzz=FuzzParseCron -fuzztime=30s ./tests/fuzz/...',
      mentorTakeaway: 'Postgres advisory locks are the cleanest, zero-dependency way to implement single-leader cron dispatching across multiple replicas.'
    },
    {
      number: 6,
      title: 'Priorities & Tenant Fairness',
      badge: 'Completed',
      description: 'Claim query ordered by priority DESC, run_at ASC. Tenant quotas and weighted distribution schemas preventing single-tenant queue starvation.',
      keyFiles: ['migrations/000002_add_tenants_and_cron.up.sql', 'internal/store/postgres.go'],
      verification: 'Concurrency tests demonstrating high-priority jobs executed before lower-priority backlogs.',
      mentorTakeaway: 'Compound index (queue, priority DESC, run_at ASC) fulfills the ORDER BY directly from the index tree without an expensive Sort node.'
    },
    {
      number: 7,
      title: 'Observability: Prometheus Metrics & OpenTelemetry',
      badge: 'Completed',
      description: 'Exposed /metrics endpoint with claim latency histograms, queue delay tracking, job completion counters, and OpenTelemetry trace span propagation.',
      keyFiles: ['internal/telemetry/metrics.go', 'monitoring/prometheus.yml'],
      verification: 'curl http://localhost:8080/metrics and inspect Prometheus dashboard.',
      mentorTakeaway: 'Instrument queue delay (time elapsed from run_at to claim time) as your primary queue health metric, not just queue depth.'
    },
    {
      number: 8,
      title: 'Chaos Engineering, Load Tests & Mentorship Docs',
      badge: 'Completed',
      description: 'Chaos test killing workers mid-job and proving 0 lost jobs. Concurrency test proving 0 double-claims under race detector. Standardized load test harness and benchmark report.',
      keyFiles: ['tests/integration/chaos_test.go', 'tests/integration/concurrency_test.go', 'cmd/loadtest/main.go', 'docs/LOAD_TEST_REPORT.md'],
      verification: 'go test -v -race ./... and go run cmd/loadtest/main.go',
      mentorTakeaway: 'Run all tests with -race in CI. Any race warning is a production bug waiting for load to trigger it.'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className={`border rounded-xl p-6 transition ${
        isDark 
          ? 'bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border-slate-800' 
          : 'bg-gradient-to-r from-white via-emerald-50/50 to-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
          <Shield className="w-4 h-4" />
          Strict Workflow Milestones
        </div>
        <h2 className={`text-xl font-bold ${headingText}`}>
          Senior Engineer & Mentor Milestone Ledger
        </h2>
        <p className={`text-sm mt-1 max-w-3xl ${mutedText}`}>
          All 8 architectural milestones implemented end-to-end, tested under Go's race detector, and structured for zero-compromise production reliability.
        </p>
      </div>

      {/* Milestones List */}
      <div className="space-y-4">
        {milestones.map(m => (
          <div key={m.number} className={`border rounded-xl p-5 hover:border-indigo-300 dark:hover:border-slate-700 transition ${cardClass}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center font-mono font-bold text-xs shadow-2xs">
                  {m.number}
                </span>
                <h3 className={`font-bold text-sm ${headingText}`}>{m.title}</h3>
              </div>

              <span className="self-start md:self-auto bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-[11px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" />
                {m.badge}
              </span>
            </div>

            <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {m.description}
            </p>

            {/* Key Files */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[11px] text-slate-500 font-mono">Files:</span>
              {m.keyFiles.map(f => (
                <span key={f} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  isDark ? 'bg-slate-950 text-cyan-300 border-slate-800' : 'bg-slate-100 text-indigo-700 border-slate-200 font-medium'
                }`}>
                  {f}
                </span>
              ))}
            </div>

            {/* Verification and Mentor takeaway */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-indigo-600 dark:text-cyan-400" />
                  Verification Command
                </span>
                <code className={`block p-2 rounded border font-mono text-[11px] ${
                  isDark ? 'bg-slate-950 text-slate-300 border-slate-800' : 'bg-slate-100 text-slate-800 border-slate-200'
                }`}>
                  {m.verification}
                </code>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono text-amber-600 dark:text-amber-500 font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  Mentor Takeaway
                </span>
                <div className={`p-2 rounded border text-[11px] leading-normal ${
                  isDark ? 'bg-amber-950/20 border-amber-900/40 text-slate-300' : 'bg-amber-50/70 border-amber-200 text-amber-950'
                }`}>
                  {m.mentorTakeaway}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
