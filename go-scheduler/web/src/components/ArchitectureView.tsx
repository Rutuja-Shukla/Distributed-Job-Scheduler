import React from 'react';
import { 
  ShieldAlert, Clock, Database, RefreshCw, Cpu, Layers, 
  CheckCircle2, XCircle, ArrowRight, Zap, GitCommit, Lock
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ArchitectureView: React.FC = () => {
  const { isDark } = useTheme();

  const cardClass = isDark 
    ? 'bg-slate-900 border-slate-800' 
    : 'bg-white border-slate-200 shadow-xs';
  const subCardClass = isDark
    ? 'bg-slate-950 p-4 rounded-lg border border-slate-800'
    : 'bg-slate-50 p-4 rounded-lg border border-slate-200';
  const headingText = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="space-y-8">
      {/* High-level system architecture */}
      <div className={`border rounded-xl p-6 space-y-4 transition ${cardClass}`}>
        <div className="flex items-center gap-2 text-indigo-600 dark:text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
          <Layers className="w-4 h-4" />
          End-to-End System Topology
        </div>
        <h2 className={`text-xl font-bold ${headingText}`}>
          Decoupled Multi-Worker & Advisory Leader Architecture
        </h2>
        <p className={`text-sm leading-relaxed max-w-3xl ${mutedText}`}>
          The system separates the <strong>Ingestion / Admin Plane</strong> (REST via chi), the <strong>Control Plane</strong> (Scheduler instances coordinating via PostgreSQL Advisory Locks), and the <strong>Execution Fleet</strong> (Workers claiming jobs via <code className="text-indigo-600 dark:text-cyan-300 font-mono text-xs">SELECT ... FOR UPDATE SKIP LOCKED</code>).
        </p>

        {/* Visual Topology Diagram */}
        <div className={`p-6 rounded-xl border overflow-x-auto transition ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}>
          <div className="min-w-[700px] flex flex-col gap-6 items-center">
            {/* Layer 1: Clients */}
            <div className="w-full flex justify-center">
              <div className={`border px-6 py-3 rounded-lg text-center shadow-xs transition ${
                isDark 
                  ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-200' 
                  : 'bg-white border-indigo-200 text-indigo-950'
              }`}>
                <div className="text-xs font-mono text-indigo-600 dark:text-indigo-300 font-bold uppercase">Client Applications & Admin Portal</div>
                <div className={`text-[11px] ${mutedText}`}>HTTP REST /api/v1 (chi v5 router)</div>
              </div>
            </div>

            <div className="text-slate-500 font-mono text-xs">&darr; Submissions with idempotency_key</div>

            {/* Layer 2: Core Engine & DB */}
            <div className="w-full grid grid-cols-3 gap-4">
              {/* Schedulers */}
              <div className={`border p-4 rounded-xl space-y-2 transition ${
                isDark ? 'bg-amber-950/30 border-amber-500/40' : 'bg-white border-amber-200 shadow-xs'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-300 uppercase font-mono">Control Plane</span>
                  <span className="bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold">Advisory Lock</span>
                </div>
                <div className={`text-xs font-semibold ${headingText}`}>Scheduler Instances</div>
                <p className={`text-[11px] leading-normal ${mutedText}`}>
                  Leader election via <code className="text-amber-700 dark:text-amber-300 font-mono">pg_try_advisory_lock</code>. Leader checks due cron jobs and enqueues instances.
                </p>
              </div>

              {/* PostgreSQL Engine */}
              <div className={`border p-4 rounded-xl text-center space-y-2 relative shadow-xs transition ${
                isDark ? 'bg-cyan-950/30 border-cyan-500/50' : 'bg-white border-indigo-200'
              }`}>
                <div className="text-xs font-bold text-indigo-600 dark:text-cyan-300 uppercase font-mono">PostgreSQL 16 Engine</div>
                <div className={`text-xs font-semibold ${headingText}`}>Single Source of Monotonic Time (NOW())</div>
                <div className={`text-[10px] font-mono py-1 px-2 rounded border inline-block ${
                  isDark ? 'text-cyan-200 bg-cyan-950/80 border-cyan-800' : 'text-indigo-700 bg-indigo-50 border-indigo-200 font-semibold'
                }`}>
                  idx_jobs_claimable (Partial B-Tree)
                </div>
                <p className={`text-[11px] leading-normal ${mutedText}`}>
                  Row-level ACID locking, visibility leases, and transactional state transitions.
                </p>
              </div>

              {/* Workers */}
              <div className={`border p-4 rounded-xl space-y-2 transition ${
                isDark ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-white border-emerald-200 shadow-xs'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300 uppercase font-mono">Execution Plane</span>
                  <span className="bg-emerald-100 dark:bg-emerald-400/20 text-emerald-800 dark:text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold">SKIP LOCKED</span>
                </div>
                <div className={`text-xs font-semibold ${headingText}`}>Distributed Worker Fleet</div>
                <p className={`text-[11px] leading-normal ${mutedText}`}>
                  Workers pull claims, maintain heartbeat goroutines, execute handlers, and handle graceful SIGTERM drains.
                </p>
              </div>
            </div>

            <div className="text-slate-500 font-mono text-xs">&darr; Observability Stream</div>

            {/* Layer 3: Telemetry */}
            <div className="w-full flex justify-center gap-6">
              <div className={`border px-5 py-2.5 rounded-lg text-center text-xs transition ${
                isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
              }`}>
                <span className="text-purple-600 dark:text-purple-300 font-mono font-bold">Prometheus /metrics</span>
                <div className="text-[10px] text-slate-500">Claim latencies & Queue delay histograms</div>
              </div>
              <div className={`border px-5 py-2.5 rounded-lg text-center text-xs transition ${
                isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
              }`}>
                <span className="text-blue-600 dark:text-blue-300 font-mono font-bold">OpenTelemetry Traces</span>
                <div className="text-[10px] text-slate-500">Span propagation across claim & execution</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deep-Dive: Delivery Semantics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`border rounded-xl p-6 space-y-3 transition ${cardClass}`}>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-semibold uppercase">
            <CheckCircle2 className="w-4 h-4" />
            What IS Mathematically Guaranteed
          </div>
          <h3 className={`text-base font-bold ${headingText}`}>At-Least-Once Delivery</h3>
          <ul className={`text-xs space-y-2.5 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 font-bold">&bull;</span>
              <span><strong>Zero Lost Jobs:</strong> If a worker node crashes mid-job, the visibility lease expires in PostgreSQL and another worker automatically reclaims it.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 font-bold">&bull;</span>
              <span><strong>Mutual Exclusion:</strong> PostgreSQL row-level locks prevent two healthy workers from ever claiming the same job simultaneously.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 font-bold">&bull;</span>
              <span><strong>Submission Deduplication:</strong> Unique partial index on <code className="text-indigo-600 dark:text-cyan-300 font-mono font-semibold">idempotency_key</code> guarantees duplicate client retries never create duplicate queue items.</span>
            </li>
          </ul>
        </div>

        <div className={`border rounded-xl p-6 space-y-3 transition ${cardClass}`}>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-mono font-semibold uppercase">
            <XCircle className="w-4 h-4" />
            What is NOT Guaranteed (No "Exactly-Once" Myth)
          </div>
          <h3 className={`text-base font-bold ${headingText}`}>Why Exactly-Once is Physically Impossible</h3>
          <p className={`text-xs leading-relaxed ${mutedText}`}>
            In any distributed system, a worker executing external side-effects (e.g. charging a payment gateway or sending an email) can crash <em>after</em> the external system confirms the call but <em>before</em> the worker commits <code className="text-indigo-600 dark:text-cyan-300 font-mono">CompleteJob</code> in PostgreSQL.
          </p>
          <div className={`p-3 rounded-lg border text-xs font-mono ${
            isDark ? 'bg-slate-950 border-slate-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            &rarr; Solution: Workers must pass the job's idempotency_key to downstream external systems so duplicate attempts are deduplicated end-to-end.
          </div>
        </div>
      </div>

      {/* Deep-Dive: Clock Skew & Database Clock Authority */}
      <div className={`border rounded-xl p-6 space-y-4 transition ${cardClass}`}>
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-mono font-semibold uppercase tracking-wider">
          <Clock className="w-4 h-4" />
          Addressing Distributed Clock Skew
        </div>
        <h3 className={`text-base font-bold ${headingText}`}>
          Why We Never Use Go Host System Time For Lease Expiry
        </h3>
        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          Distributed systems run across varied virtual machines and hardware clocks that drift due to hypervisor virtualization, NTP adjustments, or unsynchronized RTCs. If Worker A's host clock is at <code className="text-indigo-600 dark:text-cyan-300 font-mono">10:00:00.000</code> and Worker B's clock is at <code className="text-indigo-600 dark:text-cyan-300 font-mono">10:00:00.600</code> (600ms ahead), trusting host clocks would cause Worker B to claim jobs prematurely before Worker A's lease actually elapsed.
        </p>

        <div className="bg-slate-900 text-slate-100 p-4 rounded-lg border border-slate-800 font-mono text-xs space-y-1 shadow-inner">
          <div className="text-slate-400">// We delegate ALL timestamp evaluations to PostgreSQL:</div>
          <div><span className="text-purple-400">UPDATE</span> jobs</div>
          <div><span className="text-purple-400">SET</span> lease_expires_at = <span className="text-cyan-400 font-bold">NOW()</span> + ($3 * <span className="text-purple-400">INTERVAL</span> <span className="text-emerald-300">'1 second'</span>)</div>
          <div><span className="text-purple-400">WHERE</span> id = $1 <span className="text-purple-400">AND</span> lease_expires_at &gt; <span className="text-cyan-400 font-bold">NOW()</span>;</div>
        </div>

        <p className={`text-xs ${mutedText}`}>
          PostgreSQL's single internal monotonic clock is the authoritative arbiter. Worker nodes can have arbitrary NTP drift without jeopardizing lease correctness or mutual exclusion.
        </p>
      </div>

      {/* Goroutine Lifecycle & Leak Prevention */}
      <div className={`border rounded-xl p-6 space-y-4 transition ${cardClass}`}>
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-mono font-semibold uppercase tracking-wider">
          <Cpu className="w-4 h-4" />
          Goroutine Lifecycle, Context Cancellation & Leak Prevention
        </div>
        <h3 className={`text-base font-bold ${headingText}`}>
          Worker Pool Resource Discipline
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className={subCardClass}>
            <span className={`font-semibold block mb-1 ${headingText}`}>1. Context Cancellation</span>
            <p className={`leading-relaxed ${mutedText}`}>
              Every job execution is bounded by <code className="text-indigo-600 dark:text-cyan-300 font-mono">context.WithCancel</code>. If a heartbeat fails because another worker acquired the lease, the context cancels instantly, halting CPU/IO work immediately.
            </p>
          </div>

          <div className={subCardClass}>
            <span className={`font-semibold block mb-1 ${headingText}`}>2. Deterministic Heartbeat Exit</span>
            <p className={`leading-relaxed ${mutedText}`}>
              Heartbeat tickers run in a sub-goroutine coordinated by <code className="text-indigo-600 dark:text-cyan-300 font-mono">close(hbDone)</code> and <code className="text-indigo-600 dark:text-cyan-300 font-mono">hbWg.Wait()</code>, guaranteeing zero orphaned goroutines or timer leaks after job completion.
            </p>
          </div>

          <div className={subCardClass}>
            <span className={`font-semibold block mb-1 ${headingText}`}>3. Graceful Drain on SIGTERM</span>
            <p className={`leading-relaxed ${mutedText}`}>
              On SIGTERM, the worker stops claiming new tasks, allows active tasks up to a grace timeout to finish, and proactively calls <code className="text-indigo-600 dark:text-cyan-300 font-mono">ReleaseJob</code> so peer workers can claim immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
